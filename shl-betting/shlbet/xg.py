"""Expected goals from shl.se shot coordinates (2023-24 onwards).

Coordinates: x is the distance from the attacked goal line along the rink and
y the lateral offset, both in decimetres (goals have median x 53, i.e. 5.3 m).
Unit: unblocked attempts (goalSection != -3) in periods 1-3, excluding penalty
shots and empty-net goals. Features: distance, angle, and rebound (an attempt
by the same team within 3 seconds of the previous one).

Walk-forward: shots of season s are scored by a model fit only on earlier
seasons. 2023-24 has no earlier season, so it is scored by a model fit on
2023-24 itself; its game xG is therefore used only as *history* for later
games, and xG is evaluated on 2024-25 onwards only.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from .config import PROCESSED


def shot_table() -> pd.DataFrame:
    s = pd.read_csv(PROCESSED / "shlapi_shots.csv.gz", low_memory=False)
    s = s[s.period.astype(str).isin(["1", "2", "3"])].copy()
    s["period"] = s.period.astype(int)
    s = s[(s.section != -3) & ~s.penalty_shot.fillna(False).astype(bool)]
    s = s[~((s.type == "goal") & s.empty_net.fillna(False).astype(bool))]
    s = s[(s.x > -40) & (s.x < 650) & (s.y.abs() < 200)]
    mm, ss = s.time.str.split(":", expand=True).astype(int).T.values
    s["t"] = (s.period - 1) * 1200 + mm * 60 + ss
    s = s.sort_values(["shl_uuid", "t", "event_id"])
    prev_t = s.groupby(["shl_uuid", "team_place"]).t.shift()
    s["rebound"] = ((s.t - prev_t) <= 3).astype(float)
    s["dist"] = np.hypot(s.x.clip(lower=0), s.y) / 10
    s["angle"] = np.degrees(np.arctan2(s.y.abs(), s.x.clip(lower=1)))
    s["goal"] = (s.type == "goal").astype(int)
    return s


def _X(s: pd.DataFrame) -> np.ndarray:
    d = s.dist.values
    return np.column_stack([d, np.log1p(d), s.angle.values, s.angle.values ** 2 / 100, s.rebound.values,
                            s.rebound.values * d])


def score(s: pd.DataFrame) -> pd.Series:
    xg = pd.Series(np.nan, index=s.index)
    seasons = sorted(s.season.unique())
    for i, season in enumerate(seasons):
        tr = s[s.season.isin(seasons[:i])] if i else s[s.season == season]
        m = LogisticRegression(C=1.0, max_iter=2000).fit(_X(tr), tr.goal)
        cur = s.season == season
        xg[cur] = m.predict_proba(_X(s[cur]))[:, 1]
    return xg


def game_xg() -> pd.DataFrame:
    """Per game: home_xg, away_xg (60 min, unblocked, no EN/penalty shots)."""
    s = shot_table()
    s["xg"] = score(s)
    out = s.pivot_table(index="shl_uuid", columns="team_place", values="xg", aggfunc="sum").rename(
        columns={"home": "home_xg", "away": "away_xg"}).reset_index()
    out.to_csv(PROCESSED / "game_xg.csv", index=False)
    return out


if __name__ == "__main__":
    s = shot_table()
    s["xg"] = score(s)
    from sklearn.metrics import log_loss, roc_auc_score
    for season, d in s.groupby("season"):
        print(season, len(d), "goals", d.goal.sum(), "xG", round(d.xg.sum(), 1),
              "AUC", round(roc_auc_score(d.goal, d.xg), 3), "logloss", round(log_loss(d.goal, d.xg), 4),
              "base", round(log_loss(d.goal, np.full(len(d), d.goal.mean())), 4))
    print(game_xg().describe().round(2))
