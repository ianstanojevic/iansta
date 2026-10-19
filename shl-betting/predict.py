r"""Price a Färjestad game from the latest model and the Unibet odds you enter.

Example (Timrå home to Färjestad, odds copied from Unibet before puck drop):

    python predict.py --opp Timrå --away \
        --x 3.30 4.20 1.95 \                  # 1X2 ordinarie tid: hemma, oavgjort, borta
        --ml 2.40 1.58 \                      # matchvinnare inkl. förlängning: hemma, borta
        --hcp FBK -1.5 3.10 --hcp TIK 1.5 1.36 \   # handikapp ordinarie tid
        --tot 5.5 1.85 1.95 \                 # antal mål ordinarie tid: linje, över, under
        --totot 4.5 1.38 2.90 \               # antal mål inkl. förlängning/straffar
        --fbk-goalie Larmi --opp-goalie Johansson   # startmålvakter, när de är bekräftade

Goalies: name the confirmed starters (any part of the name). Then the model
is the one the betting rule was chosen on; without them it projects each
team's most frequent recent starter and uses the early-betting weights.

Market: the current Swedish-book prices are fetched automatically and their
margin-free average is the market view the model is pooled with (as in the
backtest). If that fetch fails, Unibet's own odds are used and it says so.

Stakes are suggested only in markets with a demonstrated edge (totals), when
EV > 2%, at 1/4 Kelly capped at 5% of bankroll. Pre-game prices only.
"""
from __future__ import annotations

import argparse
import math
import sys

import numpy as np
import pandas as pd

from shlbet import live
from shlbet.config import PROCESSED, team_key
from shlbet.models import poisson_matrix, pool
from shlbet.tracker import current_bankroll

# Model and pooling weight per market, chosen in Phase 3 on the tuning seasons.
# late  = confirmed starters, the scenario the betting rule was chosen on
# early = projected starters
WEIGHTS = {
    "late": {"x": ("ft", 0.35), "ml": ("dc", 0.20), "hcp": ("ft", 0.30), "tot": ("ft", 0.95), "totot": ("ft", 0.95)},
    "early": {"x": ("ft", 0.45), "ml": ("dc", 0.35), "hcp": ("ft", 0.35), "tot": ("ft", 0.80), "totot": ("ft", 0.80)},
}
BET_MARKETS = {"tot", "totot"}       # markets admitted by the Phase 3 rule
EV_MIN, KELLY_FRAC, CAP, MIN_STAKE = 0.02, 0.25, 0.05, 1.0

_I, _J = np.meshgrid(np.arange(13), np.arange(13), indexing="ij")


def find_game(opp: str, home: bool, date: str | None):
    g = pd.read_csv(PROCESSED / "games.csv")
    p = pd.read_csv(PROCESSED / "predictions.csv.gz")
    g = g.sort_values(["date", "time", "sh_game_id"]).reset_index(drop=True)
    g["game_idx"] = np.arange(len(g))
    h, a = ("FBK", opp) if home else (opp, "FBK")
    c = g[(g.home == h) & (g.away == a) & ~g.played].sort_values("date")
    if date:
        c = c[c.date == date]
    if c.empty:
        sys.exit(f"Ingen kommande match {h}-{a} hittades i schemat. Kör update_data.py först.")
    row = c.iloc[0]
    nth = int((g[(g.home == h) & (g.away == a) & ~g.played].date < row.date).sum())
    return g, row, p[p.game_idx == row.game_idx].iloc[0], nth


def outcome_probs(m, p_ot, market, **kw):
    """Per side: (win, lose, push) probabilities from a 60-min scoreline matrix."""
    d = _I - _J
    if market == "x":
        h, x = m[d > 0].sum(), m[d == 0].sum()
        a = 1 - h - x
        return [(h, 1 - h, 0), (x, 1 - x, 0), (a, 1 - a, 0)]
    if market == "ml":
        h = m[d > 0].sum() + m[d == 0].sum() * p_ot
        return [(h, 1 - h, 0), (1 - h, h, 0)]
    if market == "hcp":  # one team's handicap, regulation time
        v = (d if kw["side"] == "home" else -d) + kw["line"]
        return [(m[v > 0].sum(), m[v < 0].sum(), m[v == 0].sum())]
    if market in ("tot", "totot"):
        t = _I + _J + (market == "totot") * (d == 0)
        L = kw["line"]
        o, u, ps = m[t > L].sum(), m[t < L].sum(), m[t == L].sum()
        return [(o, u, ps), (u, o, ps)]
    raise ValueError(market)


