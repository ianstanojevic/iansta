"""Beemo (Toloka, 2024): instruction-model outputs, edited by experts and by LLMs.

Per prompt there is a human-written reference answer, an unedited model
answer, an expert-edited version of the model answer, and several LLM-edited
versions. All share the prompt's group.
"""

from __future__ import annotations

import ast
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pandas as pd

from aidetect_train.data.schema import Doc

LLM_EDITORS = {"llama-3.1-70b_edits": "llama-3.1-70b-instruct", "gpt-4o_edits": "gpt-4o"}


def _domain(category: str) -> str:
    return "instruction_" + re.sub(r"\W+", "_", category.strip().lower()).strip("_")


def _llm_edits(raw: object) -> list[tuple[str, str]]:
    """Parse ``"[{'P1': text}, {'P2': text}]"`` into ``[(prompt_key, text), ...]``."""
    if not isinstance(raw, str) or not raw.strip():
        return []
    parsed = ast.literal_eval(raw)
    return [(key, str(text)) for item in parsed for key, text in item.items()]


def load(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load Beemo. Option ``include_llm_edits`` (default true)."""
    include_llm_edits = options.get("include_llm_edits", True)
    frame = pd.read_parquet(root / "dataset.parquet")
    seen_human: set[str] = set()
    # Column names contain "-" and ".", so iterate over plain records.
    for row in frame.to_dict("records"):
        prompt_id, row_id, model = str(row["prompt_id"]), str(row["id"]), str(row["model"])
        group = f"beemo/{prompt_id}"
        domain = _domain(str(row["category"]))
        if prompt_id not in seen_human:
            seen_human.add(prompt_id)
            yield Doc(str(row["human_output"]), "human", f"{prompt_id}/human", group, domain)
        yield Doc(str(row["model_output"]), "ai", f"{row_id}/model", group, domain, generator=model)
        yield Doc(
            str(row["human_edits"]),
            "ai",
            f"{row_id}/expert",
            group,
            domain,
            generator=model,
            edit_type="expert_edit",
        )
        if not include_llm_edits:
            continue
        for column, editor in LLM_EDITORS.items():
            for key, text in _llm_edits(row[column]):
                yield Doc(
                    text,
                    "ai",
                    f"{row_id}/{editor}/{key}",
                    group,
                    domain,
                    generator=f"{model}+{editor}",
                    edit_type="llm_edit",
                )
