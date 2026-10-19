"""No look-ahead: a prediction for a game must not change when anything that
happened on or after its date is changed. Each test scrambles every outcome
from a cut date onwards and checks that everything before it is identical."""
import numpy as np
import pandas as pd
import pytest

from shlbet import backtest as B
from shlbet import features as F
from shlbet.config import PROCESSED

pytestmark = pytest.mark.skipif(not (PROCESSED / "games.csv").exists(),
                                reason="needs data/processed (run update_data.py)")

OUTCOME_COLS = ["home_reg", "away_reg", "home_final", "away_final", "home_shots", "away_shots",
                "fs_home_shots_off_target", "fs_away_shots_off_target", "fs_home_power_play_pct_n",
                "fs_away_power_play_pct_n", "fs_home_power_play_pct_d", "fs_away_power_play_pct_d",
                "fs_home_faceoffs_won", "fs_away_faceoffs_won", "home_xg", "away_xg"]


@pytest.fixture(scope="module")
def data():
    g, gl = B.load()
    g = g[g.season.isin(["2018-19", "2019-20", "2020-21"])].copy()
    gl = gl[gl.sh_game_id.isin(g.sh_game_id)]
    return g, gl


def scramble(g, gl, cut):
    g2, gl2 = g.copy(), gl.copy()
    rng = np.random.default_rng(0)
    after = g2.date >= cut
    for c in OUTCOME_COLS:
        if c in g2:
            g2.loc[after, c] = rng.integers(0, 9, after.sum())
    g2.loc[after, "ot"] = g2.loc[after, "home_reg"] == g2.loc[after, "away_reg"]
    ids = g2.loc[after, "sh_game_id"]
    gl2.loc[gl2.sh_game_id.isin(ids), "saves"] = 0
    return g2, gl2


CUT = "2020-01-15"


def test_features_do_not_see_the_future(data):
    g, gl = data
    a = F.build_features(g, gl)
    b = F.build_features(*scramble(g, gl, CUT))
    before = a.date < CUT
    cols = [c for c in a.columns if c.startswith("e_") or c in ("g_sv", "pp_pct", "pk_pct", "sh_share")]
    pd.testing.assert_frame_equal(a.loc[before, cols].reset_index(drop=True),
                                  b.loc[before, cols].reset_index(drop=True))
    # sanity: the scramble does change later rows, so the test has teeth
    assert not a.loc[~before, "e_gf"].equals(b.loc[~before, "e_gf"])


def test_elo_and_dixon_coles_do_not_see_the_future(data):
    g, gl = data
    g2, _ = scramble(g, gl, CUT)
    before = (g.date <= CUT).values  # games ON the cut date are predicted before it is played
    e1, e2 = B.run_elo(g, **B.ELO_PARAMS), B.run_elo(g2, **B.ELO_PARAMS)
    assert np.allclose(e1.elo_diff[before], e2.elo_diff[before])
    d1 = B.run_dc(g, **B.DC_PARAMS).set_index("game_idx")
    d2 = B.run_dc(g2, **B.DC_PARAMS).set_index("game_idx")
    idx = [i for i in g.game_idx[before] if i in d1.index]
    assert len(idx) > 100
    assert np.allclose(d1.loc[idx, ["dc_lh", "dc_la"]], d2.loc[idx, ["dc_lh", "dc_la"]])
    later = [i for i in g.game_idx[~before] if i in d1.index]
    assert not np.allclose(d1.loc[later, "dc_lh"], d2.loc[later, "dc_lh"])
