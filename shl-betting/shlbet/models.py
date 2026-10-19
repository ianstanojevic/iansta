"""Rating and goals models, plus pricing of every market from a scoreline matrix.

All models expose the same contract: given information strictly before a game,
return a 60-minute scoreline distribution M[i, j] = P(home i, away j) (or, for
Elo, 1X2 probabilities only) and P(home wins | regulation tie).
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit, gammaln

MAXG = 13  # goals per side in the matrix; P(>12) is negligible in hockey


# --------------------------------------------------------------------- pricing

def poisson_matrix(lh: float, la: float, rho: float = 0.0) -> np.ndarray:
    k = np.arange(MAXG)
    ph = np.exp(k * math.log(lh) - lh - gammaln(k + 1))
    pa = np.exp(k * math.log(la) - la - gammaln(k + 1))
    m = np.outer(ph, pa)
    if rho:
        # Dixon-Coles low-score dependence
        m[0, 0] *= 1 - lh * la * rho
        m[0, 1] *= 1 + lh * rho
        m[1, 0] *= 1 + la * rho
        m[1, 1] *= 1 - rho
        m = np.clip(m, 0, None)
    return m / m.sum()


_I, _J = np.meshgrid(np.arange(MAXG), np.arange(MAXG), indexing="ij")
_DIFF, _TOT, _TIE = _I - _J, _I + _J, (_I == _J)


def price(m: np.ndarray, p_ot_home: float, totals_lines=(4.5, 5.0, 5.5, 6.0)) -> dict:
    """Probabilities for every market from one scoreline matrix.

    Totals: 'tot{L}' (60 min) and 'totot{L}' (incl. OT, where a regulation tie
    adds exactly one goal). Each total returns (over, under, push).
    """
    h, d = m[_DIFF > 0].sum(), m[_TIE].sum()
    a = 1 - h - d
    out = {
        "x": (h, d, a),
        "ml": (h + d * p_ot_home, a + d * (1 - p_ot_home)),
        # puck line: identical with/without OT because OT always ends 1-0
        "plh": (m[_DIFF >= 2].sum(), m[_DIFF < 2].sum()),     # home -1.5 / away +1.5
        "pla": (m[_DIFF > -2].sum(), m[_DIFF <= -2].sum()),   # home +1.5 / away -1.5
    }
    tot_ot = _TOT + _TIE
    for L in totals_lines:
        for tag, t in (("tot", _TOT), ("totot", tot_ot)):
            out[f"{tag}{L}"] = (m[t > L].sum(), m[t < L].sum(), m[t == L].sum())
    return out


# ------------------------------------------------------------------------ Elo

class Elo:
    """Elo on 60-minute results with home advantage, margin-of-victory scaling
    and regression to the mean between seasons. Promoted teams start below the
    mean."""

    def __init__(self, k=20.0, hfa=50.0, mov=1.0, regress=0.3, new_team=-60.0):
        self.k, self.hfa, self.mov, self.regress, self.new_team = k, hfa, mov, regress, new_team
        self.r: dict[str, float] = {}
        self.season = None

    def start_season(self, season: str, teams) -> None:
        if self.season is not None:
            for t in self.r:
                self.r[t] = (1 - self.regress) * self.r[t]
        for t in teams:
            self.r.setdefault(t, self.new_team if self.season is not None else 0.0)
        self.season = season

    def diff(self, home: str, away: str) -> float:
        return self.r[home] - self.r[away] + self.hfa

    def update(self, home: str, away: str, hg: int, ag: int) -> None:
        d = self.diff(home, away)
        e = 1 / (1 + 10 ** (-d / 400))
        s = 1.0 if hg > ag else 0.0 if hg < ag else 0.5
        margin = abs(hg - ag)
        mult = (1 + margin) ** self.mov / 2 ** self.mov if margin else 1.0
        delta = self.k * mult * (s - e)
        self.r[home] += delta
        self.r[away] -= delta


def ordered_logit_fit(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float]:
    """3-way ordered logit P(away)=σ(c1-βx), P(away or draw)=σ(c2-βx).
    y: 0 home, 1 draw, 2 away. Returns (beta, c1, c2)."""
    def nll(p):
        b, c1, dc = p
        c2 = c1 + math.exp(dc)
        pa = expit(c1 - b * x)
        pad = expit(c2 - b * x)
        probs = np.select([y == 2, y == 1], [pa, pad - pa], 1 - pad)
        return -np.log(np.clip(probs, 1e-12, 1)).sum()
    r = minimize(nll, [0.005, -0.7, 0.0], method="Nelder-Mead", options={"maxiter": 2000, "xatol": 1e-6})
    b, c1, dc = r.x
    return b, c1, c1 + math.exp(dc)


def ordered_logit_predict(x, params):
    b, c1, c2 = params
    pa = expit(c1 - b * x)
    pad = expit(c2 - b * x)
    return np.column_stack([1 - pad, pad - pa, pa])


# ---------------------------------------------------------------- Dixon-Coles

class DixonColes:
    """Time-decayed Poisson goals model with team attack/defence, home advantage
    and Dixon-Coles low-score correction.

    log λ_home = μ + home + att[h] - def[a];  log λ_away = μ + att[a] - def[h]
    Weights w = exp(-ξ·days_ago). A ridge penalty shrinks att/def to 0, which
    acts as regression to the mean for teams with little recent data; promoted
    teams with no SHL history get `new_team` added to attack and subtracted
    from defence until they have played games.
    """

    def __init__(self, xi=0.003, ridge=2.0, new_team=0.1, window_days=900):
        self.xi, self.ridge, self.new_team, self.window = xi, ridge, new_team, window_days
        self.params = None

    def fit(self, home, away, hg, ag, days_ago, teams):
        keep = days_ago <= self.window
        home, away, hg, ag, days_ago = home[keep], away[keep], hg[keep], ag[keep], days_ago[keep]
        self.teams = sorted(set(teams) | set(home) | set(away))
        idx = {t: i for i, t in enumerate(self.teams)}
        n = len(self.teams)
        hi, ai = np.array([idx[t] for t in home]), np.array([idx[t] for t in away])
        w = np.exp(-self.xi * days_ago)
        seen = np.zeros(n, bool)
        seen[hi] = seen[ai] = True

        def f(p):
            mu, hm = p[0], p[1]
            att, dfn = p[2:2 + n], p[2 + n:]
            lh = mu + hm + att[hi] - dfn[ai]
            la = mu + att[ai] - dfn[hi]
            eh, ea = np.exp(lh), np.exp(la)
            ll = w * (hg * lh - eh + ag * la - ea)
            pen = self.ridge * (att @ att + dfn @ dfn)
            val = -ll.sum() + pen
            g = np.zeros_like(p)
            rh, ra = w * (hg - eh), w * (ag - ea)
            g[0] = -(rh.sum() + ra.sum())
            g[1] = -rh.sum()
            ga = -(np.bincount(hi, rh, n) + np.bincount(ai, ra, n))
            gd = np.bincount(ai, rh, n) + np.bincount(hi, ra, n)
            g[2:2 + n] = ga + 2 * self.ridge * att
            g[2 + n:] = gd + 2 * self.ridge * dfn
            return val, g

        p0 = np.zeros(2 + 2 * n)
        p0[0] = math.log(max(hg.mean() * 0.5 + ag.mean() * 0.5, 0.5))
        r = minimize(f, p0, jac=True, method="L-BFGS-B")
        self.mu, self.home = r.x[0], r.x[1]
        self.att = dict(zip(self.teams, r.x[2:2 + n]))
        self.dfn = dict(zip(self.teams, r.x[2 + n:]))
        self.unseen = {t for t, s in zip(self.teams, seen) if not s}
        # rho by 1-D profile likelihood on the same weighted data
        lh = np.exp(self.mu + self.home + r.x[2:2 + n][hi] - r.x[2 + n:][ai])
        la = np.exp(self.mu + r.x[2:2 + n][ai] - r.x[2 + n:][hi])
        self.rho = _fit_rho(hg, ag, lh, la, w)
        return self

    def rates(self, h: str, a: str) -> tuple[float, float]:
        ah, dh = self._ad(h)
        aa, da = self._ad(a)
        return math.exp(self.mu + self.home + ah - da), math.exp(self.mu + aa - dh)

    def _ad(self, t):
        if t not in self.att or t in self.unseen:
            return -self.new_team, -self.new_team
        return self.att[t], self.dfn[t]


def _fit_rho(hg, ag, lh, la, w):
    m00, m01, m10, m11 = (hg == 0) & (ag == 0), (hg == 0) & (ag == 1), (hg == 1) & (ag == 0), (hg == 1) & (ag == 1)
    best, br = None, 0.0
    for rho in np.linspace(-0.2, 0.2, 41):
        t = np.ones_like(lh)
        t[m00] = 1 - lh[m00] * la[m00] * rho
        t[m01] = 1 + lh[m01] * rho
        t[m10] = 1 + la[m10] * rho
        t[m11] = 1 - rho
        if (t <= 0).any():
            continue
        v = (w * np.log(t)).sum()
        if best is None or v > best:
            best, br = v, rho
    return br


# ------------------------------------------------------- probability pooling

def pool(p_model, p_market, w: float):
    """Log-linear (geometric) pooling: p ∝ model^w · market^(1-w)."""
    pm, pk = np.clip(np.asarray(p_model, float), 1e-9, 1), np.clip(np.asarray(p_market, float), 1e-9, 1)
    q = np.exp(w * np.log(pm) + (1 - w) * np.log(pk))
    return q / q.sum(axis=-1, keepdims=True)


def devig(prices) -> np.ndarray:
    inv = 1 / np.asarray(prices, float)
    return inv / inv.sum(axis=-1, keepdims=True)
