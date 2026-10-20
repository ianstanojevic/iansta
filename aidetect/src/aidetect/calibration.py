"""Inductive Venn-Abers calibration: a probability with an honest range.

For a new score, two isotonic regressions are fitted to the calibration set,
once with the new point labelled 0 and once labelled 1. Their values at the
new score, ``p0 <= p1``, bound the calibrated probability; the gap widens
where calibration data is sparse, which is exactly where the model knows less.
"""

from __future__ import annotations

import numpy as np


def _pava(y: np.ndarray) -> np.ndarray:
    """Pool-adjacent-violators: the non-decreasing least-squares fit to ``y``."""
    values: list[float] = []
    weights: list[float] = []
    for v in y.astype(float):
        values.append(v)
        weights.append(1.0)
        while len(values) > 1 and values[-2] > values[-1]:
            w = weights[-2] + weights[-1]
            values[-2] = (values[-2] * weights[-2] + values[-1] * weights[-1]) / w
            weights[-2] = w
            values.pop()
            weights.pop()
    return np.repeat(values, np.asarray(weights, dtype=int))


class VennAbers:
    """Inductive Venn-Abers predictor for one-dimensional scores."""

    def __init__(self, scores: np.ndarray, labels: np.ndarray) -> None:
        order = np.argsort(scores, kind="stable")
        self.scores = np.asarray(scores, dtype=float)[order]
        self.labels = np.asarray(labels, dtype=float)[order]

    def _fit_at(self, score: float, label: float) -> float:
        pos = int(np.searchsorted(self.scores, score, side="right"))
        y = np.insert(self.labels, pos, label)
        return float(_pava(y)[pos])

    def predict(self, score: float) -> tuple[float, float, float]:
        """Return ``(p, low, high)`` for one score.

        ``p`` is the usual merged point estimate ``p1 / (1 - p0 + p1)``.
        """
        p0 = self._fit_at(score, 0.0)
        p1 = self._fit_at(score, 1.0)
        p = p1 / (1.0 - p0 + p1)
        return p, p0, p1

    def predict_many(self, scores: np.ndarray) -> np.ndarray:
        """``(n, 3)`` array of ``(p, low, high)``."""
        return np.array([self.predict(float(s)) for s in scores])

    def to_dict(self) -> dict[str, list[float]]:
        """Serialisable form."""
        return {"scores": self.scores.tolist(), "labels": self.labels.tolist()}

    @classmethod
    def from_dict(cls, data: dict[str, list[float]]) -> VennAbers:
        """Inverse of :meth:`to_dict`."""
        return cls(np.asarray(data["scores"]), np.asarray(data["labels"]))
