"""Train the detector bundle on a data build (CPU, minutes).

Stage 1: word + character n-gram TF-IDF with logistic regression, on ``train_clf``.
Stage 2: a logistic-regression combiner over [n-gram score, style features],
         on ``train_meta`` (which stage 1 never saw, so its scores are honest).
Stage 3: Venn-Abers calibration on ``calib``, and the decision threshold that
         keeps false positives on human text at or below the target.

Usage::

    python -m aidetect_train.model data/processed/available --out src/aidetect/models
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion

from aidetect import __version__
from aidetect.calibration import VennAbers
from aidetect.stylometry import FEATURES, extract_matrix

TARGET_FPR = 0.01
MAX_CHARS = 12_000  # long documents are truncated for training speed


def load_split(build: Path, split: str) -> pd.DataFrame:
    """Read one split of a data build."""
    frame = pd.read_parquet(build / f"{split}.parquet")
    frame["y"] = (frame["label"] == "ai").astype(int)
    frame["text"] = frame["text"].str.slice(0, MAX_CHARS)
    return frame


def make_vectorizer() -> FeatureUnion:
    """Word 1-2 grams and character 3-5 grams, sublinear TF-IDF."""
    return FeatureUnion(
        [
            ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_features=60_000,
                                     sublinear_tf=True, dtype=np.float32)),
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=5,
                                     max_features=120_000, sublinear_tf=True, dtype=np.float32)),
        ]
    )  # fmt: skip


def threshold_for_fpr(human_p: np.ndarray, target: float) -> float:
    """Smallest probability threshold whose false-positive rate on ``human_p`` <= target."""
    ordered = np.sort(human_p)
    k = int(np.floor(target * len(ordered)))  # at most k humans may score >= threshold
    if k >= len(ordered):
        return 0.5
    return float(np.nextafter(ordered[len(ordered) - k - 1], 1.0))


def train(build: Path, seed: int = 0) -> dict[str, Any]:
    """Fit all stages and return the bundle dict."""
    clf_df = load_split(build, "train_clf")
    meta_df = load_split(build, "train_meta")
    cal_df = load_split(build, "calib")

    vectorizer = make_vectorizer()
    x_clf = vectorizer.fit_transform(clf_df["text"])
    ngram = LogisticRegression(C=4.0, max_iter=3000, class_weight="balanced", random_state=seed)
    ngram.fit(x_clf, clf_df["y"])
    coef = ngram.coef_.ravel().astype(np.float32)
    intercept = float(ngram.intercept_[0])

    def ngram_score(frame: pd.DataFrame) -> np.ndarray:
        return np.asarray(vectorizer.transform(frame["text"]) @ coef + intercept).ravel()

    style_meta = extract_matrix(meta_df["text"].tolist())
    mean = style_meta.mean(axis=0)
    std = style_meta.std(axis=0) + 1e-6
    human_median = np.median(style_meta[meta_df["y"].to_numpy() == 0], axis=0)
    ai_median = np.median(style_meta[meta_df["y"].to_numpy() == 1], axis=0)

    def meta_x(frame: pd.DataFrame, style: np.ndarray) -> np.ndarray:
        z = np.clip((style - mean) / std, -4.0, 4.0)
        return np.column_stack([ngram_score(frame), z])

    combiner = LogisticRegression(C=0.5, max_iter=3000, class_weight="balanced")
    combiner.fit(meta_x(meta_df, style_meta), meta_df["y"])
    meta_coef = combiner.coef_.ravel()
    meta_intercept = float(combiner.intercept_[0])

    cal_scores = (
        meta_x(cal_df, extract_matrix(cal_df["text"].tolist())) @ meta_coef + meta_intercept
    )
    calibrator = VennAbers(cal_scores, cal_df["y"].to_numpy())
    cal_p = calibrator.predict_many(cal_scores)[:, 0]  # columns: p, low, high
    threshold = max(threshold_for_fpr(cal_p[cal_df["y"].to_numpy() == 0], TARGET_FPR), 0.5)

    manifest = json.loads((build / "manifest.json").read_text())
    return {
        "version": __version__,
        "created_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "data_build": manifest["name"],
        "data_sources": [k for k, v in manifest["sources"].items() if v["use"] == "train"],
        "trained_on": "Ghostbuster (2023 ChatGPT and Claude essays, stories, news) and "
        "ELLIPSE (English-learner essays)",
        "vectorizer": vectorizer,
        "ngram_coef": coef,
        "ngram_intercept": intercept,
        "feature_names": list(FEATURES),
        "style_mean": mean,
        "style_std": std,
        "style_human_median": human_median,
        "style_ai_median": ai_median,
        "meta_coef": meta_coef,
        "meta_intercept": meta_intercept,
        "calibration": calibrator.to_dict(),
        "threshold": threshold,
        "target_fpr": TARGET_FPR,
        "metrics": {},
    }


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("build", type=Path, help="data build directory")
    parser.add_argument("--out", type=Path, default=Path("src/aidetect/models"))
    args = parser.parse_args(argv)
    bundle = train(args.build)
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / "aidetect-model.joblib"
    joblib.dump(bundle, path, compress=3)
    print(f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB), threshold {bundle['threshold']:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
