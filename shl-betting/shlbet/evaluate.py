"""Phase 3: strict walk-forward evaluation.

Two betting scenarios, both using only pre-game information:
  early: bet at OPENING prices; projected goalie (feature model 'fte'),
         market prior = opening SE consensus. CLV is measured against close.
  late:  bet at CLOSING prices just before puck drop; confirmed goalie,
         market prior = closing SE consensus (other books' prices visible).

Price taken: Unibet where the feed has it, otherwise bet365.
Everything that is chosen (pooling weight, model, edge threshold, staking) is
chosen on TUNE seasons; TEST (2025-26) and LIVE (2026-27) are only reported.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .backtest import BURN, LIVE, TEST, TUNE
from .config import PROCESSED
from .models import pool

RNG = np.random.default_rng(7)
MARKETS = ["x", "ml", "plh", "pla", "tot"]
SIDES = {"x": ["home", "draw", "away"], "ml": ["home", "away"], "plh": ["home_m15", "away_p15"],
         "pla": ["home_p15", "away_m15"], "tot": ["over", "under"]}
WGRID = np.round(np.arange(0, 1.0001, 0.05), 2)


def load():
    g = pd.read_csv(PROCESSED / "games.csv")
    g = g.sort_values(["date", "time", "sh_game_id"]).reset_index(drop=True)
    g["game_idx"] = np.arange(len(g))
    w = pd.read_csv(PROCESSED / "odds_wide.csv")
    p = pd.read_csv(PROCESSED / "predictions.csv.gz")
    d = g.merge(w, on="fs_id", how="left").merge(p, on="game_idx", how="left")
    return d[d.played].reset_index(drop=True)


# --------------------------------------------------------------- per-market data

def outcomes(d: pd.DataFrame, mk: str, line=None) -> np.ndarray:
    """Outcome index per game: 0/1/2 for sides; for totals 0 over, 1 under, 2 push."""
    h, a = d.home_reg.values, d.away_reg.values
    if mk == "x":
        return np.select([h > a, h == a], [0, 1], 2)
    if mk == "ml":
        return np.where(d.home_final.values > d.away_final.values, 0, 1)
    if mk == "plh":
        return np.where(h - a >= 2, 0, 1)
    if mk == "pla":
        return np.where(h - a > -2, 0, 1)
    if mk in ("tot", "totot"):
        t = h + a + (mk == "totot") * (h == a)
        return np.select([t > line, t < line], [0, 1], 2)
    raise ValueError(mk)


def market_frame(d: pd.DataFrame, mk: str, model: str, when: str) -> pd.DataFrame:
    """Per game: model probs, market fair probs, prices (taken + close), outcome.

    when: 'o' (opening) or 'c' (closing) for the price taken and the market prior.
    """
    rows = []
    if mk != "tot":
        sides = SIDES[mk]
        pm = d[[f"{model}_{mk}_{i}" for i in range(len(sides))]].values if f"{model}_{mk}_0" in d else None
        if pm is None:
            return pd.DataFrame()
        cons = d[[f"cons_{mk}_{s}_{when}" for s in sides]].values
        cons_c = d[[f"cons_{mk}_{s}_c" for s in sides]].values
        ub = d[[f"ub_{mk}_{s}_{when}" for s in sides]].values
        ubc = d[[f"ub_{mk}_{s}_c" for s in sides]].values
        b3 = d[[f"b3_{mk}_{s}_{when}" for s in sides]].values
        b3c = d[[f"b3_{mk}_{s}_c" for s in sides]].values
        use_ub = ~np.isnan(ub).any(axis=1)
        price = np.where(use_ub[:, None], ub, b3)
        close = np.where(use_ub[:, None], ubc, b3c)
        y = outcomes(d, mk)
        push = np.zeros(len(d))
        return dict(pm=pm, cons=cons, cons_c=cons_c, price=price, close=close, y=y, book=np.where(use_ub, "ub", "b3"),
                    push_m=np.zeros_like(pm[:, 0]), d=d, sides=sides, mk=mk)
    # totals: Unibet 60-min main line where present, else bet365's incl-OT line
    n = len(d)
    pm, cons, cons_c, price, close = (np.full((n, 2), np.nan) for _ in range(5))
    pushm, y, book, lines = np.zeros(n), np.full(n, -1), np.array(["b3"] * n, dtype=object), np.full(n, np.nan)
    for i, r in enumerate(d.itertuples()):
        if not np.isnan(getattr(r, f"ub_tot_over_{when}", np.nan)) and not np.isnan(r.tot_line):
            L, tag, book[i] = r.tot_line, "tot", "ub"
            pr = (getattr(r, f"ub_tot_over_{when}"), getattr(r, f"ub_tot_under_{when}"))
            pc = (r.ub_tot_over_c, r.ub_tot_under_c)
            cm = (getattr(r, f"cons_tot_over_{when}", np.nan), getattr(r, f"cons_tot_under_{when}", np.nan))
            cc = (r.cons_tot_over_c, r.cons_tot_under_c)
        elif not np.isnan(getattr(r, "b3ot_tot_line", np.nan)):
            L, tag = r.b3ot_tot_line, "totot"
            pr = (getattr(r, f"b3ot_tot_over_{when}"), getattr(r, f"b3ot_tot_under_{when}"))
            pc = (r.b3ot_tot_over_c, r.b3ot_tot_under_c)
            cm = tuple(1 / np.array(pr) / np.sum(1 / np.array(pr)))
            cc = tuple(1 / np.array(pc) / np.sum(1 / np.array(pc)))
        else:
            continue
        col = f"{model}_{tag}{L}_0"
        if col not in d.columns or np.isnan(d.at[i, col]):
            continue
        o, u, p = d.at[i, col], d.at[i, f"{model}_{tag}{L}_1"], d.at[i, f"{model}_{tag}{L}_2"]
        pm[i] = (o / (o + u), u / (o + u))   # conditional on no push
        pushm[i] = p
        cons[i], cons_c[i], price[i], close[i], lines[i] = cm, cc, pr, pc, L
        h, a = r.home_reg, r.away_reg
        t = h + a + (tag == "totot") * (h == a)
        y[i] = 0 if t > L else 1 if t < L else 2
    return dict(pm=pm, cons=cons, cons_c=cons_c, price=price, close=close, y=y, book=book, push_m=pushm,
                d=d, sides=SIDES["tot"], mk="tot", lines=lines)


def logloss(P, y):
    ok = (y >= 0) & (y < P.shape[1]) & ~np.isnan(P).any(axis=1)
    return -np.mean(np.log(np.clip(P[ok, y[ok]], 1e-12, 1))), ok.sum()


def brier(P, y):
    ok = (y >= 0) & (y < P.shape[1]) & ~np.isnan(P).any(axis=1)
    Y = np.eye(P.shape[1])[y[ok]]
    return np.mean(((P[ok] - Y) ** 2).sum(axis=1))


# ------------------------------------------------------------------- pooling

def fit_weight(f, mask) -> float:
    """Pooling weight on the model (0 = pure market), by log loss on mask."""
    ok = mask & ~np.isnan(f["pm"]).any(axis=1) & ~np.isnan(f["cons"]).any(axis=1)
    best = min(WGRID, key=lambda w: logloss(pool(f["pm"][ok], f["cons"][ok], w), f["y"][ok])[0])
    return float(best)


def wf_pool(f, d: pd.DataFrame) -> tuple[np.ndarray, dict]:
    """Pool model and market with a weight fit walk-forward: the weight used in
    season s is fit only on seasons before s (from 2019-20 on), so even the
    tuning-season numbers are out of sample."""
    P = np.full(f["pm"].shape, np.nan)
    ws = {}
    seasons = sorted(d.season.unique())
    bad = np.isnan(f["pm"]).any(axis=1) | np.isnan(f["cons"]).any(axis=1)
    for s in seasons:
        if s in BURN:
            continue
        prior = (d.season.values < s) & (d.season.values >= "2019-20")
        w = fit_weight(f, prior)
        ws[s] = w
        cur = d.season.values == s
        P[cur] = pool(np.nan_to_num(f["pm"][cur], nan=0.5), np.nan_to_num(f["cons"][cur], nan=0.5), w)
    P[bad] = np.nan
    return P, ws


def paired_gain(Pm, Pk, y, mask, n=4000):
    ok = mask & ~np.isnan(Pm).any(axis=1) & ~np.isnan(Pk).any(axis=1) & (y >= 0) & (y < Pm.shape[1])
    i = np.arange(ok.sum())
    diff = -np.log(Pk[ok][i, y[ok]]) + np.log(Pm[ok][i, y[ok]])
    bs = diff[RNG.integers(0, len(diff), (n, len(diff)))].mean(axis=1)
    return diff.mean(), np.quantile(bs, 0.025), np.quantile(bs, 0.975), (bs > 0).mean(), ok.sum()


# ------------------------------------------------------------------- betting

def candidate_bets(f, P, mask) -> pd.DataFrame:
    """Every (game, side) with a price: probability, EV, Kelly fraction, result."""
    d = f["d"]
    out = []
    n, k = P.shape
    for j in range(k):
        o = f["price"][:, j]
        oc = f["close"][:, j]
        p_w = P[:, j] * (1 - f["push_m"])          # win prob (unconditional)
        p_l = (1 - P[:, j]) * (1 - f["push_m"])    # loss prob
        ev = p_w * (o - 1) - p_l
        b = o - 1
        kelly = np.clip((b * p_w - p_l) / (b * (p_w + p_l)), 0, None)
        res = np.where(f["y"] == j, o - 1, np.where(f["y"] == (2 if f["mk"] == "tot" else -9), 0.0, -1.0))
        if f["mk"] != "tot":
            res = np.where(f["y"] == j, o - 1, -1.0)
        cf = f["cons_c"][:, j]
        clv_ev = (cf * (o - 1) - (1 - cf)) * (1 - f["push_m"])  # push stakes are returned
        ok = mask & ~np.isnan(o) & ~np.isnan(p_w) & (f["y"] >= 0)
        out.append(pd.DataFrame({
            "row": np.where(ok)[0], "market": f["mk"], "side": f["sides"][j], "odds": o[ok], "close": oc[ok],
            "p": p_w[ok], "ev": ev[ok], "kelly": kelly[ok], "res": res[ok], "clv_ev": clv_ev[ok],
            "book": f["book"][ok]}))
    c = pd.concat(out, ignore_index=True)
    c["game_idx"] = d.game_idx.values[c.row]
    c["season"] = d.season.values[c.row]
    c["date"] = d.date.values[c.row]
    c["fbk"] = ((d.home.values == "FBK") | (d.away.values == "FBK"))[c.row]
    return c


def pick_bets(c: pd.DataFrame, thr: float, one_per_game=True, max_odds=6.0) -> pd.DataFrame:
    b = c[(c.ev > thr) & (c.odds <= max_odds)]
    if one_per_game:
        b = b.sort_values("ev", ascending=False).drop_duplicates("game_idx")
    return b.sort_values(["date", "game_idx"])


def simulate(b: pd.DataFrame, rule: str, cap=0.05, bank0=1.0) -> dict:
    """Sequential bankroll path. rule: flat | k1 | k0.5 | k0.25 (fraction of Kelly)."""
    bank, peak, mdd, logg = bank0, bank0, 0.0, 0.0
    staked = 0.0
    for kelly, res in zip(b.kelly.values, b.res.values):
        if rule == "flat":
            s = 0.01 * bank0  # 1% of starting bankroll
        else:
            s = min(float(rule[1:]) * kelly, cap) * bank
        staked += s
        new = bank + s * res
        if new <= 0:
            return dict(final=0.0, log_growth=-np.inf, mdd=1.0, staked=staked)
        logg += np.log(new / bank)
        bank = new
        peak = max(peak, bank)
        mdd = max(mdd, 1 - bank / peak)
    return dict(final=bank, log_growth=logg, mdd=mdd, staked=staked)


def risk_of_ruin(b: pd.DataFrame, rule: str, n_bets: int, sims=2000, ruin=0.5, cap=0.05) -> float:
    """P(bankroll ever falls below `ruin` x start) over n_bets bets resampled
    from the realised bets (keeps their real edge/odds/result mix)."""
    if len(b) == 0:
        return float("nan")
    k, r = b.kelly.values, b.res.values
    hits = 0
    for _ in range(sims):
        i = RNG.integers(0, len(b), n_bets)
        bank = 1.0
        for kk, rr in zip(k[i], r[i]):
            s = 0.01 if rule == "flat" else min(float(rule[1:]) * kk, cap) * bank
            bank += s * rr
            if bank < ruin:
                hits += 1
                break
    return hits / sims


def roi_ci(b: pd.DataFrame, n=5000) -> tuple[float, float, float]:
    if len(b) == 0:
        return (np.nan, np.nan, np.nan)
    r = b.res.values
    boots = r[RNG.integers(0, len(r), (n, len(r)))].mean(axis=1)
    return r.mean(), np.quantile(boots, 0.025), np.quantile(boots, 0.975)


# ------------------------------------------------------------------ naive

def naive_probs(d: pd.DataFrame, mk: str, f) -> np.ndarray:
    """Base rates from all seasons before each game's season."""
    P = np.full(f["pm"].shape, np.nan)
    for s in d.season.unique():
        prior = d.season < s
        cur = (d.season == s).values
        if prior.sum() < 300:
            continue
        if mk == "tot":
            h, a = d.home_reg[prior].values, d.away_reg[prior].values
            for i in np.where(cur)[0]:
                L = f["lines"][i]
                if np.isnan(L):
                    continue
                t = h + a + (f["book"][i] == "b3") * (h == a)
                o, u = (t > L).mean(), (t < L).mean()
                P[i] = (o / (o + u), u / (o + u))
        else:
            y = outcomes(d[prior], mk)
            P[cur] = np.bincount(y, minlength=P.shape[1]) / len(y)
    return P


