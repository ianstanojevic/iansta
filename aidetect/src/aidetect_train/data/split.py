"""Group-level train / meta / calibration / test splitting.

Each group is assigned to a split by hashing ``(seed, group_id)`` to a number
in ``[0, 1)``. That makes assignment deterministic, keeps every variant of a
document together, and means adding new data never moves an existing group
to a different split (so a test set stays a test set across rebuilds).
Evaluation-only sources go to ``ood`` whole.
"""

from __future__ import annotations

import hashlib

import pandas as pd

TRAIN_SPLITS = ("train_clf", "train_meta", "calib", "test")


def _unit_hash(seed: int, key: str) -> float:
    # The "split" salt keeps this independent of the hashes used for
    # subsampling and capping; reusing one hash would make a subsample pick
    # exactly the groups that hash low, i.e. all land in the first split.
    digest = hashlib.blake2b(f"split:{seed}:{key}".encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big") / 2**64


def assign_splits(frame: pd.DataFrame, fractions: dict[str, float], seed: int) -> pd.Series:
    """Return the split name for every row of ``frame``.

    Args:
        frame: Documents with ``group_id`` and ``use``.
        fractions: Fractions for :data:`TRAIN_SPLITS`; must sum to 1.
        seed: Changing the seed reshuffles every group.

    Raises:
        ValueError: If ``fractions`` names other splits or does not sum to 1.
    """
    if set(fractions) != set(TRAIN_SPLITS):
        raise ValueError(f"fractions must cover exactly {TRAIN_SPLITS}")
    if abs(sum(fractions.values()) - 1.0) > 1e-9:
        raise ValueError("split fractions must sum to 1")
    edges: list[tuple[float, str]] = []
    cumulative = 0.0
    for name in TRAIN_SPLITS:
        cumulative += fractions[name]
        edges.append((cumulative, name))

    def pick(group_id: str) -> str:
        u = _unit_hash(seed, group_id)
        return next((name for edge, name in edges if u < edge), TRAIN_SPLITS[-1])

    by_group = {g: pick(g) for g in frame["group_id"].unique()}
    split = frame["group_id"].map(by_group)
    split[frame["use"] == "eval_only"] = "ood"
    return split.rename("split")
