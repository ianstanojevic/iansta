"""The single document schema every source is normalised into."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from typing import Literal

import pandas as pd

Label = Literal["human", "ai", "mixed"]
"""``mixed`` is human writing that an AI has rewritten or polished (or a splice
of both). It is never used as a training label: it is reported on its own in
evaluation, because a binary verdict on it is not well defined."""

WriterL1 = Literal["native", "non_native", "unknown"]

LABELS: tuple[Label, ...] = ("human", "ai", "mixed")
SPLITS = ("train_clf", "train_meta", "calib", "test", "ood")


@dataclass(slots=True)
class Doc:
    """One document as produced by a source loader.

    Attributes:
        text: The document text (raw; cleaning happens later).
        label: ``human``, ``ai`` or ``mixed``.
        doc_id: Identifier unique within the source.
        group_id: Documents that are variants of one another (a human text, its
            AI counterpart, edits of either) share a group and always land in
            the same split. Must be unique across sources, so loaders prefix it.
        domain: Genre, such as ``student_essay`` or ``news``.
        generator: Model that produced or edited the text; ``human`` for none.
        edit_type: ``none`` or what was done to the text (``paraphrase``,
            ``expert_edit``, ``ai_polish_minor``, ``char_attack``, ...).
        writer_l1: Whether the human author writes English as a first language.
        artefacts: Known dataset artefacts in this text (for audits).
        source_split: The split the original dataset assigned, informational.
    """

    text: str
    label: Label
    doc_id: str
    group_id: str
    domain: str
    generator: str = "human"
    edit_type: str = "none"
    writer_l1: WriterL1 = "unknown"
    artefacts: tuple[str, ...] = field(default_factory=tuple)
    source_split: str = ""


COLUMNS = [
    "text",
    "label",
    "doc_id",
    "group_id",
    "source",
    "domain",
    "generator",
    "generator_family",
    "edit_type",
    "is_edited",
    "writer_l1",
    "artefacts",
    "source_split",
    "licence",
    "use",
    "ood_set",
    "n_words",
    "language",
]


# Ordered: first match wins. Families follow model lineage (a fine-tune is in
# its base model's family), which is what leave-one-family-out tests need.
_FAMILY_PATTERNS: list[tuple[str, str]] = [
    (r"^human$", "human"),
    (r"gpt-?5", "openai-gpt5"),
    (r"^o[134](-|$)", "openai-o"),
    (r"gpt-?4|gpt4", "openai-gpt4"),
    (r"gpt-?3\.5|chatgpt|turbo", "openai-gpt3.5"),
    (r"davinci|gpt-?3\b|text-curie|text-babbage", "openai-gpt3"),
    (r"gpt-?oss", "openai-gpt-oss"),
    (r"gpt-?2", "openai-gpt2"),
    (r"gpt-?j|gpt-?neo", "eleutherai"),
    (r"claude", "anthropic-claude"),
    (r"palm|bard", "google-palm"),
    (r"gemini", "google-gemini"),
    (r"gemma", "google-gemma"),
    (r"flan|t5", "google-t5"),
    (r"mistral|mixtral|zephyr", "mistral"),
    (r"llama|vicuna|alpaca|tulu|koala", "meta-llama"),
    (r"qwen", "alibaba-qwen"),
    (r"deepseek", "deepseek"),
    (r"phi-?\d", "microsoft-phi"),
    (r"cohere|command", "cohere"),
    (r"dolly", "databricks-dolly"),
    (r"bloom", "bigscience-bloom"),
    (r"mpt", "mosaic-mpt"),
    (r"opt\b|opt-", "meta-opt"),
    (r"falcon", "tii-falcon"),
    (r"olmo", "allenai-olmo"),
    (r"stablelm", "stability"),
    (r"chatglm|glm", "zhipu-glm"),
    (r"yi-", "01ai-yi"),
]


def generator_family(generator: str) -> str:
    """Map a free-form generator name to a model family.

    >>> generator_family("gpt-3.5-turbo")
    'openai-gpt3.5'
    >>> generator_family("HuggingFaceH4/zephyr-7b-beta")
    'mistral'
    """
    name = generator.strip().lower()
    for pattern, family in _FAMILY_PATTERNS:
        if re.search(pattern, name):
            return family
    return "other"


def docs_to_frame(
    docs: Iterable[Doc], *, source: str, licence: str, use: str, ood_set: str
) -> pd.DataFrame:
    """Turn loader output into a frame with the full schema (text not yet cleaned)."""
    rows = []
    for doc in docs:
        row = asdict(doc)
        row["artefacts"] = list(doc.artefacts)
        rows.append(row)
    frame = pd.DataFrame(rows, columns=[f for f in Doc.__dataclass_fields__])
    frame["source"] = source
    frame["generator_family"] = frame["generator"].map(generator_family)
    frame["is_edited"] = frame["edit_type"] != "none"
    frame["licence"] = licence
    frame["use"] = use
    frame["ood_set"] = ood_set
    frame["n_words"] = 0
    frame["language"] = ""
    return frame[COLUMNS]


def validate_frame(frame: pd.DataFrame) -> None:
    """Raise ``ValueError`` if ``frame`` breaks the schema's invariants."""
    missing = [c for c in COLUMNS if c not in frame.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    bad_labels = set(frame["label"]) - set(LABELS)
    if bad_labels:
        raise ValueError(f"unknown labels: {sorted(bad_labels)}")
    if frame["text"].isna().any() or (frame["text"].str.len() == 0).any():
        raise ValueError("empty text")
    human_with_generator = (
        (frame["label"] == "human")
        & (frame["edit_type"] == "none")
        & (frame["generator"] != "human")
    )
    if human_with_generator.any():
        raise ValueError("unedited human documents must have generator 'human'")
    duplicated = frame.duplicated(["source", "doc_id"])
    if duplicated.any():
        example = frame.loc[duplicated, ["source", "doc_id"]].iloc[0].tolist()
        raise ValueError(f"duplicate (source, doc_id): {example}")
