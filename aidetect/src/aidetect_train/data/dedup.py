"""Exact and near-duplicate detection across every source at once.

Policy (documents in the same group are deliberate variants and exempt from
near-duplicate handling, since they always share a split anyway):

1. Exact duplicates with the same label: keep one copy. A training document
   that exactly matches an evaluation-only document is dropped together with
   its whole group, so evaluation sets stay unseen.
2. Near-duplicates across groups (MinHash Jaccard on word 5-grams above the
   threshold):
   - if the cluster mixes evaluation-only and training sources, the training
     copies' *whole groups* are dropped, so neither the text nor variants
     derived from it (an AI rewrite of it, say) are seen in training;
   - if the cluster's labels disagree, the text is ambiguous and the
     cluster's documents are dropped;
   - otherwise the groups involved are merged into one, so every copy and all
     of their variants land in the same split.
"""

from __future__ import annotations

import hashlib
import os
import re
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from functools import partial

import numpy as np
import pandas as pd
from datasketch import MinHash, MinHashLSH


def exact_key(text: str) -> str:
    """Hash of the text with case and whitespace ignored."""
    return hashlib.sha1(re.sub(r"\s+", " ", text.lower()).strip().encode()).hexdigest()


def _shingles(text: str, n: int) -> set[bytes]:
    words = re.findall(r"\w+", text.lower())
    if len(words) < n:
        return {" ".join(words).encode()}
    return {" ".join(words[i : i + n]).encode() for i in range(len(words) - n + 1)}


_SCHEME = "affine32"  # fixed explicitly so signatures can be rebuilt across processes


def minhash(text: str, *, num_perm: int, shingle: int) -> MinHash:
    """MinHash signature of a document's word ``shingle``-grams."""
    signature = MinHash(num_perm=num_perm, seed=1, scheme=_SCHEME)
    signature.update_batch(list(_shingles(text, shingle)))
    return signature


def _hashvalues(texts: Sequence[str], num_perm: int, shingle: int) -> np.ndarray:
    return np.stack([minhash(t, num_perm=num_perm, shingle=shingle).hashvalues for t in texts])


def minhash_many(
    texts: Sequence[str], *, num_perm: int, shingle: int, workers: int | None = None
) -> list[MinHash]:
    """MinHash signatures for many documents, computed in parallel processes."""
    workers = workers or min(8, os.cpu_count() or 1)
    if workers == 1 or len(texts) < 2000:
        return [minhash(t, num_perm=num_perm, shingle=shingle) for t in texts]
    chunk = max(500, len(texts) // (workers * 8))
    chunks = [texts[i : i + chunk] for i in range(0, len(texts), chunk)]
    job = partial(_hashvalues, num_perm=num_perm, shingle=shingle)
    with ProcessPoolExecutor(max_workers=workers) as pool:
        blocks = list(pool.map(job, chunks))
    return [
        MinHash(num_perm=num_perm, seed=1, hashvalues=row, scheme=_SCHEME)
        for block in blocks
        for row in block
    ]


class _UnionFind:
    """Union-find over arbitrary hashable keys (here: document indices or group ids)."""

    def __init__(self) -> None:
        self.parent: dict[object, object] = {}

    def find(self, key: object) -> object:
        parent = self.parent.setdefault(key, key)
        while parent != key:
            grandparent = self.parent.setdefault(parent, parent)
            self.parent[key] = grandparent
            key, parent = parent, grandparent
        return key

    def union(self, a: object, b: object) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            # Deterministic root: the smaller key as a string.
            lo, hi = sorted((ra, rb), key=str)
            self.parent[hi] = lo


@dataclass
class DedupReport:
    """What deduplication did, for the build report."""

    exact_dropped: int = 0
    near_clusters: int = 0
    dropped_to_protect_eval: int = 0
    dropped_label_conflict: int = 0
    groups_merged: int = 0
    examples: list[tuple[str, str]] = field(default_factory=list)


def deduplicate(
    frame: pd.DataFrame, *, threshold: float = 0.8, num_perm: int = 128, shingle: int = 5
) -> tuple[pd.DataFrame, DedupReport]:
    """Apply the module's deduplication policy.

    Args:
        frame: Cleaned documents, with ``use`` set from the source registry.
        threshold: Jaccard similarity above which two documents are near-duplicates.
        num_perm: MinHash permutations (accuracy/speed trade-off).
        shingle: Word n-gram size for shingling.

    Returns:
        The deduplicated frame (index reset) and a report.
    """
    report = DedupReport()
    df = frame.reset_index(drop=True).copy()
    # Evaluation-only rows first, so "keep first" protects them.
    df["_priority"] = (df["use"] != "eval_only").astype(int)
    df = df.sort_values(["_priority", "source", "doc_id"], kind="stable").reset_index(drop=True)

    df["_exact"] = df["text"].map(exact_key)
    # A training text that also occurs in an evaluation set takes its whole
    # group with it (same rule as for near-duplicates below).
    eval_keys = set(df.loc[df["use"] == "eval_only", "_exact"])
    collides = (df["use"] != "eval_only") & df["_exact"].isin(eval_keys)
    drop_groups: set[str] = set(df.loc[collides, "group_id"])
    exact_dup = df.duplicated(["_exact", "label"], keep="first") & ~collides
    report.exact_dropped = int(exact_dup.sum())
    df = df[~exact_dup].reset_index(drop=True)

    lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)
    groups = df["group_id"].to_numpy()
    docs = _UnionFind()
    signatures = minhash_many(df["text"].tolist(), num_perm=num_perm, shingle=shingle)
    for i, signature in enumerate(signatures):
        for j in lsh.query(signature):
            if groups[i] != groups[j]:
                docs.union(i, j)
        lsh.insert(i, signature)

    df["_cluster"] = [str(docs.find(i)) for i in range(len(df))]
    groups_per_cluster = df.groupby("_cluster")["group_id"].transform("nunique")
    drop_rows: set[int] = set()
    merged = _UnionFind()
    for _root, members in df[groups_per_cluster > 1].groupby("_cluster"):
        report.near_clusters += 1
        is_eval = members["use"] == "eval_only"
        survivors = members
        if is_eval.any() and (~is_eval).any():
            drop_groups.update(members.loc[~is_eval, "group_id"])
            survivors = members[is_eval]
        if survivors["label"].nunique() > 1:
            drop_rows.update(survivors.index)
            report.dropped_label_conflict += len(survivors)
            if len(report.examples) < 5:
                pair = survivors["doc_id"].iloc[:2].astype(str).tolist()
                report.examples.append((pair[0], pair[1]))
            continue
        first, *rest = survivors["group_id"].unique()
        for other in rest:
            merged.union(first, other)

    in_dropped_group = df["group_id"].isin(drop_groups)
    report.dropped_to_protect_eval = int(in_dropped_group.sum())
    keep = ~in_dropped_group & ~df.index.isin(list(drop_rows))
    df = df[keep].copy()
    # Every group in a merged component (the root's own group included) gets
    # the same new id; renaming only the non-root groups would let the root
    # land in a different split from the groups merged into it.
    roots = df["group_id"].map(lambda g: str(merged.find(g)))
    groups_in_component = df.groupby(roots)["group_id"].transform("nunique")
    is_merged = groups_in_component > 1
    report.groups_merged = int(df.loc[is_merged, "group_id"].nunique() - roots[is_merged].nunique())
    df["group_id"] = df["group_id"].where(~is_merged, "merged/" + roots)
    return df.drop(columns=["_priority", "_exact", "_cluster"]).reset_index(drop=True), report
