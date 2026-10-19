"""Completeness and consistency checks -> data/processed/validation_report.md."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import CURRENT_SEASON, PROCESSED


def report() -> str:
    g = pd.read_csv(PROCESSED / "games.csv")
    w = pd.read_csv(PROCESSED / "odds_wide.csv")
    odds = pd.read_csv(PROCESSED / "odds_long.csv.gz")
    p = g[g.played].copy()
    L = ["# Data validation report", ""]

    # ---- completeness
    L.append("## 1. Games per season and source")
    cov = p.groupby("season").agg(
        games=("sh_game_id", "size"), period_scores=("p3_home", "count"), shots=("home_shots", "count"),
        start_goalies=("home_goalie", "count"), fs_event=("fs_id", "count"),
        fs_stats=("fs_home_shots_on_goal", "count"), fs_pp=("fs_home_power_play_pct_d", "count"),
        faceoffs=("fs_home_faceoffs_won", "count"), shlapi=("shl_uuid", "count"),
        blocked=("shl_home_BkS", "count"), rest=("home_rest", "count"))
    L.append(cov.to_markdown())
    L.append("")
    L.append("## 2. Games per team per season (complete seasons must be 26 home + 26 away)")
    per = pd.concat([p.groupby(["season", "home"]).size().rename("h"),
                     p.groupby(["season", "away"]).size().rename("a")], axis=1)
    per.index.names = ["season", "team"]
    bad = per[((per.h != 26) | (per.a != 26)) & (per.index.get_level_values(0) != CURRENT_SEASON)]
    L.append("All complete." if bad.empty else bad.to_markdown())
    cur = per.loc[CURRENT_SEASON] if CURRENT_SEASON in per.index.get_level_values(0) else None
    if cur is not None:
        L.append(f"\nCurrent season {CURRENT_SEASON}: {len(p[p.season == CURRENT_SEASON])} games played; "
                 f"games per team {int((cur.h + cur.a).min())}-{int((cur.h + cur.a).max())}.")
    L.append("")

    # ---- cross-source consistency
    L.append("## 3. Cross-source consistency")
    m = p.dropna(subset=["be_home"])
    sc_ok = ((m.be_home == m.home_final) & (m.be_away == m.away_final))
    L.append(f"- Final score swehockey == betexplorer: {sc_ok.mean():.4f} ({(~sc_ok).sum()} mismatches of {len(m)})")
    if (~sc_ok).any():
        L.append("  - mismatches: " + "; ".join(
            f"{r.date} {r.home}-{r.away} sw {r.home_final:.0f}-{r.away_final:.0f} be {r.be_home:.0f}-{r.be_away:.0f}"
            for r in m[~sc_ok].head(10).itertuples()))
    flag = m.be_flag.fillna("").map({"": 3, "AET": 4, "AfP": 5})
    fl_ok = flag == m.n_periods
    L.append(f"- OT/SO flag swehockey (#periods) == betexplorer (AET/AfP): {fl_ok.mean():.4f} ({(~fl_ok).sum()} mismatches)")
    s = p.dropna(subset=["shl_home_score"])
    if len(s):
        ok = (s.shl_home_score == s.home_final) & (s.shl_away_score == s.away_final)
        L.append(f"- Final score swehockey == shl.se API: {ok.mean():.4f} ({(~ok).sum()} mismatches of {len(s)})")
    reg = p.home_reg - p.away_reg
    ot_ok = ((p.n_periods == 3) & (reg != 0)) | ((p.n_periods >= 4) & (reg == 0))
    L.append(f"- Regulation tie <=> OT played: {ot_ok.mean():.4f} ({(~ot_ok).sum()} violations)")
    winner_ok = np.sign(p.home_final - p.away_final) != 0
    L.append(f"- Every game has a winner after OT/SO: {winner_ok.mean():.4f}")
    f = p.dropna(subset=["fs_home_shots_on_goal", "home_shots"])
    d = (f.fs_home_shots_on_goal - f.home_shots).abs() + (f.fs_away_shots_on_goal - f.away_shots).abs()
    L.append(f"- Shots on goal swehockey vs flashscore: identical {(d == 0).mean():.3f}, within 2: {(d <= 2).mean():.3f}")
    L.append("")

    # ---- odds coverage
    L.append("## 4. Odds coverage (share of played games)")
    pw = p.merge(w, on="fs_id", how="left")
    cols = {
        "avg 1X2 (betexplorer)": "avg_home",
        "Unibet 1X2 close": "ub_x_home_c", "Unibet 1X2 open": "ub_x_home_o",
        "Unibet ML close": "ub_ml_home_c", "Unibet ML open": "ub_ml_home_o",
        "Unibet PL home-1.5 close": "ub_plh_home_m15_c", "Unibet PL away-1.5 close": "ub_pla_away_m15_c",
        "Unibet total close": "ub_tot_over_c", "Unibet total open": "ub_tot_over_o",
        "SE consensus 1X2": "cons_x_home_c", "SE consensus ML": "cons_ml_home_c",
        "SE consensus PL": "cons_plh_home_m15_c", "SE consensus total": "cons_tot_over_c",
    }
    tab = pd.DataFrame({k: pw.groupby("season")[v].apply(lambda x: x.notna().mean()) for k, v in cols.items()})
    L.append(tab.round(3).T.to_markdown())
    L.append("")
    L.append("Bookmakers with 1X2 closing odds, by season (games covered):")
    x = odds[(odds.market == "HOME_DRAW_AWAY") & (odds.side == "home")].merge(p[["fs_id", "season"]], on="fs_id")
    L.append(x.groupby(["book", "season"]).fs_id.nunique().unstack(fill_value=0).to_markdown())
    L.append("")

    # ---- odds sanity
    L.append("## 5. Odds sanity")
    for tag, sides in (("x", ["home", "draw", "away"]), ("ml", ["home", "away"]),
                       ("plh", ["home_m15", "away_p15"]), ("tot", ["over", "under"])):
        c = [f"ub_{tag}_{s}_c" for s in sides]
        if not set(c) <= set(pw.columns):
            continue
        q = pw[c].dropna()
        ovr = (1 / q).sum(axis=1)
        L.append(f"- Unibet {tag} closing overround: median {ovr.median():.4f}, 1-99% [{ovr.quantile(.01):.4f}, {ovr.quantile(.99):.4f}], n={len(q)}")
        oc = [f"ub_{tag}_{s}_o" for s in sides]
        if set(oc) <= set(pw.columns):
            same = (pw[c].values == pw[oc].values).all(axis=1)[pw[oc].notna().all(axis=1)]
            L.append(f"  - share where opening == closing for all sides: {same.mean():.3f}")
    # Home/away identity check: Unibet home price must track the betexplorer average home price.
    q = pw.dropna(subset=["ub_x_home_c", "avg_home"])
    r = np.log(q.ub_x_home_c / q.avg_home)
    r2 = np.log(q.ub_x_home_c / q.avg_away)
    swapped = (r.abs() > 0.25) & (r2.abs() < r.abs())
    L.append(f"- Home/away identity: |log(Unibet home / avg home)| median {r.abs().median():.3f}; "
             f"possible swaps {int(swapped.sum())} of {len(q)}")
    # Closing-line informativeness: devigged consensus probability vs outcome
    q = pw.dropna(subset=["cons_x_home_c"])
    y = np.select([q.home_reg > q.away_reg, q.home_reg == q.away_reg], [0, 1], 2)
    P = q[["cons_x_home_c", "cons_x_draw_c", "cons_x_away_c"]].values
    ll = -np.mean(np.log(P[np.arange(len(q)), y]))
    base = np.bincount(y, minlength=3) / len(y)
    ll0 = -np.mean(np.log(base[y]))
    L.append(f"- 1X2 log loss: SE closing consensus {ll:.4f} vs constant base rate {ll0:.4f} (n={len(q)})")
    L.append(f"- 60-min outcome base rates: home {base[0]:.3f}, draw {base[1]:.3f}, away {base[2]:.3f}")
    L.append("")
    txt = "\n".join(L)
    (PROCESSED / "validation_report.md").write_text(txt)
    return txt


if __name__ == "__main__":
    print(report())
