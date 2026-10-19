"""Pricing and probability utilities: invariants that must hold for any input."""
import numpy as np
import pytest

from shlbet.models import devig, poisson_matrix, pool, price


@pytest.mark.parametrize("lh,la,rho", [(2.8, 2.4, 0.0), (3.5, 1.9, -0.08), (1.6, 3.9, 0.05)])
def test_matrix_and_markets_are_coherent(lh, la, rho):
    m = poisson_matrix(lh, la, rho)
    assert m.sum() == pytest.approx(1.0)
    assert (m >= 0).all()
    pr = price(m, 0.54, (4.5, 5.0, 5.5, 6.0))
    assert sum(pr["x"]) == pytest.approx(1.0)
    assert sum(pr["ml"]) == pytest.approx(1.0)
    # moneyline home = regulation win + tie * P(home wins OT)
    assert pr["ml"][0] == pytest.approx(pr["x"][0] + pr["x"][1] * 0.54)
    # puck lines: home -1.5 + away -1.5 + |margin| < 2 cover everything
    assert pr["plh"][0] + pr["pla"][1] + m[np.abs(np.subtract.outer(np.arange(13), np.arange(13))) < 2].sum() == pytest.approx(1.0)
    for L in (4.5, 5.0, 5.5, 6.0):
        assert sum(pr[f"tot{L}"]) == pytest.approx(1.0)
        assert sum(pr[f"totot{L}"]) == pytest.approx(1.0)
    # an odd-integer + .5 line is unaffected by the OT goal (a regulation tie has an even total)
    assert pr["tot5.5"] == pytest.approx(pr["totot5.5"])
    # a half line never pushes, a whole line can
    assert pr["tot5.5"][2] == 0 and pr["tot5.0"][2] > 0
    # incl. OT can only add goals
    assert pr["totot4.5"][0] >= pr["tot4.5"][0]


def test_devig_and_pool():
    p = devig([2.0, 3.5, 3.8])
    assert p.sum() == pytest.approx(1.0)
    assert p[0] > p[1] > p[2]
    model, market = np.array([0.5, 0.2, 0.3]), np.array([0.4, 0.25, 0.35])
    assert pool(model, market, 1.0) == pytest.approx(model)
    assert pool(model, market, 0.0) == pytest.approx(market)
    mid = pool(model, market, 0.5)
    assert mid.sum() == pytest.approx(1.0)
    assert market[0] < mid[0] < model[0]
