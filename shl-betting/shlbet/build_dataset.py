"""Merge all sources into data/processed/games.csv and odds tables, and validate.

One row per SHL regular-season game. Timing convention: every column is either
(a) known before puck drop (schedule, odds, rest, travel, starting goalie*) or
(b) a game outcome / in-game statistic. Feature code must only use (b) columns
of *earlier* games. (*Starting goalies are usually confirmed ~1h before puck
drop; that is treated as pre-game information, and listed as a weakness.)
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .config import PROCESSED, TEAMS

SE_BOOKS = ["Unibetse", "bet365", "Expektse", "Coolbet", "MrGreen", "Dbet", "BetMGM.se", "1x2"]


def _haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (TEAMS[a]["lat"], TEAMS[a]["lon"], TEAMS[b]["lat"], TEAMS[b]["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _match(left: pd.DataFrame, right: pd.DataFrame, cols: list[str], tol_days=1) -> pd.DataFrame:
    """Attach right[cols] to left on (season, home, away) with nearest date within tol."""
    l = left.copy()
    l["mdate_"] = pd.to_datetime(l["date"])
    r = right.copy()
    r["mdate_"] = pd.to_datetime(r["date"])
    out = {c: [None] * len(l) for c in cols}
    used = set()
    grp = {k: g for k, g in r.groupby(["season", "home", "away"])}
    for i, row in enumerate(l.itertuples()):
        g = grp.get((row.season, row.home, row.away))
        if g is None:
            continue
        dd = (g["mdate_"] - row.mdate_).abs().dt.days
        cand = dd[(dd <= tol_days) & ~g.index.isin(list(used))]
        if len(cand):
            j = cand.idxmin()
            used.add(j)
            for c in cols:
                out[c][i] = g.at[j, c]
    for c in cols:
        l[c] = out[c]
    return l.drop(columns="mdate_")


def load_sources():
    sw = pd.read_csv(PROCESSED / "swehockey_games.csv")
    be = pd.read_csv(PROCESSED / "betexplorer_games.csv")
    fs = pd.read_csv(PROCESSED / "flashscore_stats.csv")
    shl = pd.read_csv(PROCESSED / "shlapi_games.csv")
    shl["date"] = shl["start"].str[:10]
    chl = pd.read_csv(PROCESSED / "chl_games.csv")
    odds = pd.read_csv(PROCESSED / "odds_long.csv.gz")
    return sw, be, fs, shl, chl, odds


def build() -> pd.DataFrame:
    sw, be, fs, shl, chl, odds = load_sources()
    g = sw.copy()
    # ---- outcomes
    for s in ("home", "away"):
        g[f"{s}_reg"] = g[[f"p{i}_{s}" for i in (1, 2, 3)]].sum(axis=1, min_count=3)
    g["ot"] = g["n_periods"] >= 4
    g["so"] = g["n_periods"] >= 5
    g["played"] = g["home_final"].notna()
    # ---- link betexplorer/flashscore event id (also gives the avg odds + flags)
    be_cols = ["fs_id", "be_home", "be_away", "be_flag", "avg_home", "avg_draw", "avg_away"]
    g = _match(g, be, be_cols)
    g = g.merge(fs.add_prefix("fs_").rename(columns={"fs_fs_id": "fs_id"}), on="fs_id", how="left")
    # ---- SHL API (2023-24+): blocked shots, hits, plus its own final score for cross-checks
    shl_cols = [c for c in shl.columns if c.startswith(("home_", "away_"))] + ["shl_uuid", "overtime", "shootout"]
    shl_cols = [c for c in shl_cols if c not in ("home", "away")]
    sub = shl[["season", "date", "home", "away"] + shl_cols].rename(
        columns={c: "shl_" + c for c in shl_cols if c != "shl_uuid"})
    g = _match(g, sub, [c for c in sub.columns if c not in ("season", "date", "home", "away")])
    # ---- rest / travel / back-to-back, counting CHL games too
    g = add_schedule_context(g, chl)
    g = g.sort_values(["date", "time", "sh_game_id"]).reset_index(drop=True)
    g["game_idx"] = np.arange(len(g))
    g.to_csv(PROCESSED / "games.csv", index=False)
    wide = odds_wide_cached(odds)
    wide.to_csv(PROCESSED / "odds_wide.csv", index=False)
    return g


def add_schedule_context(g: pd.DataFrame, chl: pd.DataFrame) -> pd.DataFrame:
    """Days since each team's previous competitive game and km travelled to this one."""
    apps = []
    for r in g.itertuples():
        apps.append(dict(key=r.Index, team=r.home, date=r.date, loc=r.home, comp="SHL"))
        apps.append(dict(key=r.Index, team=r.away, date=r.date, loc=r.home, comp="SHL"))
    # CHL away venues are abroad; we only know the date, so location = unknown (None)
    for r in chl.itertuples():
        apps.append(dict(key=None, team=r.team, date=r.date, loc=None, comp="CHL"))
    a = pd.DataFrame(apps)
    a["d"] = pd.to_datetime(a["date"])
    a = a.sort_values(["team", "d", "comp"]).reset_index(drop=True)
    a["prev_d"] = a.groupby("team")["d"].shift()
    a["prev_loc"] = a.groupby("team")["loc"].shift()
    a["prev_comp"] = a.groupby("team")["comp"].shift()
    a["rest"] = (a["d"] - a["prev_d"]).dt.days
    a.loc[a["rest"] > 30, "rest"] = np.nan  # season boundary
    a["travel_km"] = [(_haversine(p, l) if isinstance(p, str) and isinstance(l, str) else np.nan)
                      for p, l in zip(a["prev_loc"], a["loc"])]
    a = a[a.comp == "SHL"]
    # map back by (game row, team)
    idx = a.set_index(["key", "team"])
    for side in ("home", "away"):
        keys = list(zip(g.index, g[side]))
        g[f"{side}_rest"] = [idx["rest"].get(k, np.nan) for k in keys]
        g[f"{side}_travel_km"] = [idx["travel_km"].get(k, np.nan) for k in keys]
        g[f"{side}_prev_chl"] = [idx["prev_comp"].get(k, None) == "CHL" for k in keys]
    g["away_trip_km"] = [_haversine(h, a_) for h, a_ in zip(g.home, g.away)]
    return g