def evaluate(labels, market, probs, odds, bank, prior, src, scn):
    """Pool the model (conditional on no push) with the market prior, then EV,
    Kelly and stake per side."""
    _, w = WEIGHTS[scn][market]
    cond = np.array([p[0] / (p[0] + p[1]) if p[0] + p[1] > 0 else 0.0 for p in probs])
    if prior is None and len(odds) == len(probs) > 1 and not np.isnan(odds).any():
        inv = 1 / np.array(odds)
        prior, src = inv / inv.sum(), "Unibet"
    pooled = pool(cond, prior, w) if prior is not None else cond
    if prior is None:
        src = "bara modell"
    rows = []
    for name, o, (pw, pl, pp), q in zip(labels, odds, probs, pooled):
        p_win, p_lose = q * (1 - pp), (1 - q) * (1 - pp)
        b = o - 1
        ev = p_win * b - p_lose
        kelly = max(0.0, (b * p_win - p_lose) / (b * (p_win + p_lose))) if b > 0 else 0.0
        stake = math.floor(min(KELLY_FRAC * kelly, CAP) * bank) if market in BET_MARKETS and ev > EV_MIN else 0.0
        rows.append(dict(market=market, bet=name, odds=o, model_p=pw / (pw + pl) if pw + pl else 0, p=q,
                         fair=(p_win + p_lose) / p_win if p_win > 0 else float("inf"), ev=ev, stake=stake,
                         prior=src))
    return rows


def next_game() -> pd.Series:
    g = pd.read_csv(PROCESSED / "games.csv")
    up = g[((g.home == "FBK") | (g.away == "FBK")) & ~g.played].sort_values(["date", "time"])
    if up.empty:
        sys.exit("Ingen kommande Färjestad-match i schemat.")
    return up.iloc[0]


def fill_unibet(args, mo: pd.DataFrame, H: str, A: str) -> bool:
    """Copy Unibet's current prices from the feed into the market arguments."""
    if mo.empty or "Unibetse" not in set(mo.book):
        return False
    u = mo[mo.book == "Unibetse"]

    def price(market, scope, side, line=None):
        q = u[(u.market == market) & (u.side == side)]
        if scope:
            q = q[q.scope == scope]
        if line is not None:
            q = q[q.line == line]
        return float(q.close.iloc[0]) if len(q) and q.close.iloc[0] > 1 else None

    x = [price("HOME_DRAW_AWAY", "FULL_TIME", s) for s in ("home", "draw", "away")]
    args.x = x if all(x) else None
    ml = [price("HOME_AWAY", "FULL_TIME_OVER_TIME", s) for s in ("home", "away")]
    args.ml = ml if all(ml) else None
    args.hcp = []
    for side, team, other in (("home", H, A), ("away", A, H)):
        a, b = price("ASIAN_HANDICAP", None, side, -1.5), price("ASIAN_HANDICAP", None,
                                                                "away" if side == "home" else "home", 1.5)
        if a and b:
            args.hcp += [[team, "-1.5", str(a)], [other, "1.5", str(b)]]
    for scope, dest in (("FULL_TIME", "tot"), ("FULL_TIME_OVER_TIME", "totot")):
        t = u[(u.market == "OVER_UNDER") & (u.scope == scope)].pivot_table(index="line", columns="side",
                                                                          values="close", aggfunc="first")
        if {"over", "under"} <= set(t.columns) and len(t.dropna()):
            t = t.dropna()
            L = (t.over - t.under).abs().idxmin()   # Unibet's main line
            setattr(args, dest, [[L, t.at[L, "over"], t.at[L, "under"]]])
    return bool(args.x or args.tot or args.totot)


