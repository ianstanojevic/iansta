"""M4 (Wang et al., EACL 2024): paired human / machine texts across domains and models.

Files are ``data/<domain>_<model>.jsonl`` with ``human_text`` and
``machine_text`` per line. The same human text recurs in every model's file;
it is emitted once per group and deduplication catches the rest.
"""

from __future__ import annotations

import ast
import hashlib
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from aidetect_train.data.schema import Doc

ENGLISH_DOMAINS = {
    "arxiv": "academic_abstract",
    "reddit": "forum_answer",
    "wikipedia": "encyclopedia",
    "wikihow": "how_to",
    "peerread": "peer_review",
}


def _as_text(value: object) -> str:
    """Some PeerRead fields are stringified Python lists; join them."""
    text = str(value or "")
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = ast.literal_eval(text)
        except (ValueError, SyntaxError):
            return text
        if isinstance(parsed, list):
            return "\n\n".join(str(p) for p in parsed)
    return text


def load(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load English M4 files. Option ``domains`` restricts to a subset."""
    domains = options.get("domains", list(ENGLISH_DOMAINS))
    emitted_human: set[str] = set()
    for path in sorted((root / "data").glob("*.jsonl")):
        domain_key = path.stem.split("_", 1)[0].lower()
        if domain_key not in domains:
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
            if not line.strip():
                continue
            row = json.loads(line)
            human = _as_text(row.get("human_text"))
            key = str(row.get("source_ID") or hashlib.sha1(human.encode()).hexdigest()[:16])
            group = f"m4/{domain_key}/{key}"
            if human and group not in emitted_human:
                emitted_human.add(group)
                yield Doc(human, "human", f"{group}/human", group, ENGLISH_DOMAINS[domain_key])
            machine = _as_text(row.get("machine_text"))
            if machine:
                yield Doc(
                    machine,
                    "ai",
                    f"{path.stem}/{line_no}",
                    group,
                    ENGLISH_DOMAINS[domain_key],
                    generator=str(row.get("model") or path.stem.split("_", 1)[1]),
                )
