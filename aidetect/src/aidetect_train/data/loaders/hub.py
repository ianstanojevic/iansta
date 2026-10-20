"""Loaders for sources hosted on Hugging Face or their own servers: RAID, HC3, MAGE.

These follow each dataset's documented format. They fail loudly on missing
columns so a format change upstream cannot slip through as silent data loss.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

import pandas as pd

from aidetect_train.data.schema import Doc


def _require(frame: pd.DataFrame, columns: Iterable[str], source: str) -> None:
    missing = [c for c in columns if c not in frame.columns]
    if missing:
        raise ValueError(f"{source}: expected columns {missing} not found in {list(frame.columns)}")


# RAID: one row per generation; human rows have model == "human". Attacked
# rows point at their unattacked original via adv_source_id; generations
# point at the human document they were prompted from via source_id.


def load_raid(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load the RAID train split (``train.csv`` or ``train_none.csv``).

    Options:
        file: CSV name (default ``train.csv``; ``train_none.csv`` has no attacks).
        attacks: attacks to keep (default: all, including ``none``).
        domains: domains to keep (default: all).
    """
    path = root / options.get("file", "train.csv")
    keep_attacks = set(options.get("attacks", [])) or None
    keep_domains = set(options.get("domains", [])) or None
    columns = ["id", "source_id", "model", "decoding", "attack", "domain", "generation"]
    for chunk in pd.read_csv(path, chunksize=200_000, dtype=str, keep_default_na=False):
        _require(chunk, columns, "raid")
        for row in chunk.itertuples(index=False):
            if keep_attacks and row.attack not in keep_attacks:
                continue
            if keep_domains and row.domain not in keep_domains:
                continue
            model, attack = str(row.model), str(row.attack) or "none"
            is_human = model == "human"
            # Attacked human text is still human-written.
            yield Doc(
                text=str(row.generation),
                label="human" if is_human else "ai",
                doc_id=str(row.id),
                group_id=f"raid/{row.source_id or row.id!s}",
                domain=str(row.domain),
                generator="human" if is_human else model,
                edit_type="none" if attack == "none" else f"attack_{attack}",
                source_split="train",
            )


def load_hc3(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load HC3-English (``all.jsonl`` with question / human_answers / chatgpt_answers).

    Option ``exclude_sources``: subsets to skip (default ``["open_qa"]``,
    whose WikiQA origin has a custom licence).
    """
    exclude = set(options.get("exclude_sources", ["open_qa"]))
    path = root / options.get("file", "all.jsonl")
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        if not line.strip():
            continue
        row = json.loads(line)
        source = str(row.get("source", "unknown"))
        if source in exclude:
            continue
        group = f"hc3/{source}/{row.get('id', line_no)}"
        for i, answer in enumerate(row.get("human_answers") or []):
            yield Doc(str(answer), "human", f"{group}/h{i}", group, f"qa_{source}")
        for i, answer in enumerate(row.get("chatgpt_answers") or []):
            yield Doc(
                str(answer), "ai", f"{group}/c{i}", group, f"qa_{source}", generator="chatgpt-2023"
            )


_MAGE_SRC = re.compile(r"^(?P<domain>.+?)_(?:human|machine_(?P<method>[a-z]+)_(?P<model>.+))$")


def load_mage(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load MAGE CSVs (text, label with 1 = human and 0 = machine, src).

    Option ``files``: CSV paths relative to the root (default: ``train.csv``,
    ``valid.csv``, ``test.csv``).
    """
    for name in options.get("files", ["train.csv", "valid.csv", "test.csv"]):
        frame = pd.read_csv(root / name, dtype={"src": str}, keep_default_na=False)
        _require(frame, ["text", "label", "src"], "mage")
        split = Path(name).stem
        for i, row in enumerate(frame.itertuples(index=False)):
            match = _MAGE_SRC.match(str(row.src))
            domain = match["domain"] if match else "unknown"
            human = int(str(row.label)) == 1
            model = match["model"] if match and match["model"] else "unknown"
            generator = "human" if human else model
            # MAGE does not link generations to their human source text, so
            # each document is its own group.
            yield Doc(
                str(row.text),
                "human" if human else "ai",
                f"{split}/{i}",
                f"mage/{split}/{i}",
                domain,
                generator=generator,
                source_split=split,
            )