# ------------------------------------------------------------------ report

MODELS = {"early": ["dc", "fte", "ense"], "late": ["dc", "ft", "ens"]}
RULES = ["flat", "k1", "k0.5", "k0.25"]
THRESH = [0.0, 0.02, 0.04, 0.06, 0.08, 0.10]


def run() -> str:
    d = load()
    tune = d.season.isin(TUNE).values
    test = d.season.isin(TEST).values
    live = d.season.isin(LIVE).values
    L = ["# Phase 3 — walk-forward evaluation", "",
         f"Tune: {', '.join(TUNE)} ({tune.sum()} games). Test (untouched): {TEST[0]} ({test.sum()}). "
         f"Live: {LIVE[0]} ({live.sum()}). Burn-in {', '.join(BURN)} not evaluated.", ""]
    all_cands = {}
    for scn, when in (("early", "o"), ("late", "c")):
        L.append(f"## Scenario: {scn} (bet at {'opening' if when == 'o' else 'closing'} prices)")
        L.append("")
        L.append("### Probability quality (log loss; lower is better)")
        rows = []
        chosen = {}
        gains = []
        for mk in MARKETS:
            base = market_frame(d, mk, MODELS[scn][0], when)
            nv = naive_probs(d, mk, base)
            res = {}
            for nm, P in (("naive", nv), ("market", base["cons"])):
                for per, m in (("tune", tune), ("test", test)):
                    res[(nm, per)] = logloss(P[m], base["y"][m])[0]
            best = None
            for model in MODELS[scn]:
                f = market_frame(d, mk, model, when)
                if not len(f) or np.isnan(f["pm"]).all():
                    continue
                Pp, ws = wf_pool(f, d)
                w = ws[TEST[0]]
                for per, m in (("tune", tune), ("test", test)):
                    res[(model, per)] = logloss(f["pm"][m], f["y"][m])[0]
                    res[(f"{model}+mkt(w={w})", per)] = logloss(Pp[m], f["y"][m])[0]
                tl = logloss(Pp[tune], f["y"][tune])[0]
                if best is None or tl < best[0]:
                    best = (tl, model, w, f, Pp)
            chosen[mk] = best
            n_t = logloss(base["cons"][test], base["y"][test])[1]
            for (nm, per), v in res.items():
                rows.append(dict(market=mk, model=nm, period=per, logloss=v))
            g_t = paired_gain(best[4], best[3]["cons"], best[3]["y"], tune)
            g_s = paired_gain(best[4], best[3]["cons"], best[3]["y"], test)
            gains.append(dict(market=mk, model=best[1], w_test=best[2],
                              tune_gain=g_t[0], tune_lo=g_t[1], tune_hi=g_t[2], tune_p=g_t[3],
                              test_gain=g_s[0], test_lo=g_s[1], test_hi=g_s[2], test_p=g_s[3], test_n=g_s[4]))
            L.append(f"- **{mk}**: chosen on tune = {best[1]} pooled with market (walk-forward weight; "
                     f"weight used for test w={best[2]}) (test n={n_t})")
        t = pd.DataFrame(rows).pivot_table(index=["market", "model"], columns="period", values="logloss")
        L.append("")
        L.append(t[["tune", "test"]].round(4).to_markdown())
        L.append("")
        L.append("### Log-loss gain of the pooled model over the market (paired bootstrap; >0 = beats market)")
        gt = pd.DataFrame(gains)
        L.append(gt.round(4).to_markdown(index=False))
        L.append("")
        # ---- betting
        cands = pd.concat([candidate_bets(c[3], c[4], np.ones(len(d), bool)) for c in chosen.values()],
                          ignore_index=True)
        all_cands[scn] = (cands, chosen)
        tc = cands[cands.season.isin(TUNE)]
        keep = [r.market for r in gt.itertuples()
                if r.tune_gain > 0 and pick_bets(tc[tc.market == r.market], 0.02).res.mean() > 0]
        L.append(f"Markets admitted to the combined strategy (tune log-loss gain > 0 AND tune flat ROI at "
                 f"EV>2% > 0): **{', '.join(keep) or 'none'}**")
        L.append("")
        L += betting_section(cands, scn, keep)
    txt = "\n".join(L)
    out = PROCESSED.parent.parent / "reports"
    out.mkdir(exist_ok=True)
    (out / "phase3_evaluation.md").write_text(txt)
    pd.to_pickle(all_cands, PROCESSED / "eval_cands.pkl")
    return txt


