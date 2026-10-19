"""Pre-game inputs for one upcoming game: confirmed goalies and live market odds.

Goalies: the feature model is refit on every played game (same features and
alpha as the backtest) and evaluated with the starting goalies you name, so
the price matches the 'late' scenario the betting rule was chosen on.

Market: the current Swedish-book prices are fetched from the Livesport odds
service, and their margin-free average is what the model is pooled with, as
in the backtest. Unibet's own price is only the fallback.
"""
from __future__ import annotations

import unicodedata

import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor
from sklearn.preprocessing import StandardScaler

from . import backtest as B
from . import features as F
from .build_dataset import SE_BOOKS
from .config import PROCESSED

# ------------------------------------------------------------------ goalies


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def team_goalies(g: pd.DataFrame, team: str) -> list[str]:
    """Goalies who started for `team` this season or last, most starts first."""
    seasons = sorted(g.season.unique())[-2:]
    r = g[g.season.isin(seasons) & g.played]
    names = pd.concat([r.loc[r.home == team, "home_goalie"], r.loc[r.away == team, "away_goalie"]])
    return names.value_counts().index.tolist()


def resolve_goalie(g: pd.DataFrame, team: str, query: str) -> str:
    opts = team_goalies(g, team)
    hits = [n for n in opts if _fold(query) in _fold(n)]
    if len(hits) == 1:
        return hits[0]
    if not hits:
        raise SystemExit(f"Ingen målvakt som matchar '{query}' för {team}. Kända: {', '.join(opts)}")
    raise SystemExit(f"'{query}' är tvetydigt för {team}: {', '.join(hits)}")


def goalie_sv(gl: pd.DataFrame, g: pd.DataFrame, name: str, date: str) -> float:
    app = gl[gl.name == name].merge(g[["sh_game_id", "date"]], on="sh_game_id")
    d = pd.Timestamp(date)
    app = app[(pd.to_datetime(app.date) < d) & (pd.to_datetime(app.date) >= d - pd.Timedelta(days=365))]
    return (app.saves.sum() + F.LEAGUE_SV * F.SV_PRIOR_SHOTS) / (app.shots.sum() + F.SV_PRIOR_SHOTS)


def is_backup(g: pd.DataFrame, team: str, name: str, date: str) -> bool:
    r = g[g.played & (g.date < date) & ((g.home == team) | (g.away == team))].tail(10)
    starters = np.where(r.home == team, r.home_goalie, r.away_goalie)
    return name not in set(pd.Series(starters).mode())


def expected_goalie(g: pd.DataFrame, team: str, date: str) -> str:
    r = g[g.played & (g.date < date) & ((g.home == team) | (g.away == team))].tail(5)
    return pd.Series(np.where(r.home == team, r.home_goalie, r.away_goalie)).mode().iloc[0]


def lambdas_with_goalies(game_idx: int, home_goalie: str, away_goalie: str) -> tuple[float, float]:
    """Feature-model goal rates for one game with the named starters."""
    g, gl = B.load()
    game = g[g.game_idx == game_idx].iloc[0]
    g.loc[g.game_idx == game_idx, ["home_goalie", "away_goalie"]] = [home_goalie, away_goalie]
    f = F.build_features(g, gl)
    # g_sv of the target game's starters (build_features only knows played games' goalies)
    for team, name in ((game.home, home_goalie), (game.away, away_goalie)):
        m = (f.game_idx == game_idx) & (f.team == team)
        f.loc[m, "g_sv"] = goalie_sv(gl, g, name, game.date)
        f.loc[m, "is_backup"] = is_backup(g, team, name, game.date)
    side = F.side_rows(g, f, "g_sv")
    pr = pd.read_csv(PROCESSED / "predictions.csv.gz")[["game_idx", "dc_lh", "dc_la", "elo_diff"]]
    s = side.merge(g[["game_idx", "date", "played"]], on="game_idx").merge(pr, on="game_idx")
    s["dc_log"] = np.where(s.is_home == 1, np.log(s.dc_lh), np.log(s.dc_la))
    s["elo_d"] = np.where(s.is_home == 1, s.elo_diff, -s.elo_diff) / 400
    feats = ["is_home", "dc_log", "elo_d", "o_gsv", "a_gsv", "o_backup", "a_rest", "o_rest", "a_b2b", "o_b2b",
             "a_travel"] + [f"a_{c}" for c in F.FORM] + [f"o_{c}" for c in F.FORM]
    enough = s.groupby("game_idx")["a_e_gf"].transform(lambda x: x.notna().all())
    tr = s[s.played & enough & (s.date < game.date) & s.dc_lh.notna()]
    X = tr[feats].astype(float)
    mu = X.mean()
    sc = StandardScaler().fit(X.fillna(mu))
    m = PoissonRegressor(alpha=B.GLM_ALPHA, max_iter=1000).fit(sc.transform(X.fillna(mu)), tr.goals.astype(float))
    te = s[s.game_idx == game_idx].sort_values("is_home", ascending=False)
    lh, la = m.predict(sc.transform(te[feats].astype(float).fillna(mu)))
    return float(lh), float(la)


# ------------------------------------------------------------------ market


def fixture_id(home: str, away: str, nth: int) -> str | None:
    """Livesport id of the nth upcoming home-away meeting (fixtures are in date order)."""
    from .scrape_odds import be_fixtures
    fx = be_fixtures()
    ids = fx[(fx.home == home) & (fx.away == away)].fs_id.tolist()
    return ids[nth] if nth < len(ids) else None


def market_odds(fs_id: str) -> pd.DataFrame:
    from .scrape_odds import upcoming_odds
    try:
        o = upcoming_odds(fs_id)
    except Exception:
        return pd.DataFrame()
    return o[o.book.isin(SE_BOOKS)] if len(o) else o


def consensus(o: pd.DataFrame, market: str, scope: str, sides: list[str], line=None, pairs=None):
    """Margin-free average across Swedish books for the given sides.

    `pairs` maps output position -> (side, line) for handicaps, where the two
    sides of a bet sit on opposite lines. Returns (probs, n_books) or (None, 0)."""
    if o.empty:
        return None, 0
    x = o[(o.market == market) & (o.close.notna())]
    if scope:
        x = x[x.scope == scope]
    rows = []
    for book, b in x.groupby("book"):
        prices = []
        for i, sd in enumerate(sides):
            if pairs:
                sd, ln = pairs[i]
                q = b[(b.side == sd) & (b.line == ln)]
            elif line is not None:
                q = b[(b.side == sd) & (b.line == line)]
            else:
                q = b[b.side == sd]
            if q.empty:
                break
            prices.append(q.close.iloc[0])
        if len(prices) == len(sides):
            inv = 1 / np.array(prices)
            rows.append(inv / inv.sum())
    if not rows:
        return None, 0
    return np.mean(rows, axis=0), len(rows)