# ------------------------------------------------------------------ odds tables

def _devig(prices: list[float]) -> list[float]:
    """Proportional (multiplicative) margin removal."""
    inv = [1 / p for p in prices]
    s = sum(inv)
    return [x / s for x in inv]


# Bump when odds_wide's logic changes; cached rows from another version are discarded.
ODDS_WIDE_VERSION = 3


def odds_wide_cached(odds: pd.DataFrame) -> pd.DataFrame:
    """odds_wide, recomputing only games not already in data/processed/odds_wide.csv.
    Closing odds of a played game never change, so cached rows stay valid."""
    path = PROCESSED / "odds_wide.csv"
    old = pd.read_csv(path) if path.exists() else pd.DataFrame()
    if old.empty or "wide_version" not in old or (old.wide_version != ODDS_WIDE_VERSION).any():
        old = pd.DataFrame(columns=["fs_id"])
    new_ids = set(odds.fs_id) - set(old.fs_id)
    new = odds_wide(odds[odds.fs_id.isin(new_ids)]) if new_ids else pd.DataFrame()
    if len(new):
        new["wide_version"] = ODDS_WIDE_VERSION
    return pd.concat([old[old.fs_id.isin(set(odds.fs_id))], new], ignore_index=True)


def odds_wide(odds: pd.DataFrame) -> pd.DataFrame:
    """Per game: Unibet open/close, best SE close, and SE consensus fair probs.

    Markets: 1X2 (60 min), ML (incl. OT/SO), PL (+/-1.5, identical in both
    scopes because OT is sudden death), TOT at each book's main 60-min line.
    """
    o = odds[odds.book.isin(SE_BOOKS)].copy()
    rows = []
    for fs_id, ev in o.groupby("fs_id"):
        r = {"fs_id": fs_id}
        # 1X2
        x = ev[(ev.market == "HOME_DRAW_AWAY") & (ev.scope == "FULL_TIME")]
        _three_way(r, x, "x", ["home", "draw", "away"])
        # moneyline incl OT
        x = ev[(ev.market == "HOME_AWAY") & (ev.scope == "FULL_TIME_OVER_TIME")]
        _three_way(r, x, "ml", ["home", "away"])
        # puck line: home -1.5 vs away +1.5, and home +1.5 vs away -1.5
        # +/-1.5 settles identically with or without OT (OT is sudden death), so
        # books quoting it "incl. OT" (bet365) are pooled with 60-min quotes
        x = ev[(ev.market == "ASIAN_HANDICAP") & (ev.line.abs() == 1.5)].drop_duplicates(["book", "side", "line"])
        hm = x[((x.side == "home") & (x.line == -1.5)) | ((x.side == "away") & (x.line == 1.5))].copy()
        hm["side"] = hm["side"].map({"home": "home_m15", "away": "away_p15"})
        _three_way(r, hm, "plh", ["home_m15", "away_p15"])
        ap = x[((x.side == "home") & (x.line == 1.5)) | ((x.side == "away") & (x.line == -1.5))].copy()
        ap["side"] = ap["side"].map({"home": "home_p15", "away": "away_m15"})
        _three_way(r, ap, "pla", ["home_p15", "away_m15"])
        # totals (60 min): main line = line whose over/under prices are closest to even at Unibet
        x = ev[(ev.market == "OVER_UNDER") & (ev.scope == "FULL_TIME")]
        _totals(r, x)
        # bet365 only quotes totals incl. OT; kept separately (priced with the OT goal)
        x = ev[(ev.market == "OVER_UNDER") & (ev.scope == "FULL_TIME_OVER_TIME") & (ev.book == "bet365")]
        if not x.empty:
            pv = x.pivot_table(index="line", columns="side", values=["close", "open"], aggfunc="first").dropna()
            if len(pv) and ("close", "over") in pv.columns:
                ln = (pv[("close", "over")] - pv[("close", "under")]).abs().idxmin()
                r.update(b3ot_tot_line=ln, b3ot_tot_over_c=pv.at[ln, ("close", "over")],
                         b3ot_tot_under_c=pv.at[ln, ("close", "under")],
                         b3ot_tot_over_o=pv.at[ln, ("open", "over")], b3ot_tot_under_o=pv.at[ln, ("open", "under")])
        rows.append(r)
    return pd.DataFrame(rows)


