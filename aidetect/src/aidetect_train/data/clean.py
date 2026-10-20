"""Cleaning: normalise text, remove dataset artefacts, drop unusable documents.

Every rule here removes something that would let a model separate human from
AI text for a reason that does not exist in real use (an anonymisation tag, a
chatbot preamble, a refusal), or drops text the detector is not meant for.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

import pandas as pd
import py3langid

from aidetect.core.text import count_words, normalise_text

# Chatbot framing a user would delete before submitting, at the very start.
_PREAMBLE = re.compile(
    r"\A(?:(?:sure|certainly|of course|absolutely)[!,.]?\s+)?"
    r"(?:here(?:'s| is| are)\b[^\n]{0,120}?[:.]|i(?:'d| would) be happy to[^\n]{0,120}?[:.])\s*\n+",
    re.IGNORECASE,
)
# Generations that are not documents at all.
_REFUSAL = re.compile(
    r"\bas an ai(?: language)? model\b"
    r"|\bi(?:'m| am) (?:sorry|unable),? but i (?:can(?:'t|not)|am unable)"
    r"|\bi cannot (?:fulfil|fulfill|comply|help with)",
    re.IGNORECASE,
)

# Anonymisation placeholders (ELLIPSE, PERSUADE) -> plausible surface forms,
# chosen deterministically per document so a build is reproducible.
_PLACEHOLDER_FILL: dict[str, tuple[str, ...]] = {
    "name": ("Maria", "James", "Aisha", "Daniel", "Sofia", "Kevin", "Linh", "Carlos", "Emma",
             "Omar", "Grace", "Luis", "Hannah", "Tyler", "Priya", "Jordan"),
    "city": ("Springfield", "Riverside", "Fairview", "Georgetown", "Franklin", "Clinton"),
    "school": ("Lincoln High School", "Roosevelt Middle School", "Westview High School",
               "Jefferson Academy"),
    "place": ("the mall", "the park", "the library", "downtown"),
    "store": ("the grocery store", "Walmart", "Target"),
    "language": ("Spanish", "French", "Arabic", "Vietnamese"),
}  # fmt: skip
_PLACEHOLDER = re.compile(r"\b(?:Generic_(?P<g>[A-Za-z]+?)|(?P<u>[A-Z]+)_NAME|PROEPR_NAME)\b")
_PLACEHOLDER_KIND = {
    "name": "name", "city": "city", "school": "school", "student": "name", "teacher": "name",
    "proper": "name", "other": "name", "location": "place", "store": "store",
    "restaurant": "store", "language": "language", "": "name",
}  # fmt: skip


def fill_placeholders(text: str, seed: str) -> str:
    """Replace anonymisation tags with ordinary names, stable for a given ``seed``."""

    def replace(match: re.Match[str]) -> str:
        raw = (match["g"] or match["u"] or "").lower()
        kind = _PLACEHOLDER_KIND.get(raw, "name")
        choices = _PLACEHOLDER_FILL[kind]
        digest = hashlib.sha1(f"{seed}:{match.start()}".encode()).digest()
        return choices[digest[0] % len(choices)]

    return _PLACEHOLDER.sub(replace, text)


@dataclass
class CleanStats:
    """How many documents each rule removed, for the build report."""

    input: int = 0
    dropped: dict[str, int] = field(default_factory=dict)

    def drop(self, reason: str, n: int) -> None:
        """Record ``n`` documents dropped for ``reason``."""
        if n:
            self.dropped[reason] = self.dropped.get(reason, 0) + n


def detect_language(text: str) -> str:
    """ISO 639-1 code of the dominant language (``py3langid``, offline)."""
    lang, _score = py3langid.classify(text[:2000])
    return str(lang)


def clean_frame(
    frame: pd.DataFrame,
    *,
    min_words: int,
    max_words: int,
    languages: tuple[str, ...] = ("en",),
    stats: CleanStats | None = None,
) -> pd.DataFrame:
    """Apply all cleaning rules to a frame in the common schema.

    Args:
        frame: Documents from one or more loaders.
        min_words: Drop documents shorter than this after cleaning.
        max_words: Drop documents longer than this (they are usually concatenation errors).
        languages: Keep only these languages.
        stats: Optional collector for drop counts.

    Returns:
        A new frame with cleaned ``text`` and filled ``n_words`` / ``language``.
    """
    stats = stats if stats is not None else CleanStats()
    stats.input += len(frame)
    out = frame.copy()

    has_placeholders = out["artefacts"].map(lambda a: "anonymisation_placeholders" in a)
    flagged = out.loc[has_placeholders, ["text", "doc_id"]]
    out.loc[has_placeholders, "text"] = [
        fill_placeholders(text, doc_id)
        for text, doc_id in zip(flagged["text"], flagged["doc_id"], strict=True)
    ]
    out["text"] = out["text"].map(normalise_text)

    is_ai = out["label"] != "human"
    out.loc[is_ai, "text"] = out.loc[is_ai, "text"].str.replace(_PREAMBLE, "", regex=True)

    refusal = is_ai & out["text"].str.contains(_REFUSAL, regex=True)
    stats.drop("refusal_or_ai_disclaimer", int(refusal.sum()))
    out = out[~refusal]

    out["n_words"] = out["text"].map(count_words)
    too_short = out["n_words"] < min_words
    stats.drop(f"under_{min_words}_words", int(too_short.sum()))
    out = out[~too_short]
    too_long = out["n_words"] > max_words
    stats.drop(f"over_{max_words}_words", int(too_long.sum()))
    out = out[~too_long]

    out["language"] = out["text"].map(detect_language)
    wrong_language = ~out["language"].isin(languages)
    stats.drop("not_" + "_".join(languages), int(wrong_language.sum()))
    out = out[~wrong_language]
    return out.reset_index(drop=True)
