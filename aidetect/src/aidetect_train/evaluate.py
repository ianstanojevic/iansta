"""Evaluate a trained bundle: in-distribution test and every out-of-distribution set.

Writes ``reports/EVALUATION.md``, ``reports/metrics.json`` and charts, and stores
the headline numbers in the model bundle for the app's About page.

Usage::

    python -m aidetect_train.evaluate data/processed/available
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, roc_curve

from aidetect.detector import BANDS, Detector, classify, default_model_path
from aidetect.stylometry import extract_matrix

MIN_VERDICT_WORDS = 150  # the app gives no verdict below this
PER_CELL = 1000  # OOD documents sampled per (source, label, edit type)


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95 % Wilson interval for a proportion."""
    if n == 0:
        return (math.nan, math.nan)
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (max(0.0, centre - half), min(1.0, centre + half))


def score(det: Detector, frame: pd.DataFrame) -> np.ndarray:
    """``(p, low, high)`` per document, exactly as the app computes them."""
    texts = frame["text"].tolist()
    ngram = det.ngram_logits(texts)
    style = extract_matrix(texts)
    z = np.clip((style - det.style_mean) / det.style_std, -4.0, 4.0)
    logits = np.column_stack([ngram, z]) @ det.meta_coef + det.meta_intercept
    return det.calibrator.predict_many(logits)


def metrics(y: np.ndarray, p: np.ndarray, t: float) -> dict[str, Any]:
    """Binary metrics at threshold ``t``; rates come with Wilson intervals."""
    flagged = p >= t
    out: dict[str, Any] = {"n": len(y), "n_human": int((y == 0).sum()), "n_ai": int((y == 1).sum())}
    if out["n_human"]:
        k = int(flagged[y == 0].sum())
        out["fpr"] = k / out["n_human"]
        out["fpr_ci"] = wilson(k, out["n_human"])
    if out["n_ai"]:
        k = int(flagged[y == 1].sum())
        out["tpr"] = k / out["n_ai"]
        out["tpr_ci"] = wilson(k, out["n_ai"])
    if out["n_human"] and out["n_ai"]:
        tp = int((flagged & (y == 1)).sum())
        fp = int((flagged & (y == 0)).sum())
        out["auroc"] = float(roc_auc_score(y, p))
        out["accuracy"] = float((flagged == (y == 1)).mean())
        out["precision"] = tp / max(tp + fp, 1)
        out["recall"] = out["tpr"]
        prec, rec = out["precision"], out["recall"]
        out["f1"] = 2 * prec * rec / max(prec + rec, 1e-9)
        fpr, tpr, _ = roc_curve(y, p)
        out["tpr_at_1pct_fpr"] = float(np.interp(0.01, fpr, tpr))
    return out


def length_band(n: pd.Series) -> pd.Series:
    """Word-count bands used throughout the report."""
    return pd.cut(
        n, [0, 150, 300, 600, 10**9], labels=["<150", "150-300", "300-600", "600+"], right=False
    )


def _pct(x: float | None) -> str:
    return "–" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{100 * x:.1f}%"


def _row(name: str, m: dict[str, Any]) -> str:
    ci = m.get("fpr_ci")
    fpr = f"{_pct(m.get('fpr'))} ({_pct(ci[0])}–{_pct(ci[1])})" if ci else "–"
    auroc = f"{m['auroc']:.3f}" if "auroc" in m else "–"
    return (
        f"| {name} | {m['n']} | {auroc} | {fpr} | {_pct(m.get('tpr'))} | "
        f"{_pct(m.get('precision'))} | {_pct(m.get('f1'))} |"
    )


HEADER = (
    "| slice | n | AUROC | false positives on human text (95% CI) | AI caught | precision | F1 |\n"
    "|---|---|---|---|---|---|---|"
)


