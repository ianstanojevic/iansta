"""Tracker bookkeeping, bet settlement in the evaluation, and predict.py output."""
import numpy as np
import pandas as pd
import pytest

from shlbet import evaluate as E
from shlbet import tracker as T
from shlbet.config import PROCESSED


def test_tracker_bankroll(tmp_path):
    p = tmp_path / "t.csv"
    rows = [dict(id=1, date="2026-10-15", opponent="LHF", home_away="home", market="totot", selection="u",
                 odds_taken=2.08, closing_odds=None, model_prob=None, stake=10.0, result="win", profit=None,
                 bankroll=None, note="live"),
            dict(id=2, date="2026-10-17", opponent="LHC", home_away="away", market="hcp", selection="FBK -1.5",
                 odds_taken=1.66, closing_odds=None, model_prob=None, stake=10.0, result="win", profit=None,
                 bankroll=None, note="live"),
            dict(id=3, date="2026-10-22", opponent="TIK", home_away="away", market="tot", selection="Under 5.5",
                 odds_taken=1.95, closing_odds=None, model_prob=0.58, stake=4.0, result="open", profit=None,
                 bankroll=None, note="")]
    T.save(T.recompute(pd.DataFrame(rows)), p)
    df = T.load(p)
    assert df.bankroll.iloc[1] == pytest.approx(117.40)
    assert T.current_bankroll(p) == pytest.approx(113.40)  # open stake is committed
    assert "117.40" in T.report(p)


def test_outcomes_and_push_settlement():
    d = pd.DataFrame(dict(home_reg=[3, 2, 1], away_reg=[2, 2, 4], home_final=[3, 3, 1], away_final=[2, 2, 4]))
    assert list(E.outcomes(d, "x")) == [0, 1, 2]
    assert list(E.outcomes(d, "ml")) == [0, 0, 1]
    assert list(E.outcomes(d, "pla")) == [0, 0, 1]          # home +1.5 loses only to a 2+ away win
    assert list(E.outcomes(d, "tot", 5.0)) == [2, 1, 2]     # exactly 5 pushes
    assert list(E.outcomes(d, "totot", 4.5)) == [0, 0, 0]   # 2-2 tie + OT goal = 5


@pytest.mark.skipif(not (PROCESSED / "predictions.csv.gz").exists(), reason="needs model predictions")
def test_predict_only_stakes_admitted_markets():
    import predict
    g = pd.read_csv(PROCESSED / "games.csv")
    up = g[((g.home == "FBK") | (g.away == "FBK")) & ~g.played].sort_values("date")
    if up.empty:
        pytest.skip("no upcoming Färjestad game")
    r = up.iloc[0]
    home = r.home == "FBK"
    opp = r.away if home else r.home
    df = predict.main(["--opp", opp, "--home" if home else "--away", "--no-fetch", "--bankroll", "1000",
                       "--x", "1.2", "9", "15", "--tot", "5.5", "1.5", "4.0", "--totot", "4.5", "1.4", "2.9"])
    assert (df.loc[~df.market.isin(predict.BET_MARKETS), "stake"] == 0).all()
    assert (df.stake <= 0.05 * 1000).all()
    assert np.isfinite(df.ev).all()
    # 1X2 pooled probabilities sum to 1
    assert df[df.market == "x"].p.sum() == pytest.approx(1.0)
