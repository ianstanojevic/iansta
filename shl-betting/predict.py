r"""Price a Färjestad game from the latest model and the Unibet odds you enter.

Example (Färjestad at home to Luleå, odds copied from Unibet):

    python predict.py --opp Luleå --home \
        --x 1.95 4.10 3.30 \                  # 1X2 ordinarie tid: hemma, oavgjort, borta
        --ml 1.62 2.30 \                      # matchvinnare inkl. förlängning: hemma, borta
        --hcp FBK -1.5 2.90 --hcp LHF 1.5 1.40 \   # handikapp ordinarie tid
        --tot 5.5 1.95 1.85 \                 # antal mål ordinarie tid: linje, över, under
        --totot 4.5 1.40 2.85                 # antal mål inkl. förlängning/straffar

Only pre-game prices make sense here: the model knows nothing about a game in
progress. Run `python update_data.py` first so the latest results are in.

The betting rule comes from the Phase 3 evaluation (reports/phase3_verdict.md):
stakes are suggested only in markets with a demonstrated edge (totals), when
EV > 2%, at 1/4 Kelly capped at 5% of bankroll. The other markets are shown
for information and marked as unproven.
"""
from __future__ import annotations

import argparse
import math
import sys

import numpy as np
import pandas as pd

from shlbet.config import PROCESSED, team_key
from shlbet.models import poisson_matrix, pool
from shlbet.tracker import current_bankroll

# Chosen in Phase 3 on the tuning seasons (early scenario: projected goalies,
# since the starter is usually unknown when you bet). Weight = model share in
# the log-linear pool with the margin-free Unibet price.
MODEL = {"x": ("fte", 0.45), "ml": ("dc", 0.35), "hcp": ("fte", 0.35), "tot": ("fte", 0.80), "totot": ("fte", 0.80)}
BET_MARKETS = {"tot", "totot"}       # markets admitted by the Phase 3 rule
EV_MIN, KELLY_FRAC, CAP, MIN_STAKE = 0.02, 0.25, 0.05, 1.0

_I, _J = np.meshgrid(np.arange(13), np.arange(13), indexing="ij")


def find_game(opp: str, home: bool, date: str | None) -> pd.Series:
    g = pd.read_csv(PROCESSED / "games.csv")
    p = pd.read_csv(PROCESSED / "predictions.csv.gz")
    g = g.sort_values(["date", "time", "sh_game_id"]).reset_index(drop=True)
    g["game_idx"] = np.arange(len(g))
    h, a = ("FBK", opp) if home else (opp, "FBK")
    c = g[(g.home == h) & (g.away == a) & ~g.played]
    if date:
        c = c[c.date == date]
    if c.empty:
        sys.exit(f"Ingen kommande match {h}-{a} hittades i schemat. Kör update_data.py först.")
    row = c.sort_values("date").iloc[0]
    return row, p[p.game_idx == row.game_idx].iloc[0]


def matrices(pr: pd.Series) -> dict:
    out = {"dc": poisson_matrix(pr.dc_lh, pr.dc_la, pr.dc_rho)}
    if not math.isnan(pr.get("fte_lh", float("nan"))):
        out["fte"] = poisson_matrix(pr.fte_lh, pr.fte_la, pr.dc_rho)
    else:
        out["fte"] = out["dc"]
    return out


