"""Pre-game features. Every value for game g uses only games strictly before g.

Team form is an exponentially weighted mean over each team's previous games
(half-life in games), carried across seasons. Goalie quality is the starter's
shrunk save percentage over his previous 365 days of SHL games.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

LEAGUE_SV = 0.905
SV_PRIOR_SHOTS = 600.0


def team_log(g: pd.DataFrame) -> pd.DataFrame:
    """Two rows per game (one per team) with that team's for/against stats."""
    cols = {}
    for side, opp in (("home", "away"), ("away", "home")):
        d = pd.DataFrame({
            "game_idx": g.game_idx, "date": g.date, "season": g.season, "team": g[side], "opp": g[opp],
            "is_home": side == "home", "played": g.played,
            "gf": g[f"{side}_reg"], "ga": g[f"{opp}_reg"],
            "sf": g[f"{side}_shots"], "sa": g[f"{opp}_shots"],
            "ff": g[f"{side}_shots"] + g[f"fs_{side}_shots_off_target"],
            "fa": g[f"{opp}_shots"] + g[f"fs_{opp}_shots_off_target"],
            "ppg": g[f"fs_{side}_power_play_pct_n"], "ppo": g[f"fs_{side}_power_play_pct_d"],
            "pkga": g[f"fs_{opp}_power_play_pct_n"], "pko": g[f"fs_{opp}_power_play_pct_d"],
            "fow": g[f"fs_{side}_faceoffs_won"], "fol": g[f"fs_{opp}_faceoffs_won"],
            "goalie": g[f"{side}_goalie"],
            "xgf": g.get(f"{side}_xg"), "xga": g.get(f"{opp}_xg"),
        })
        cols[side] = d
    return pd.concat(cols.values(), ignore_index=True).sort_values(["team", "date", "game_idx"])


def ewm_prev(s: pd.Series, groups: pd.Series, halflife: float) -> pd.Series:
    """EW mean of previous values within group (excludes the current row)."""
    return s.groupby(groups).transform(lambda x: x.shift().ewm(halflife=halflife, ignore_na=True).mean())


def build_features(g: pd.DataFrame, gl: pd.DataFrame, halflife: float = 10.0) -> pd.DataFrame:
    """Returns one row per (game, team) with pre-game form features."""
    t = team_log(g).reset_index(drop=True)
    grp = t["team"]
    for c in ("gf", "ga", "sf", "sa", "ff", "fa", "ppg", "ppo", "pkga", "pko", "fow", "fol", "xgf", "xga"):
        t[f"e_{c}"] = ewm_prev(t[c].astype(float), grp, halflife)
    t["xg_share"] = t.e_xgf / (t.e_xgf + t.e_xga)
    t["pp_pct"] = (t.e_ppg / t.e_ppo).fillna(0.18)
    t["pk_pct"] = (1 - t.e_pkga / t.e_pko).fillna(0.82)
    t["fo_pct"] = (t.e_fow / (t.e_fow + t.e_fol)).fillna(0.5)
    t["sh_share"] = t.e_sf / (t.e_sf + t.e_sa)
    t["ff_share"] = t.e_ff / (t.e_ff + t.e_fa)
    t["n_prev"] = t.groupby("team").cumcount()
    # backup indicator: starter is not the team's most frequent starter in its last 10 games
    t["is_backup"] = _backup_flag(t)
    t["exp_goalie"] = _expected_goalie(t)
    sv = goalie_sv(g, gl)
    t["g_sv"] = [sv.get((gi, gk), LEAGUE_SV) for gi, gk in zip(t.game_idx, t.goalie)]
    t["g_sv_exp"] = [sv.get((gi, gk), LEAGUE_SV) for gi, gk in zip(t.game_idx, t.exp_goalie)]
    # stat columns of the current game must never be used as features
    return t.drop(columns=["gf", "ga", "sf", "sa", "ff", "fa", "ppg", "ppo", "pkga", "pko", "fow", "fol",
                           "xgf", "xga"])


