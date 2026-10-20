"""Independent leakage checks, run after splitting. Any violation fails the build.

These deliberately do not trust the deduplication step: they recompute
exact and near-duplicate matches between the training side and everything
used for evaluation.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd
from datasketch import MinHashLSH

from aidetect_train.data.dedup import exact_key, minhash_many

TRAINING_SIDE = ("train_clf", "train_meta", "calib")
EVALUATION_SIDE = ("test", "ood")


@dataclass
class LeakageReport:
    """Violations found; empty lists mean the split is clean."""

    groups_in_several_splits: list[str] = field(default_factory=list)
    exact_overlaps: int = 0
    near_overlaps: list[tuple[str, str]] = field(default_factory=list)
    eval_sources_in_training: list[str] = field(default_factory=list)
    mixed_label_in_training: int = 0
    splits_missing_a_label: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """True if no check found a violation."""
        return not (
            self.groups_in_several_splits
            or self.exact_overlaps
            or self.near_overlaps
            or self.eval_sources_in_training
            or self.mixed_label_in_training
            or self.splits_missing_a_label
        )

    def summary(self) -> str:
        """One line per failed check, or a single OK line."""
        if self.ok:
            return "leakage checks: all passed"
        lines = []
        if self.groups_in_several_splits:
            lines.append(f"{len(self.groups_in_several_splits)} groups span several splits")
        if self.exact_overlaps:
            lines.append(f"{self.exact_overlaps} exact duplicates between training and evaluation")
        if self.near_overlaps:
            lines.append(
                f"{len(self.near_overlaps)} near-duplicates, e.g. {self.near_overlaps[:3]}"
            )
        if self.eval_sources_in_training:
            lines.append(f"evaluation-only sources in training: {self.eval_sources_in_training}")
        if self.mixed_label_in_training:
            lines.append(f"{self.mixed_label_in_training} 'mixed' documents in training splits")
        if self.splits_missing_a_label:
            lines.append(f"splits without both labels: {self.splits_missing_a_label}")
        return "; ".join(lines)


def check_leakage(
    frame: pd.DataFrame, *, threshold: float = 0.8, num_perm: int = 128, shingle: int = 5
) -> LeakageReport:
    """Run all checks on a split frame (needs a ``split`` column)."""
    report = LeakageReport()
    splits_per_group = frame.groupby("group_id")["split"].nunique()
    report.groups_in_several_splits = splits_per_group[splits_per_group > 1].index.tolist()

    training = frame[frame["split"].isin(TRAINING_SIDE)]
    evaluation = frame[frame["split"].isin(EVALUATION_SIDE)]
    test = frame[frame["split"] == "test"]

    train_keys = set(training["text"].map(exact_key))
    report.exact_overlaps = int(evaluation["text"].map(exact_key).isin(train_keys).sum())
    # Test must not contain OOD texts either (OOD is evaluated separately).
    ood_keys = set(frame.loc[frame["split"] == "ood", "text"].map(exact_key))
    report.exact_overlaps += int(test["text"].map(exact_key).isin(ood_keys).sum())

    lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)
    train_sigs = minhash_many(training["text"].tolist(), num_perm=num_perm, shingle=shingle)
    for index, signature in zip(training.index, train_sigs, strict=True):
        lsh.insert(str(index), signature)
    eval_sigs = minhash_many(evaluation["text"].tolist(), num_perm=num_perm, shingle=shingle)
    for doc_id, signature in zip(evaluation["doc_id"], eval_sigs, strict=True):
        for hit in lsh.query(signature):
            report.near_overlaps.append((str(frame.at[int(hit), "doc_id"]), str(doc_id)))

    in_distribution = frame["split"] != "ood"
    report.eval_sources_in_training = sorted(
        frame.loc[in_distribution & (frame["use"] == "eval_only"), "source"].unique()
    )
    report.mixed_label_in_training = int((in_distribution & (frame["label"] == "mixed")).sum())
    for split in (*TRAINING_SIDE, "test"):
        labels = set(frame.loc[frame["split"] == split, "label"])
        if labels and not {"human", "ai"} <= labels:
            report.splits_missing_a_label.append(split)
    return report