def _stats(b: pd.DataFrame, rule="k0.25") -> dict:
    roi, lo, hi = roi_ci(b)
    sim = simulate(b, rule)
    return dict(bets=len(b), roi=roi, roi_lo=lo, roi_hi=hi, clv_ev=b.clv_ev.mean() if len(b) else np.nan,
                beat_close=(b.odds > b.close).mean() if len(b) else np.nan,
                logG=sim["log_growth"], mdd=sim["mdd"])


def betting_section(c: pd.DataFrame, scn: str, keep: list[str]) -> list[str]:
    L = ["### Betting: per market (EV > 0.04, flat ROI per bet, 95% bootstrap CI; growth/drawdown at 1/4 Kelly, 5% cap)", ""]
    rows = []
    for per, seasons in (("tune", TUNE), ("test", TEST), ("live", LIVE)):
        for mk in MARKETS:
            for fb in (False, True):
                b = pick_bets(c[(c.market == mk) & c.season.isin(seasons) & (c.fbk | (not fb))], 0.04)
                rows.append(dict(period=per, market=mk, subset="FBK" if fb else "all", **_stats(b)))
    t = pd.DataFrame(rows)
    L.append(t.round(4).to_markdown(index=False))
    L.append("")
    # ---- staking/threshold selection on TUNE (single best bet per game, all markets)
    L.append("### Staking and threshold, chosen on TUNE (single best bet per game across markets)")
    grid = []
    c = c[c.market.isin(keep)]
    tc = c[c.season.isin(TUNE)]
    n_season = None
    for thr in THRESH:
        b = pick_bets(tc, thr)
        n_season = max(1, round(len(b) / len(TUNE)))
        for rule in RULES:
            sim = simulate(b, rule)
            grid.append(dict(thr=thr, rule=rule, bets=len(b), roi=b.res.mean() if len(b) else np.nan,
                             logG=sim["log_growth"], mdd=sim["mdd"],
                             ror50=risk_of_ruin(b, rule, n_season, sims=400)))
    gr = pd.DataFrame(grid)
    L.append(gr.round(4).to_markdown(index=False))
    # Constraint: P(bankroll ever halves within one season of bets) <= 1%.
    # (First run used 5%; tightened before looking at test results of any rule
    # it admits, because the model's EV estimates exceed what the closing line implies.)
    ok = gr[(gr.ror50 <= 0.01) & (gr.logG > 0)]
    if ok.empty:
        L.append("\n**No threshold/staking combination has positive log growth with RoR(50%) <= 1% on TUNE. "
                 "Decision: do not bet (or bet only for tracking with minimal stakes).**")
        thr, rule = None, None
    else:
        best = ok.sort_values("logG", ascending=False).iloc[0]
        thr, rule = float(best.thr), best.rule
        L.append(f"\nChosen on TUNE: EV threshold {thr}, staking {rule} (cap 5%).")
    # ---- report the chosen config (or a reference config) on TEST and LIVE
    ref_thr, ref_rule = (thr, rule) if thr is not None else (0.04, "k0.25")
    L.append(f"\n### Out-of-sample result of {'chosen' if thr is not None else 'reference'} config "
             f"(EV>{ref_thr}, {ref_rule})")
    rows = []
    for per, seasons in (("tune", TUNE), ("test", TEST), ("live", LIVE)):
        for fb in (False, True):
            b = pick_bets(c[c.season.isin(seasons) & (c.fbk | (not fb))], ref_thr)
            st = _stats(b, ref_rule)
            st["ror50"] = risk_of_ruin(b, ref_rule, max(1, len(b)), sims=400) if len(b) else np.nan
            st["by_market"] = b.market.value_counts().to_dict()
            rows.append(dict(period=per, subset="FBK" if fb else "all", **st))
    L.append(pd.DataFrame(rows).round(4).to_markdown(index=False))
    L.append("")
    return L


if __name__ == "__main__":
    print(run())