def _backup_flag(t: pd.DataFrame) -> pd.Series:
    out = pd.Series(False, index=t.index)
    for team, d in t.groupby("team"):
        prev = []
        for i, gk in zip(d.index, d.goalie):
            if prev and isinstance(gk, str):
                top = pd.Series(prev[-10:]).mode()
                out[i] = gk not in set(top)
            prev.append(gk)
    return out


def _expected_goalie(t: pd.DataFrame) -> pd.Series:
    """Projected starter before lineups are known: most starts in last 5 games."""
    out = pd.Series(None, index=t.index, dtype=object)
    for team, d in t.groupby("team"):
        prev = []
        for i, gk in zip(d.index, d.goalie):
            if prev:
                out[i] = pd.Series(prev[-5:]).mode().iloc[0]
            if isinstance(gk, str):
                prev.append(gk)
    return out


def goalie_sv(g: pd.DataFrame, gl: pd.DataFrame) -> dict:
    """(game_idx, goalie) -> shrunk save% from that goalie's appearances in the
    365 days before the game. Computed for every goalie of every game date."""
    app = gl.merge(g[["sh_game_id", "game_idx", "date"]], on="sh_game_id")
    app["d"] = pd.to_datetime(app.date)
    by = {k: v.sort_values("d") for k, v in app.groupby("name")}
    out = {}
    for gi, dt, hg, ag in zip(g.game_idx, pd.to_datetime(g.date), g.home_goalie, g.away_goalie):
        for gk in (hg, ag):
            if not isinstance(gk, str):
                continue
            h = by.get(gk)
            if h is None:
                out[(gi, gk)] = LEAGUE_SV
                continue
            m = (h.d < dt) & (h.d >= dt - pd.Timedelta(days=365))
            sv, sh = h.saves[m].sum(), h.shots[m].sum()
            out[(gi, gk)] = (sv + LEAGUE_SV * SV_PRIOR_SHOTS) / (sh + SV_PRIOR_SHOTS)
    return out


FORM = ["e_gf", "e_ga", "e_sf", "e_sa", "e_ff", "e_fa", "pp_pct", "pk_pct", "fo_pct", "sh_share", "ff_share"]
# xG form (2023-24 onwards; NaN earlier, mean-imputed by the GLM)
FORM_XG = ["e_xgf", "e_xga", "xg_share"]


def side_rows(g: pd.DataFrame, f: pd.DataFrame, goalie_col: str = "g_sv") -> pd.DataFrame:
    """Stacked attacking rows: for each game, (home attacking) and (away attacking),
    with the attacker's form, the defender's form and the defending goalie."""
    fi = f.set_index(["game_idx", "team"])
    rows = []
    for side, opp in (("home", "away"), ("away", "home")):
        a = fi.loc[list(zip(g.game_idx, g[side]))].reset_index(drop=True)
        o = fi.loc[list(zip(g.game_idx, g[opp]))].reset_index(drop=True)
        d = pd.DataFrame({"game_idx": g.game_idx.values, "is_home": float(side == "home")})
        for c in FORM + FORM_XG:
            d[f"a_{c}"] = a[c].values
            d[f"o_{c}"] = o[c].values
        d["o_gsv"] = o[goalie_col].values
        d["a_gsv"] = a[goalie_col].values
        d["o_backup"] = o["is_backup"].astype(float).values
        d["a_rest"] = np.clip(g[f"{side}_rest"].fillna(4).values, 0, 5)
        d["o_rest"] = np.clip(g[f"{opp}_rest"].fillna(4).values, 0, 5)
        d["a_b2b"] = (g[f"{side}_rest"] == 1).astype(float).values
        d["o_b2b"] = (g[f"{opp}_rest"] == 1).astype(float).values
        d["a_travel"] = g[f"{side}_travel_km"].fillna(0).values / 1000
        d["goals"] = g[f"{side}_reg"].values
        rows.append(d)
    return pd.concat(rows, ignore_index=True)