def print_fair(ms, p_ot, scn, H, A) -> None:
    rows = []
    m = ms[WEIGHTS[scn]["x"][0]]
    for name, (pw, pl, _) in zip([f"1 {H}", "X", f"2 {A}"], outcome_probs(m, p_ot, "x")):
        rows.append((name, pw))
    for name, (pw, pl, _) in zip([f"{H} inkl. förl.", f"{A} inkl. förl."],
                                 outcome_probs(ms[WEIGHTS[scn]["ml"][0]], p_ot, "ml")):
        rows.append((name, pw))
    for L in (4.5, 5.5):
        for mk, tag in (("tot", "ord. tid"), ("totot", "inkl. förl.")):
            (o, u, ps), _ = outcome_probs(m, p_ot, mk, line=L)
            rows.append((f"Över {L:g} ({tag})", o))
            rows.append((f"Under {L:g} ({tag})", u))
    for name, p in rows:
        print(f"  {name:<26} {p * 100:5.1f} %   rättvisa odds {1 / p:5.2f}")
    print("Spela bara om Unibets odds är klart högre än de rättvisa (och helst på antal mål).")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--next", action="store_true",
                    help="nästa Färjestad-match, med Unibets odds hämtade automatiskt")
    ap.add_argument("--opp", help="motståndare, t.ex. Luleå / LHF")
    loc = ap.add_mutually_exclusive_group()
    loc.add_argument("--home", action="store_true", help="Färjestad spelar hemma")
    loc.add_argument("--away", action="store_true", help="Färjestad spelar borta")
    ap.add_argument("--date", help="matchdatum YYYY-MM-DD (default: nästa match mot motståndaren)")
    ap.add_argument("--fbk-goalie", help="Färjestads bekräftade startmålvakt (del av namnet)")
    ap.add_argument("--opp-goalie", help="motståndarens bekräftade startmålvakt (del av namnet)")
    ap.add_argument("--x", nargs=3, type=float, metavar=("HEMMA", "X", "BORTA"), help="1X2 ordinarie tid")
    ap.add_argument("--ml", nargs=2, type=float, metavar=("HEMMA", "BORTA"), help="matchvinnare inkl. förlängning")
    ap.add_argument("--hcp", nargs=3, action="append", default=[], metavar=("LAG", "LINJE", "ODDS"),
                    help="handikapp ordinarie tid, t.ex. --hcp FBK -1.5 2.90 (kan upprepas)")
    ap.add_argument("--tot", nargs=3, type=float, action="append", default=[], metavar=("LINJE", "ÖVER", "UNDER"),
                    help="antal mål ordinarie tid (kan upprepas)")
    ap.add_argument("--totot", nargs=3, type=float, action="append", default=[], metavar=("LINJE", "ÖVER", "UNDER"),
                    help="antal mål inkl. förlängning och straffar (kan upprepas)")
    ap.add_argument("--bankroll", type=float, help="default: senaste bankrulle i tracker.csv")
    ap.add_argument("--no-fetch", action="store_true", help="hämta inte marknadsodds (jämför mot Unibets)")
    args = ap.parse_args(argv)
    if args.next:
        nxt = next_game()
        args.opp = nxt.away if nxt.home == "FBK" else nxt.home
        args.home, args.away, args.date = nxt.home == "FBK", nxt.away == "FBK", nxt.date
    if not args.opp or not (args.home or args.away):
        ap.error("ange --next, eller --opp och --home/--away")

    opp = team_key(args.opp)
    g, game, pr, nth = find_game(opp, args.home, args.date)
    H, A = game.home, game.away
    bank = args.bankroll or current_bankroll()
    p_ot = float(pr.p_ot)

    # ---- goalies -> model scenario
    if args.fbk_goalie or args.opp_goalie:
        scn = "late"
        named = {"FBK": args.fbk_goalie, opp: args.opp_goalie}
        gk = {t: (live.resolve_goalie(g, t, q) if q else live.expected_goalie(g, t, game.date))
              for t, q in named.items()}
        lh, la = live.lambdas_with_goalies(int(game.game_idx), gk[H], gk[A])
        goalie_note = f"Målvakter: {H} {gk[H]}, {A} {gk[A]}" + ("" if all(named.values()) else " (en gissad)")
    else:
        scn = "early"
        gk = {t: live.expected_goalie(g, t, game.date) for t in (H, A)}
        lh, la = float(pr.fte_lh), float(pr.fte_la)
        goalie_note = (f"Målvakter gissade: {H} {gk[H]}, {A} {gk[A]}. Ange --fbk-goalie/--opp-goalie "
                       "när startarna är bekräftade.")
    ms = {"ft": poisson_matrix(lh, la, pr.dc_rho), "dc": poisson_matrix(pr.dc_lh, pr.dc_la, pr.dc_rho)}

    # ---- market prices from the Swedish books
    mo = pd.DataFrame()
    if not args.no_fetch:
        fid = live.fixture_id(H, A, nth)
        mo = live.market_odds(fid) if fid else pd.DataFrame()
    n_books = mo.book.nunique() if len(mo) else 0

    print(f"\n{game.date} {game.time}  {H} - {A}   (bankrulle {bank:.2f} kr)")
    print(f"Förväntade mål (60 min): {H} {lh:.2f} - {A} {la:.2f}")
    print(goalie_note)
    print(f"Marknad: {n_books} svenska bookmakers hämtade" if n_books else
          "Marknad: kunde inte hämta bookmakers, jämför mot Unibets egna odds")

    if args.next and not any([args.x, args.ml, args.hcp, args.tot, args.totot]):
        filled = fill_unibet(args, mo, H, A)
        if not filled:
            print("Unibet har inte släppt odds för matchen än (brukar komma 1–2 dagar före). "
                  "Modellens rättvisa odds:")
            print_fair(ms, p_ot, scn, H, A)
            return None
        print("Unibets odds hämtade automatiskt.")

    def cons(*a, **k):
        p, n = live.consensus(mo, *a, **k)
        return p, (f"snitt {n} bolag" if n else None)

    rows = []
    if args.x:
        pri, src = cons("HOME_DRAW_AWAY", "FULL_TIME", ["home", "draw", "away"])
        rows += evaluate([f"1 {H}", "X", f"2 {A}"], "x", outcome_probs(ms[WEIGHTS[scn]["x"][0]], p_ot, "x"),
                         args.x, bank, pri, src, scn)
    if args.ml:
        pri, src = cons("HOME_AWAY", "FULL_TIME_OVER_TIME", ["home", "away"])
        rows += evaluate([f"{H} inkl. förl.", f"{A} inkl. förl."], "ml",
                         outcome_probs(ms[WEIGHTS[scn]["ml"][0]], p_ot, "ml"), args.ml, bank, pri, src, scn)
    hcps = [(team_key(t), float(l), float(o)) for t, l, o in args.hcp]
    used = set()
    for i, (t, l, o) in enumerate(hcps):
        if i in used:
            continue
        side = "home" if t == H else "away"
        other = "away" if side == "home" else "home"
        mdl = ms[WEIGHTS[scn]["hcp"][0]]
        j = next((k for k, (t2, l2, _) in enumerate(hcps) if k != i and k not in used and t2 != t and l2 == -l), None)
        pri, src = cons("ASIAN_HANDICAP", None, [side, other], pairs=[(side, l), (other, -l)])
        probs = outcome_probs(mdl, p_ot, "hcp", side=side, line=l)
        labels, odds = [f"{t} {l:+g}"], [o]
        if j is not None:
            t2, l2, o2 = hcps[j]
            probs += outcome_probs(mdl, p_ot, "hcp", side=other, line=l2)
            labels.append(f"{t2} {l2:+g}")
            odds.append(o2)
            used.add(j)
        elif pri is not None:  # one side entered: pool against the market's two-way view
            probs.append((probs[0][1], probs[0][0], probs[0][2]))
            labels.append(None)
            odds.append(float("nan"))
        rows += [r for r in evaluate(labels, "hcp", probs, odds, bank, pri, src, scn) if r["bet"]]
    for mk, lst, scope in (("tot", args.tot, "FULL_TIME"), ("totot", args.totot, "FULL_TIME_OVER_TIME")):
        for L, ov, un in lst:
            pri, src = cons("OVER_UNDER", scope, ["over", "under"], line=L)
            tag = "ord. tid" if mk == "tot" else "inkl. förl."
            rows += evaluate([f"Över {L:g} ({tag})", f"Under {L:g} ({tag})"], mk,
                             outcome_probs(ms[WEIGHTS[scn][mk][0]], p_ot, mk, line=L), [ov, un], bank, pri, src,
                             scn)
    if not rows:
        sys.exit("Ange minst en marknad (--x, --ml, --hcp, --tot, --totot).")

    df = pd.DataFrame(rows)
    show = pd.DataFrame({
        "spel": df.bet, "odds": df.odds, "modell %": (df.model_p * 100).round(1), "vägd %": (df.p * 100).round(1),
        "rättvisa odds": df.fair.round(2), "EV %": (df.ev * 100).round(1), "insats kr": df.stake,
        "jämfört mot": df.prior,
        "status": np.where(df.market.isin(BET_MARKETS), "", "ej bevisat övertag")})
    print()
    print(show.to_string(index=False))
    cand = df[df.market.isin(BET_MARKETS) & (df.ev > EV_MIN) & (df.stake >= MIN_STAKE)]
    print()
    if cand.empty:
        print("BÄSTA SPEL: inget spel.")
    else:
        b = cand.sort_values("ev", ascending=False).iloc[0]
        print(f"BÄSTA SPEL: {b.bet} @ {b.odds:.2f}  insats {b.stake:.0f} kr  (EV {b.ev * 100:+.1f} %)")
        print(f"Logga: python tracker.py add --date {game.date} --opp {opp} --{'home' if args.home else 'away'} "
              f"--market {b.market} --selection \"{b.bet}\" --odds {b.odds} --stake {b.stake:.0f} --prob {b.p:.3f}")
    return df


if __name__ == "__main__":
    main()