def _three_way(r: dict, x: pd.DataFrame, tag: str, sides: list[str]) -> None:
    if x.empty:
        return
    piv_c = x.pivot_table(index="book", columns="side", values="close", aggfunc="first")
    piv_o = x.pivot_table(index="book", columns="side", values="open", aggfunc="first")
    if not set(sides) <= set(piv_c.columns):
        return
    piv_c, piv_o = piv_c[sides].dropna(), piv_o.reindex(columns=sides)
    for book, pre in (("Unibetse", "ub"), ("bet365", "b3")):
        if book in piv_c.index:
            for s in sides:
                r[f"{pre}_{tag}_{s}_c"] = piv_c.at[book, s]
                r[f"{pre}_{tag}_{s}_o"] = piv_o.at[book, s] if book in piv_o.index else np.nan
    if len(piv_c):
        fair_c = np.array([_devig(list(v)) for v in piv_c.values]).mean(axis=0)
        for s, p in zip(sides, fair_c):
            r[f"cons_{tag}_{s}_c"] = p
        po = piv_o.dropna()
        if len(po):
            fair_o = np.array([_devig(list(v)) for v in po.values]).mean(axis=0)
            for s, p in zip(sides, fair_o):
                r[f"cons_{tag}_{s}_o"] = p
        for s in sides:
            r[f"best_{tag}_{s}_c"] = piv_c[s].max()
        r[f"n_books_{tag}"] = len(piv_c)


def _totals(r: dict, x: pd.DataFrame) -> None:
    if x.empty:
        return
    piv = x.pivot_table(index=["book", "line"], columns="side", values=["close", "open"], aggfunc="first")
    if ("close", "over") not in piv.columns or ("close", "under") not in piv.columns:
        return
    piv = piv.dropna(subset=[("close", "over"), ("close", "under")])
    if piv.empty:
        return
    gap = (piv[("close", "over")] - piv[("close", "under")]).abs()
    books = piv.index.get_level_values(0)
    ref = "Unibetse" if "Unibetse" in books else ("bet365" if "bet365" in books else books[0])
    line = gap.loc[ref].idxmin()
    r["tot_line"] = line
    r["tot_line_book"] = ref
    if "Unibetse" in books and line in piv.loc["Unibetse"].index:
        u = piv.loc[("Unibetse", line)]
        r.update(ub_tot_over_c=u[("close", "over")], ub_tot_under_c=u[("close", "under")],
                 ub_tot_over_o=u.get(("open", "over")), ub_tot_under_o=u.get(("open", "under")))
    if "bet365" in books and line in piv.loc["bet365"].index:
        b = piv.loc[("bet365", line)]
        r.update(b3_tot_over_c=b[("close", "over")], b3_tot_under_c=b[("close", "under")],
                 b3_tot_over_o=b.get(("open", "over")), b3_tot_under_o=b.get(("open", "under")))
    same = piv.xs(line, level="line")
    fair = np.array([_devig([a, b]) for a, b in zip(same[("close", "over")], same[("close", "under")])]).mean(axis=0)
    r["cons_tot_over_c"], r["cons_tot_under_c"] = fair
    so = same.dropna(subset=[("open", "over"), ("open", "under")]) if ("open", "over") in same.columns else same.iloc[:0]
    if len(so):
        fo = np.array([_devig([a, b]) for a, b in zip(so[("open", "over")], so[("open", "under")])]).mean(axis=0)
        r["cons_tot_over_o"], r["cons_tot_under_o"] = fo
    r["best_tot_over_c"] = same[("close", "over")].max()
    r["best_tot_under_c"] = same[("close", "under")].max()
    r["n_books_tot"] = len(same)
    # Unibet's own main line may differ from the consensus books' main line
    ubl = gap.loc["Unibetse"].idxmin() if "Unibetse" in books else np.nan
    r["ub_tot_mainline"] = ubl


if __name__ == "__main__":
    df = build()
    print(df.groupby("season").size())
