"""Walk-forward predictions for every game: each game is predicted by models fit
only on games played on earlier dates.

Season roles (fixed before looking at any result):
  2018-19, 2019-20   burn-in (ratings warm-up, no evaluation)
  2020-21 .. 2024-25 tuning: hyperparameters, pooling weights, edge threshold
                     and staking rule are chosen on these seasons only
  2025-26            final untouched test season
  2026-27            live out-of-sample (games so far)
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor
from sklearn.preprocessing import StandardScaler

from . import features as F
from .config import PROCESSED
from .models import DixonColes, Elo, ordered_logit_fit, ordered_logit_predict, poisson_matrix, price

BURN = ["2018-19", "2019-20"]
TUNE = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25"]
TEST = ["2025-26"]
LIVE = ["2026-27"]
TOT_LINES = (4.5, 5.0, 5.5, 6.0, 6.5)


def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    g = pd.read_csv(PROCESSED / "games.csv")
    xg = PROCESSED / "game_xg.csv"
    if xg.exists():
        g = g.merge(pd.read_csv(xg), on="shl_uuid", how="left")
    g = g.sort_values(["date", "time", "sh_game_id"]).reset_index(drop=True)
    g["game_idx"] = np.arange(len(g))
    gl = pd.read_csv(PROCESSED / "swehockey_goalies.csv")
    return g, gl


# ------------------------------------------------------------------------ Elo

def run_elo(g: pd.DataFrame, k=20, hfa=50, mov=1.0, regress=0.3, new_team=-60) -> pd.DataFrame:
    elo = Elo(k, hfa, mov, regress, new_team)
    diff = np.full(len(g), np.nan)
    for season, gs in g.groupby("season", sort=True):
        elo.start_season(season, set(gs.home) | set(gs.away))
        for date, gd in gs.groupby("date", sort=True):
            for r in gd.itertuples():
                diff[r.Index] = elo.diff(r.home, r.away)
            for r in gd.itertuples():
                if r.played:
                    elo.update(r.home, r.away, int(r.home_reg), int(r.away_reg))
    out = pd.DataFrame({"game_idx": g.game_idx, "elo_diff": diff})
    # 1X2 via ordered logit, refit at each season start on all earlier seasons
    y = _y1x2(g)
    P = np.full((len(g), 3), np.nan)
    seasons = sorted(g.season.unique())
    for i, s in enumerate(seasons[1:], 1):
        tr = (g.season < s) & g.played
        params = ordered_logit_fit(diff[tr], y[tr])
        te = (g.season == s).values
        P[te] = ordered_logit_predict(diff[te], params)
    out[["elo_x_h", "elo_x_d", "elo_x_a"]] = P
    return out


def _y1x2(g):
    return np.select([g.home_reg > g.away_reg, g.home_reg == g.away_reg], [0, 1], 2)


# ---------------------------------------------------------------- Dixon-Coles

def run_dc(g: pd.DataFrame, xi=0.003, ridge=2.0, new_team=0.1, window=900) -> pd.DataFrame:
    dates = pd.to_datetime(g.date)
    out = []
    played = g[g.played]
    pdates = pd.to_datetime(played.date)
    for date, gd in g.groupby("date", sort=True):
        d = pd.Timestamp(date)
        tr = played[pdates < d]
        if len(tr) < 200:
            continue
        ago = (d - pd.to_datetime(tr.date)).dt.days.values
        m = DixonColes(xi, ridge, new_team, window).fit(
            tr.home.values, tr.away.values, tr.home_reg.values.astype(float), tr.away_reg.values.astype(float),
            ago.astype(float), set(gd.home) | set(gd.away))
        # P(home wins OT | tie): base rate of earlier OT games, shrunk to 0.5
        ot = tr[tr.ot]
        p_ot = (np.sum(ot.home_final > ot.away_final) + 50) / (len(ot) + 100)
        for r in gd.itertuples():
            lh, la = m.rates(r.home, r.away)
            out.append(dict(game_idx=r.game_idx, dc_lh=lh, dc_la=la, dc_rho=m.rho, p_ot=p_ot))
    return pd.DataFrame(out)


# ---------------------------------------------------------- feature GLM model

FEATS = None


def run_feat(g, side_df, dc, elo, alpha=1e-3, refit_days=28, min_prev=5, goalie_scn="late", use_xg=False) -> pd.DataFrame:
    """Stacked Poisson GLM for goals of the attacking side. Refit every
    `refit_days` on all earlier games (expanding window)."""
    s = side_df.merge(g[["game_idx", "date", "season", "played"]], on="game_idx")
    s = s.merge(dc[["game_idx", "dc_lh", "dc_la"]], on="game_idx").merge(elo[["game_idx", "elo_diff"]], on="game_idx")
    s["dc_log"] = np.where(s.is_home == 1, np.log(s.dc_lh), np.log(s.dc_la))
    s["elo_d"] = np.where(s.is_home == 1, s.elo_diff, -s.elo_diff) / 400
    feats = ["is_home", "dc_log", "elo_d", "o_gsv", "a_gsv", "o_backup", "a_rest", "o_rest", "a_b2b", "o_b2b",
             "a_travel"] + [f"a_{c}" for c in F.FORM] + [f"o_{c}" for c in F.FORM]
    if use_xg:
        feats += [f"a_{c}" for c in F.FORM_XG] + [f"o_{c}" for c in F.FORM_XG]
    global FEATS
    FEATS = feats
    s["d"] = pd.to_datetime(s.date)
    enough = s.groupby("game_idx")["a_e_gf"].transform(lambda x: x.notna().all())
    pred = pd.Series(np.nan, index=s.index)
    start = s.loc[s.season >= "2019-20", "d"].min()
    cut = start
    while cut <= s.d.max():
        nxt = cut + pd.Timedelta(days=refit_days)
        tr = s[(s.d < cut) & s.played & enough]
        te = s[(s.d >= cut) & (s.d < nxt)]
        if len(tr) > 500 and len(te):
            X = tr[feats].astype(float)
            mu = X.mean().fillna(0.0)  # a feature can be all-NaN early on (xG before 2023-24)
            sc = StandardScaler().fit(X.fillna(mu))
            m = PoissonRegressor(alpha=alpha, max_iter=1000)
            m.fit(sc.transform(X.fillna(mu)), tr.goals.astype(float))
            pred[te.index] = m.predict(sc.transform(te[feats].astype(float).fillna(mu)))
        cut = nxt
    s["lam"] = pred
    h = s[s.is_home == 1].set_index("game_idx").lam.rename("ft_lh")
    a = s[s.is_home == 0].set_index("game_idx").lam.rename("ft_la")
    return pd.concat([h, a], axis=1).reset_index()


# ---------------------------------------------------------------- assemble

def prob_columns(prefix: str, lh, la, rho, p_ot) -> dict:
    pr = price(poisson_matrix(lh, la, rho), p_ot, TOT_LINES)
    return _flat(prefix, pr)


def _flat(prefix, pr):
    out = {}
    for k, v in pr.items():
        for i, x in enumerate(v):
            out[f"{prefix}_{k}_{i}"] = x
    return out


def assemble(g, elo, dc, ft_late, ft_early) -> pd.DataFrame:
    df = g[["game_idx"]].merge(elo, on="game_idx", how="left").merge(dc, on="game_idx", how="left")
    df = df.merge(ft_late, on="game_idx", how="left")
    df = df.merge(ft_early.rename(columns={"ft_lh": "fte_lh", "ft_la": "fte_la"}), on="game_idx", how="left")
    rows = []
    for r in df.itertuples():
        row = {"game_idx": r.game_idx}
        if not math.isnan(r.dc_lh if r.dc_lh is not None else float("nan")):
            mdc = poisson_matrix(r.dc_lh, r.dc_la, r.dc_rho)
            row.update(_flat("dc", price(mdc, r.p_ot, TOT_LINES)))
            for tag, lh, la in (("ft", r.ft_lh, r.ft_la), ("fte", r.fte_lh, r.fte_la)):
                if not (isinstance(lh, float) and math.isnan(lh)):
                    mft = poisson_matrix(lh, la, r.dc_rho)
                    row.update(_flat(tag, price(mft, r.p_ot, TOT_LINES)))
                    ens = "ens" if tag == "ft" else "ense"
                    row.update(_flat(ens, price(0.5 * (mdc + mft), r.p_ot, TOT_LINES)))
        rows.append(row)
    return df.merge(pd.DataFrame(rows), on="game_idx", how="left")


# Hyperparameters chosen by log loss on the TUNE seasons only (see README):
#   Elo:  K, home advantage, between-season regression, margin-of-victory exponent
#   DC:   time decay xi per day (half-life ~350 d), ridge, promoted-team prior
#   GLM:  L2 strength alpha (heavy shrinkage won: the features are noisy)
ELO_PARAMS = dict(k=8, hfa=40, regress=0.4, mov=1.0)
DC_PARAMS = dict(xi=0.002, ridge=40.0, new_team=0.15)
GLM_ALPHA = 3.0


def make_predictions() -> pd.DataFrame:
    g, gl = load()
    f = F.build_features(g, gl)
    late = F.side_rows(g, f, "g_sv")
    early = F.side_rows(g, f.assign(is_backup=False), "g_sv_exp")
    elo = run_elo(g, **ELO_PARAMS)
    dc = run_dc(g, **DC_PARAMS)
    ft_l = run_feat(g, late, dc, elo, alpha=GLM_ALPHA)
    ft_e = run_feat(g, early, dc, elo, alpha=GLM_ALPHA)
    pr = assemble(g, elo, dc, ft_l, ft_e)
    pr.to_csv(PROCESSED / "predictions.csv.gz", index=False)
    return pr


if __name__ == "__main__":
    p = make_predictions()
    print(p.shape)
