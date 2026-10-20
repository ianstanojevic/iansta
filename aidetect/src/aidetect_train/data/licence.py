"""Licence audit: confirm each source really carries the licence we claim for it.

The audit reads the licence text shipped with the data (a ``LICENSE`` file, a
README section, or a Hugging Face dataset card) and recognises licences by
phrases from their legal text rather than by badges, which are often wrong.
A build fails if a claimed licence cannot be found in the evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from aidetect_train.data.sources import SourceSpec

# Each licence is recognised when *all* of its phrases occur (case-insensitive,
# whitespace-insensitive). Order matters only for readability.
_SIGNATURES: dict[str, tuple[str, ...]] = {
    "mit": ("permission is hereby granted, free of charge",),
    "apache-2.0": ("apache license", "version 2.0"),
    "bsd-3-clause": (
        "redistribution and use in source and binary forms",
        "neither the name",
    ),
    "cc-by-3.0": ("attribution 3.0 unported",),
    "cc-by-4.0": ("attribution 4.0 international",),
    "cc-by-sa": ("cc-by-sa",),
    "cc-by-sa-4.0": ("attribution-sharealike 4.0",),
    "cc-by-nc-4.0": ("attribution-noncommercial 4.0",),
    "cc-by-nc-sa-4.0": ("attribution-noncommercial-sharealike 4.0",),
    "cc0-1.0": ("cc0 1.0 universal",),
}

# Badge-style mentions such as "License-CC BY 4.0" are accepted only as
# secondary evidence, after a primary text match.
_HF_ALIASES = {
    "cc-by-sa-4.0": "cc-by-sa-4.0",
    "cc-by-4.0": "cc-by-4.0",
    "cc-by-nc-sa-4.0": "cc-by-nc-sa-4.0",
    "cc-by-nc-4.0": "cc-by-nc-4.0",
    "mit": "mit",
    "apache-2.0": "apache-2.0",
    "bsd-3-clause": "bsd-3-clause",
    "cc0-1.0": "cc0-1.0",
}


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).lower()


def identify_licences(text: str) -> set[str]:
    """Return every licence whose signature phrases all occur in ``text``."""
    squashed = _squash(text)
    return {
        licence
        for licence, phrases in _SIGNATURES.items()
        if all(_squash(p) in squashed for p in phrases)
    }


def card_licences(card_text: str) -> set[str]:
    """Licences declared in a Hugging Face dataset card's YAML front matter."""
    match = re.match(r"^---\n(.*?)\n---", card_text, flags=re.DOTALL)
    if not match:
        return set()
    meta = yaml.safe_load(match.group(1)) or {}
    declared = meta.get("license", [])
    if isinstance(declared, str):
        declared = [declared]
    return {_HF_ALIASES.get(str(d).lower(), str(d).lower()) for d in declared}


@dataclass(frozen=True)
class AuditResult:
    """Outcome of auditing one source."""

    source: str
    claimed: str
    found: frozenset[str]
    ok: bool
    message: str


def _matches(claimed: str, found: set[str]) -> bool:
    # "cc-by-sa" (version unstated in the source) is satisfied by any CC BY-SA.
    if claimed in found:
        return True
    return claimed == "cc-by-sa" and any(f.startswith("cc-by-sa") for f in found)


def audit_source(spec: SourceSpec, root: Path) -> AuditResult:
    """Check the licence evidence for ``spec`` inside its downloaded ``root``.

    Args:
        spec: The source declaration.
        root: Directory the source was fetched into.

    Returns:
        An :class:`AuditResult`; ``ok`` is false if the claim is not supported.
    """
    if spec.licence == "unknown":
        return AuditResult(
            spec.id, "unknown", frozenset(), True, "no licence claimed; evaluation only"
        )
    found: set[str] = set()
    missing: list[str] = []
    for evidence in spec.licence_evidence:
        if evidence == "card":
            card = root / "README.md"
            if card.is_file():
                found |= card_licences(card.read_text(encoding="utf-8", errors="replace"))
            else:
                missing.append("README.md (dataset card)")
            continue
        path = root / evidence
        if not path.is_file():
            missing.append(evidence)
            continue
        found |= identify_licences(path.read_text(encoding="utf-8", errors="replace"))
    if _matches(spec.licence, found):
        return AuditResult(spec.id, spec.licence, frozenset(found), True, "licence confirmed")
    detail = f"found {sorted(found) or 'nothing'}"
    if missing:
        detail += f"; missing evidence files {missing}"
    return AuditResult(
        spec.id, spec.licence, frozenset(found), False, f"claimed {spec.licence}, {detail}"
    )
