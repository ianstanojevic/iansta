"""The detector: one function from text to a calibrated, explained, never-certain result."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np

# The model bundle pickles these classes. Importing them explicitly also lets
# PyInstaller see that the frozen app needs scikit-learn.
import sklearn.feature_extraction.text
import sklearn.pipeline  # noqa: F401

from aidetect.calibration import VennAbers
from aidetect.core.text import Span, count_words, normalise_text, split_sentences
from aidetect.reliability import ReliabilityWarning, check
from aidetect.stylometry import FEATURES, extract

# Displayed probabilities never reach 0 % or 100 %.
DISPLAY_MIN, DISPLAY_MAX = 0.03, 0.97
HUMAN_BAND_MAX = 0.35
# Features the model uses but that mean nothing to a reader as "evidence".
NOT_EXPLAINED = frozenset({"log_words"})
# There is deliberately no "some AI signals" band: on unfamiliar genres, human
# writing often scores high without reaching the threshold (see EVALUATION.md),
# so anything weaker than the threshold is reported as inconclusive.

BANDS = {
    "likely_ai": "Likely AI-generated",
    "inconclusive": "Inconclusive",
    "likely_human": "Likely human-written",
}


@dataclass
class SentenceScore:
    """AI-likeness of one sentence relative to its document, scaled by the overall score."""

    span: Span
    heat: float


@dataclass
class Result:
    """Everything shown to the user for one analysis."""

    text: str
    n_words: int
    probability: float | None
    low: float | None
    high: float | None
    band: str
    band_label: str
    warnings: list[ReliabilityWarning]
    sentences: list[SentenceScore] = field(default_factory=list)
    reasons_ai: list[str] = field(default_factory=list)
    reasons_human: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """JSON-friendly form (used by ``aidetect --json``)."""
        return {
            "n_words": self.n_words,
            "probability_ai": self.probability,
            "range": [self.low, self.high] if self.low is not None else None,
            "verdict": self.band_label,
            "warnings": [w.message for w in self.warnings],
            "signals_towards_ai": self.reasons_ai,
            "signals_towards_human": self.reasons_human,
            "sentences": [
                {"start": s.span.start, "end": s.span.end, "relative_ai_likeness": round(s.heat, 3)}
                for s in self.sentences
            ],
        }


def default_model_path() -> Path:
    """The model bundled with the package (or next to a frozen app)."""
    return Path(__file__).resolve().parent / "models" / "aidetect-model.joblib"


class Detector:
    """Load a trained bundle once, then call :meth:`analyse` per text."""

    def __init__(self, path: Path | None = None) -> None:
        bundle: dict[str, Any] = joblib.load(path or default_model_path())
        self.bundle = bundle
        self.version: str = bundle["version"]
        self.vectorizer = bundle["vectorizer"]
        self.ngram_coef = np.asarray(bundle["ngram_coef"], dtype=float)
        self.ngram_intercept = float(bundle["ngram_intercept"])
        self.style_mean = np.asarray(bundle["style_mean"])
        self.style_std = np.asarray(bundle["style_std"])
        self.human_median = np.asarray(bundle["style_human_median"])
        # Direction in which each feature differs for AI text (+1 higher, -1 lower).
        self.ai_direction = np.sign(np.asarray(bundle["style_ai_median"]) - self.human_median)
        self.meta_coef = np.asarray(bundle["meta_coef"])
        self.meta_intercept = float(bundle["meta_intercept"])
        self.calibrator = VennAbers.from_dict(bundle["calibration"])
        self.threshold = float(bundle["threshold"])
        self.metrics: dict[str, Any] = bundle.get("metrics", {})
        self.trained_on: str = bundle.get("trained_on", "")

    # -- scoring pieces -------------------------------------------------
    def ngram_logits(self, texts: list[str]) -> np.ndarray:
        """Word/character n-gram classifier log-odds for each text."""
        x = self.vectorizer.transform(texts)
        return np.asarray(x @ self.ngram_coef + self.ngram_intercept).ravel()

    def style_z(self, text: str) -> np.ndarray:
        """Standardised style features, clipped so one odd value cannot dominate."""
        raw = np.array([extract(text)[k] for k in FEATURES])
        return np.clip((raw - self.style_mean) / self.style_std, -4.0, 4.0)

    def meta_logit(self, ngram_logit: float, z: np.ndarray) -> float:
        """Combine the signals into one score."""
        x = np.concatenate([[ngram_logit], z])
        return float(x @ self.meta_coef + self.meta_intercept)

    # -- the public entry point -------------------------------------------
    def analyse(self, raw_text: str) -> Result:
        """Score a text. Never returns a certainty; see the module constants."""
        text = normalise_text(raw_text)
        n_words = count_words(text)
        warnings = check(text)
        blocking = any(w.blocking for w in warnings)
        if n_words == 0:
            return Result(text, 0, None, None, None, "inconclusive", "No text", warnings)

        ngram = float(self.ngram_logits([text])[0])
        z = self.style_z(text)
        score = self.meta_logit(ngram, z)
        raw_p, raw_low, raw_high = self.calibrator.predict(score)
        band = classify(raw_p, raw_high, self.threshold, blocking)
        # Clamp only for display: the verdict uses the exact values.
        p, low, high = (min(max(v, DISPLAY_MIN), DISPLAY_MAX) for v in (raw_p, raw_low, raw_high))
        result = Result(text, n_words, p, low, high, band, BANDS[band], warnings)
        # Colour strength follows the overall score, so a human-looking text is
        # not painted with alarming patches just because some parts rank higher.
        result.sentences = [
            SentenceScore(s.span, s.heat * raw_p) for s in self._sentence_heat(text)
        ]
        result.reasons_ai, result.reasons_human = self._explain(ngram, z)
        return result

    # -- heatmap and explanations ---------------------------------------
    def _sentence_heat(self, text: str) -> list[SentenceScore]:
        spans = split_sentences(text)
        if len(spans) < 4:
            return []
        windows = [
            text[spans[max(i - 1, 0)].start : spans[min(i + 1, len(spans) - 1)].end]
            for i in range(len(spans))
        ]
        logits = self.ngram_logits(windows)
        # Relative within the document: rank-normalised, so the colours show
        # which parts look more AI-like than the rest, not absolute verdicts.
        ranks = logits.argsort().argsort().astype(float)
        heat = ranks / max(len(ranks) - 1, 1)
        return [SentenceScore(s, float(h)) for s, h in zip(spans, heat, strict=True)]

    def _explain(self, ngram: float, z: np.ndarray) -> tuple[list[str], list[str]]:
        contributions = self.meta_coef * np.concatenate([[ngram], z])
        names = ["ngram", *FEATURES]
        order = np.argsort(-np.abs(contributions))
        towards_ai: list[str] = []
        towards_human: list[str] = []
        for idx in order:
            c = float(contributions[idx])
            if abs(c) < 0.15 or (len(towards_ai) >= 4 and len(towards_human) >= 3):
                break
            target = towards_ai if c > 0 else towards_human
            if len(target) >= (4 if c > 0 else 3):
                continue
            name = names[idx]
            if name in NOT_EXPLAINED:
                continue
            if name == "ngram":
                target.append(
                    "The word and phrase choices resemble the "
                    + ("AI-written" if c > 0 else "human-written")
                    + " texts the detector was trained on."
                )
                continue
            j = idx - 1
            value = z[j] * self.style_std[j] + self.style_mean[j]
            human = self.human_median[j]
            more = value > human
            # Only explain with a feature when it points the way the data does:
            # e.g. "more stock connectives" must count towards AI, never human.
            looks_ai = (value - human) * self.ai_direction[j] > 0
            if self.ai_direction[j] == 0 or looks_ai != (c > 0):
                continue
            desc = FEATURES[name]
            target.append(
                f"{desc[0].upper()}{desc[1:]}: {'higher' if more else 'lower'} than in typical "
                f"human writing ({_fmt(value)} vs about {_fmt(human)})."
            )
        return towards_ai, towards_human


def describe_score(result: Result) -> str:
    """One line such as "AI-likeness 42% (plausible range 30%-55%)"."""
    if result.probability is None or result.low is None or result.high is None:
        return "No score: not enough text."
    if result.low >= DISPLAY_MAX:
        return f"AI-likeness {DISPLAY_MAX:.0%} or more"
    if result.high <= DISPLAY_MIN:
        return f"AI-likeness {DISPLAY_MIN:.0%} or less"
    return (
        f"AI-likeness {result.probability:.0%} "
        f"(plausible range {result.low:.0%} to {result.high:.0%})"
    )


def classify(p: float, high: float, threshold: float, blocking: bool) -> str:
    """Map a calibrated probability to a verdict band (never a certainty)."""
    if blocking:
        return "inconclusive"
    if p >= threshold:
        return "likely_ai"
    if high < HUMAN_BAND_MAX:
        return "likely_human"
    return "inconclusive"


def _fmt(x: float) -> str:
    if abs(x) >= 10:
        return f"{x:.0f}"
    if abs(x) >= 1:
        return f"{x:.1f}"
    return f"{x:.2f}"


def sigmoid(x: float) -> float:
    """Logistic function."""
    return 1.0 / (1.0 + math.exp(-x))
