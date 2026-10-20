"""Declarative source registry, read from ``training/configs/sources.yaml``."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

Use = Literal["train", "eval_only", "excluded"]

NONCOMMERCIAL_MARKERS = ("-nc", "noncommercial", "non-commercial")


class SourceSpec(BaseModel):
    """Where a dataset lives, what licence it must carry, and how it may be used.

    ``licence`` is an SPDX-style identifier (lower case), or ``unknown`` when
    the source publishes no licence. Unknown-licence data may only be used for
    evaluation; that rule is enforced here rather than left to discipline.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    kind: Literal["git", "hf", "url"]
    location: str = Field(description="git URL, Hugging Face dataset id, or download URL")
    revision: str = Field(description="commit SHA, HF revision, or SHA-256 of the file")
    licence: str
    licence_evidence: list[str] = Field(
        default_factory=list,
        description="files in the source whose text must state the licence ('card' for HF)",
    )
    use: Use
    ood_set: str = ""
    loader: str
    loader_options: dict[str, Any] = Field(default_factory=dict)
    attribution: str
    notes: str = ""

    @model_validator(mode="after")
    def _check_policy(self) -> SourceSpec:
        if self.licence == "unknown" and self.use == "train":
            raise ValueError(f"{self.id}: data without a licence cannot be used for training")
        if self.licence != "unknown" and not self.licence_evidence:
            raise ValueError(f"{self.id}: a licence claim needs licence_evidence")
        if self.use == "eval_only" and not self.ood_set:
            raise ValueError(f"{self.id}: eval_only sources need an ood_set name")
        if self.use == "train" and self.ood_set:
            raise ValueError(f"{self.id}: training sources cannot belong to an OOD set")
        return self

    @property
    def noncommercial(self) -> bool:
        """True if the licence forbids commercial use."""
        return any(marker in self.licence for marker in NONCOMMERCIAL_MARKERS)

    @property
    def cache_key(self) -> str:
        """Directory name for the raw download; sources sharing a repo share it."""
        tail = self.location.rstrip("/").split("/")[-1].removesuffix(".git")
        return f"{self.kind}-{tail}-{self.revision[:12]}"


def load_sources(path: Path) -> dict[str, SourceSpec]:
    """Read and validate the source registry."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    specs = [SourceSpec.model_validate(entry) for entry in raw["sources"]]
    by_id: dict[str, SourceSpec] = {}
    for spec in specs:
        if spec.id in by_id:
            raise ValueError(f"duplicate source id {spec.id!r}")
        by_id[spec.id] = spec
    return by_id