def evaluate(build: Path, model: Path, reports: Path) -> dict[str, Any]:
    """Score test and OOD sets, write the report, return all metrics."""
    det = Detector(model)
    t = det.threshold
    test = pd.read_parquet(build / "test.parquet")
    ood = pd.read_parquet(build / "ood.parquet")
    cells = ["source", "label", "edit_type"]
    ood = ood.sample(frac=1.0, random_state=0).groupby(cells).head(PER_CELL).reset_index(drop=True)
    # Headline numbers are for texts the app actually gives a verdict on (150+
    # words); shorter texts are reported separately in the length table.
    for frame in (test, ood):
        scored = score(det, frame)
        frame["p"], frame["high"] = scored[:, 0], scored[:, 2]
        frame["y"] = (frame["label"] == "ai").astype(int)
        frame["len_band"] = length_band(frame["n_words"])
    by_length = pd.concat([test, ood[ood["label"] != "mixed"]])
    test = test[test["n_words"] >= MIN_VERDICT_WORDS]
    ood = ood[ood["n_words"] >= MIN_VERDICT_WORDS]

    results: dict[str, Any] = {"threshold": t, "in_distribution": {}, "ood": {}, "slices": {}}
    lines = [
        "# Evaluation report",
        "",
        f"Model {det.version}, trained on: {det.trained_on}. Decision threshold "
        f"{t:.2f} (chosen for at most 1% false positives on held-out human text).",
        "",
        '"False positives" are human texts the detector would flag as AI; this is the '
        'number that matters most. "AI caught" is the share of AI texts flagged. '
        "Out-of-distribution (OOD) sets come from different datasets than training "
        "and are the honest measure of real-world behaviour. All tables except the "
        "length table cover texts of 150+ words, the only ones the app gives a verdict on.",
        "",
        "## In-distribution test split",
        "",
        HEADER,
    ]
    m = metrics(test["y"].to_numpy(), test["p"].to_numpy(), t)
    results["in_distribution"]["all"] = m
    lines.append(_row("all", m))
    for col in ("domain", "generator_family", "len_band"):
        for key, g in test.groupby(col, observed=True):
            mm = metrics(g["y"].to_numpy(), g["p"].to_numpy(), t)
            results["in_distribution"][f"{col}={key}"] = mm
            lines.append(_row(f"{col} = {key}", mm))

    binary_ood = ood[ood["label"] != "mixed"]
    lines += ["", "## Out-of-distribution sets", "", HEADER]
    for key, g in binary_ood.groupby("ood_set"):
        mm = metrics(g["y"].to_numpy(), g["p"].to_numpy(), t)
        results["ood"][key] = mm
        lines.append(_row(str(key), mm))
    mm = metrics(binary_ood["y"].to_numpy(), binary_ood["p"].to_numpy(), t)
    results["ood"]["all"] = mm
    lines.append(_row("**all OOD**", mm))

    lines += ["", "### Human writing by native / non-native writers", "", HEADER]
    humans = pd.concat([test, binary_ood])
    humans = humans[humans["label"] == "human"]
    for key, g in humans.groupby("writer_l1"):
        mm = metrics(g["y"].to_numpy(), g["p"].to_numpy(), t)
        results["slices"][f"writer_l1={key}"] = mm
        lines.append(_row(f"writer = {key}", mm))
    for key, g in humans[humans["ood_set"] == "non_native"].groupby("source"):
        mm = metrics(g["y"].to_numpy(), g["p"].to_numpy(), t)
        results["slices"][f"non_native_source={key}"] = mm
        lines.append(_row(f"non-native: {key}", mm))

    lines += ["", "### AI text: unedited vs edited / attacked (all sets)", "", HEADER]
    ai = pd.concat([test, binary_ood])
    ai = ai[ai["label"] == "ai"]
    for key, g in ai.groupby("edit_type"):
        mm = metrics(g["y"].to_numpy(), g["p"].to_numpy(), t)
        results["slices"][f"edit_type={key}"] = mm
        lines.append(_row(f"edit = {key}", mm))

    lines += ["", "### By source model family (OOD AI text)", "", HEADER]
    for key, g in binary_ood[binary_ood["label"] == "ai"].groupby("generator_family"):
        if len(g) >= 50:
            mm = metrics(g["y"].to_numpy(), g["p"].to_numpy(), t)
            results["slices"][f"family={key}"] = mm
            lines.append(_row(str(key), mm))

    lines += ["", "### By length (test + OOD)", "", HEADER]
    for key, g in by_length.groupby("len_band", observed=True):
        mm = metrics(g["y"].to_numpy(), g["p"].to_numpy(), t)
        results["slices"][f"length={key}"] = mm
        lines.append(_row(f"{key} words", mm))

    lines += [
        "",
        "### How often human writing gets each verdict (OOD human texts, 150+ words)",
        "",
        "| set | Likely AI-generated | Inconclusive | Likely human-written |",
        "|---|---|---|---|",
    ]
    ood_humans = binary_ood[binary_ood["label"] == "human"]
    for key, g in [*ood_humans.groupby("ood_set"), ("all", ood_humans)]:
        bands = [classify(p, h, t, False) for p, h in zip(g["p"], g["high"], strict=True)]
        shares = {b: bands.count(b) / max(len(bands), 1) for b in BANDS}
        results["slices"][f"human_bands={key}"] = shares
        lines.append(
            f"| {key} | {_pct(shares['likely_ai'])} | {_pct(shares['inconclusive'])} | "
            f"{_pct(shares['likely_human'])} |"
        )

    mixed = ood[ood["label"] == "mixed"]
    lines += [
        "",
        '### Human text polished or rewritten by AI ("mixed", not scored as right or wrong)',
        "",
        "| edit | n | share flagged as AI |",
        "|---|---|---|",
    ]
    for key, g in mixed.groupby("edit_type"):
        share = float((g["p"] >= t).mean())
        results["slices"][f"mixed={key}"] = {"n": len(g), "flagged": share}
        lines.append(f"| {key} | {len(g)} | {_pct(share)} |")

    reports.mkdir(parents=True, exist_ok=True)
    _charts(test, binary_ood, results, reports)
    lines += [
        "",
        "## Charts",
        "",
        "![ROC curves](roc.png)",
        "",
        "![False positives on human writing](fpr_by_set.png)",
        "",
        "![Calibration](calibration.png)",
        "",
        "## How to read this",
        "",
        "- Rates are shown with 95% Wilson confidence intervals where they matter most.",
        "- The app never shows a verdict for texts under 150 words; the length table shows why.",
        "- These numbers describe the datasets above. Writing that differs from all of them "
        "(other genres, newer AI models, heavy editing) can behave differently.",
    ]
    (reports / "EVALUATION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (reports / "metrics.json").write_text(json.dumps(results, indent=2, default=float) + "\n")
    return results


def _charts(test: pd.DataFrame, ood: pd.DataFrame, results: dict[str, Any], out: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 5))
    sets = [("in-distribution test", test), *((str(k), g) for k, g in ood.groupby("ood_set"))]
    for name, g in sets:
        if g["y"].nunique() == 2:
            fpr, tpr, _ = roc_curve(g["y"], g["p"])
            ax.plot(fpr, tpr, label=f"{name} (AUROC {roc_auc_score(g['y'], g['p']):.2f})")
    ax.plot([0, 1], [0, 1], color="grey", lw=0.8, ls="--")
    ax.set(
        xlabel="False-positive rate (human flagged as AI)", ylabel="AI caught", title="ROC curves"
    )
    ax.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(out / "roc.png", dpi=130)
    plt.close(fig)

    rows = {k: v for k, v in {**results["ood"], **results["slices"]}.items() if "fpr" in v}
    names = [
        k
        for k in rows
        if k.startswith(("non_native_source", "writer_l1")) or k in ("academic_human",)
    ]
    names += [k for k in results["ood"] if "fpr" in results["ood"][k] and k not in names]
    fig, ax = plt.subplots(figsize=(7, 0.35 * len(names) + 1.2))
    vals = [100 * rows[k]["fpr"] for k in names]
    ax.barh(names, vals, color="#c0504d")
    ax.axvline(1, color="black", lw=0.8, ls="--")
    ax.set(xlabel="% of human texts flagged as AI", title="False positives on human writing")
    fig.tight_layout()
    fig.savefig(out / "fpr_by_set.png", dpi=130)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(5, 5))
    bins = np.linspace(0, 1, 11)
    idx = np.clip(np.digitize(test["p"], bins) - 1, 0, 9)
    xs = [test["p"][idx == i].mean() for i in range(10) if (idx == i).any()]
    ys = [test["y"][idx == i].mean() for i in range(10) if (idx == i).any()]
    ax.plot(xs, ys, marker="o")
    ax.plot([0, 1], [0, 1], color="grey", ls="--")
    ax.set(
        xlabel="Predicted probability", ylabel="Observed share AI", title="Calibration (test split)"
    )
    fig.tight_layout()
    fig.savefig(out / "calibration.png", dpi=130)
    plt.close(fig)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point; also stores headline metrics in the model bundle."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("build", type=Path)
    parser.add_argument("--model", type=Path, default=default_model_path())
    parser.add_argument("--reports", type=Path, default=Path("reports"))
    args = parser.parse_args(argv)
    results = evaluate(args.build, args.model, args.reports)
    bundle = joblib.load(args.model)
    bundle["metrics"] = {
        "threshold": results["threshold"],
        "test": results["in_distribution"]["all"],
        "ood": results["ood"],
        "non_native": {k: v for k, v in results["slices"].items() if k.startswith("non_native")},
        "edited": {k: v for k, v in results["slices"].items() if k.startswith("edit_type")},
        "length": {k: v for k, v in results["slices"].items() if k.startswith("length")},
    }
    joblib.dump(bundle, args.model, compress=3)
    print((args.reports / "EVALUATION.md").read_text()[:4000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
