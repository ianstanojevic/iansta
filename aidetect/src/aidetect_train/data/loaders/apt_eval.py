"""APT-Eval (Saha & Feizi, 2025): human texts polished by LLMs to graded degrees.

Polished texts are labelled ``mixed``: they are human writing with AI
involvement, and the evaluation reports them on their own instead of forcing
them into "human" or "AI". The originals are ``human``; ``merged_mgt_hwt_data``
adds fully machine-generated texts from MixSet.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pandas as pd

from aidetect_train.data.schema import Doc

POLISHERS = {
    "gpt": "gpt-4o",
    "llama70b": "llama-3.1-70b-instruct",
    "llama": "llama-3-8b-instruct",
    "llama2": "llama-2-7b-chat",
    "deepseek": "deepseek-v3",
}
_POLISHED = re.compile(r"polished_texts_(?P<degree>.+)_(?P<model>[a-z0-9]+)\.csv$")


def load(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load originals, polished variants and MixSet machine text."""
    del options
    data = root / "data"
    originals = pd.read_csv(data / "HWT_original_data.csv")
    for row in originals.itertuples(index=False):
        yield Doc(str(row.generation), "human", f"hwt/{row.id}", f"apt/{row.id}", str(row.domain))
    for path in sorted((data / "polished").glob("polished_texts_*.csv")):
        match = _POLISHED.search(path.name)
        if not match:
            continue
        degree, model = match["degree"], match["model"]
        for row in pd.read_csv(path).itertuples(index=False):
            yield Doc(
                str(row.generation),
                "mixed",
                f"polished/{degree}/{model}/{row.id}",
                f"apt/{row.id}",
                str(row.domain),
                generator=POLISHERS.get(model, model),
                edit_type=f"ai_polish_{degree}",
            )
    merged = pd.read_csv(data / "merged_mgt_hwt_data.csv")
    for row in merged[merged["model"] != "human"].itertuples(index=False):
        yield Doc(
            str(row.generation),
            "ai",
            f"mgt/{row.domain}/{row.id}",
            f"apt-mgt/{row.domain}/{row.id}",
            str(row.domain).removesuffix("_LLMs").lower(),
            generator=str(row.model),
        )