def outcome_probs(m: np.ndarray, p_ot: float, market: str, **kw) -> list[tuple[float, float, float]]:
    """Per side: (win, lose, push) probabilities."""
    d = _I - _J
    if market == "x":
        h, x = m[d > 0].sum(), m[d == 0].sum()
        a = 1 - h - x
        return [(h, 1 - h, 0), (x, 1 - x, 0), (a, 1 - a, 0)]
    if market == "ml":
        h = m[d > 0].sum() + m[d == 0].sum() * p_ot
        return [(h, 1 - h, 0), (1 - h, h, 0)]
    if market == "hcp":  # 60-min handicap for one team: wins if margin + line > 0
        margin = d if kw["side"] == "home" else -d
        v = margin + kw["line"]
        return [(m[v > 0].sum(), m[v < 0].sum(), m[v == 0].sum())]
    if market in ("tot", "totot"):
        t = _I + _J + (market == "totot") * (d == 0)
        L = kw["line"]
        o, u, ps = m[t > L].sum(), m[t < L].sum(), m[t == L].sum()
        return [(o, u, ps), (u, o, ps)]
    raise ValueError(market)


def evaluate(label, market, probs, odds, bankroll):
    """probs: per side (win, lose, push) from the model; odds: Unibet prices.
    The model is pooled with Unibet's margin-free price (conditional on no push)."""
    model, w = MODEL[market]
    rows = []
    cond = np.array([p[0] / (p[0] + p[1]) if p[0] + p[1] > 0 else 0 for p in probs])
    if len(odds) == len(probs) and len(odds) > 1 and all(o > 1 for o in odds):
        mk = (1 / np.array(odds)) / (1 / np.array(odds)).sum()
        pooled = pool(cond, mk, w)
    else:
        pooled = cond  # one-sided price: no margin-free market to pool with
    for name, o, (pw, pl, pp), q in zip(label, odds, probs, pooled):
        p_win = q * (1 - pp)
        p_lose = (1 - q) * (1 - pp)
        ev = p_win * (o - 1) - p_lose
        b = o - 1
        kelly = max(0.0, (b * p_win - p_lose) / (b * (p_win + p_lose))) if b > 0 else 0.0
        fair = (p_win + p_lose) / p_win if p_win > 0 else float("inf")
        stake = 0.0
        if market in BET_MARKETS and ev > EV_MIN:
            stake = math.floor(min(KELLY_FRAC * kelly, CAP) * bankroll)
        rows.append(dict(market=market, bet=name, odds=o, model_p=pw / (pw + pl) if pw + pl else 0,
                         p=q, fair=fair, ev=ev, kelly=kelly, stake=stake, push=pp))
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--opp", required=True, help="motståndare, t.ex. Luleå / LHF")
    loc = ap.add_mutually_exclusive_group(required=True)
    loc.add_argument("--home", action="store_true", help="Färjestad spelar hemma")
    loc.add_argument("--away", action="store_true", help="Färjestad spelar borta")
    ap.add_argument("--date", help="matchdatum YYYY-MM-DD (default: nästa match mot motståndaren)")
    ap.add_argument("--x", nargs=3, type=float, metavar=("HEMMA", "X", "BORTA"), help="1X2 ordinarie tid")
    ap.add_argument("--ml", nargs=2, type=float, metavar=("HEMMA", "BORTA"), help="matchvinnare inkl. förlängning")
    ap.add_argument("--hcp", nargs=3, action="append", default=[], metavar=("LAG", "LINJE", "ODDS"),
                    help="handikapp ordinarie tid, t.ex. --hcp FBK -1.5 2.90 (kan upprepas)")
    ap.add_argument("--tot", nargs=3, type=float, action="append", default=[], metavar=("LINJE", "ÖVER", "UNDER"),
                    help="antal mål ordinarie tid (kan upprepas)")
    ap.add_argument("--totot", nargs=3, type=float, action="append", default=[], metavar=("LINJE", "ÖVER", "UNDER"),
                    help="antal mål inkl. förlängning och straffar (kan upprepas)")
    ap.add_argument("--bankroll", type=float, help="default: senaste bankrulle i tracker.csv")
    args = ap.parse_args(argv)

    opp = team_key(args.opp)
    game, pr = find_game(opp, args.home, args.date)
    bank = args.bankroll or current_bankroll()
    ms = matrices(pr)
    p_ot = float(pr.p_ot)
    H, A = game.home, game.away
    print(f"\n{game.date} {game.time}  {H} - {A}   (bankrulle {bank:.2f} kr)")
    print(f"Modellens förväntade mål (60 min): {H} {pr.fte_lh:.2f} - {A} {pr.fte_la:.2f}"
          if not math.isnan(pr.get("fte_lh", float("nan"))) else "")
    rows = []
    if args.x:
        rows += evaluate([f"1 {H}", "X", f"2 {A}"], "x", outcome_probs(ms[MODEL["x"][0]], p_ot, "x"), args.x, bank)
    if args.ml:
        rows += evaluate([f"{H} inkl. förl.", f"{A} inkl. förl."], "ml",
                         outcome_probs(ms[MODEL["ml"][0]], p_ot, "ml"), args.ml, bank)
    hcps = [(team_key(t), float(l), float(o)) for t, l, o in args.hcp]
    done = set()
    for i, (t, l, o) in enumerate(hcps):
        if i in done:
            continue
        side = "home" if t == H else "away"
        pair = next((j for j, (t2, l2, _) in enumerate(hcps) if j != i and j not in done and t2 != t and l2 == -l), None)
        probs = outcome_probs(ms[MODEL["hcp"][0]], p_ot, "hcp", side=side, line=l)
        labels, odds = [f"{t} {l:+g}"], [o]
        if pair is not None:
            t2, l2, o2 = hcps[pair]
            probs += outcome_probs(ms[MODEL["hcp"][0]], p_ot, "hcp", side="away" if side == "home" else "home", line=l2)
            labels.append(f"{t2} {l2:+g}")
            odds.append(o2)
            done.add(pair)
        rows += evaluate(labels, "hcp", probs, odds, bank)
    for mk, lst in (("tot", args.tot), ("totot", args.totot)):
        for L, ov, un in lst:
            tag = "ord. tid" if mk == "tot" else "inkl. förl."
            rows += evaluate([f"Över {L:g} ({tag})", f"Under {L:g} ({tag})"], mk,
                             outcome_probs(ms[MODEL[mk][0]], p_ot, mk, line=L), [ov, un], bank)
    if not rows:
        sys.exit("Ange minst en marknad (--x, --ml, --hcp, --tot, --totot).")
    df = pd.DataFrame(rows)
    show = df.assign(**{"modell": (df.model_p * 100).round(1), "vägd": (df.p * 100).round(1),
                        "rättvisa odds": df.fair.round(2), "EV %": (df.ev * 100).round(1),
                        "status": np.where(df.market.isin(BET_MARKETS), "", "ej bevisat övertag")})
    print()
    print(show[["bet", "odds", "modell", "vägd", "rättvisa odds", "EV %", "stake", "status"]]
          .rename(columns={"bet": "spel", "stake": "insats kr"}).to_string(index=False))
    cand = df[df.market.isin(BET_MARKETS) & (df.ev > EV_MIN) & (df.stake >= MIN_STAKE)]
    print()
    if cand.empty:
        print("BÄSTA SPEL: inget spel (ingen marknad med bevisat övertag har EV > 2 %).")
    else:
        b = cand.sort_values("ev", ascending=False).iloc[0]
        print(f"BÄSTA SPEL: {b.bet} @ {b.odds:.2f}  insats {b.stake:.0f} kr  "
              f"(EV {b.ev * 100:+.1f} %, vägd sannolikhet {b.p * 100:.1f} %, rättvisa odds {b.fair:.2f})")
        print(f"Logga: python tracker.py add --date {game.date} --opp {opp} --{'home' if args.home else 'away'} "
              f"--market {b.market} --selection \"{b.bet}\" --odds {b.odds} --stake {b.stake:.0f} --prob {b.p:.3f}")
    print("\nVarning: övertaget är litet och inte statistiskt säkert (se reports/phase3_verdict.md).")
    return df


if __name__ == "__main__":
    main()
