"""Checks that tell the user when a result should not be trusted."""

from __future__ import annotations

import re
from dataclasses import dataclass

import py3langid

from aidetect.core.text import count_words, split_paragraphs

MIN_WORDS = 150


@dataclass(frozen=True)
class ReliabilityWarning:
    """A reliability warning. ``blocking`` warnings cap the verdict at "Inconclusive"."""

    code: str
    message: str
    blocking: bool


_QUOTED = re.compile(r"[\"“][^\"”]{20,}[\"”]")
_CODE_HINTS = re.compile(
    r"(?m)^\s*(?:def |class |import |from \S+ import|#include|public |function |var |let |const )"
    r"|[{};]\s*$|==|!=|=>|\)\s*\{"
)
_LIST_LINE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")


def check(text: str) -> list[ReliabilityWarning]:
    """Return every warning that applies to a normalised text."""
    warnings: list[ReliabilityWarning] = []
    n_words = count_words(text)
    if n_words < MIN_WORDS:
        warnings.append(
            ReliabilityWarning(
                "short",
                f"This text has {n_words} words. Below about {MIN_WORDS} words there is too "
                "little writing to judge, so no verdict is given.",
                True,
            )
        )
    quoted = sum(len(m.group(0)) for m in _QUOTED.finditer(text))
    if text and quoted / len(text) > 0.3:
        warnings.append(
            ReliabilityWarning(
                "quotes",
                "Much of this text is quotation. Quoted material was written by someone else "
                "and distorts the result.",
                True,
            )
        )
    lines = [ln for ln in text.split("\n") if ln.strip()]
    if lines:
        code_lines = sum(1 for ln in lines if _CODE_HINTS.search(ln))
        if code_lines / len(lines) > 0.25:
            warnings.append(
                ReliabilityWarning(
                    "code",
                    "This looks like program code, which the detector is not built for.",
                    True,
                )
            )
        list_lines = sum(1 for ln in lines if _LIST_LINE.match(ln))
        if list_lines / len(lines) > 0.4:
            warnings.append(
                ReliabilityWarning(
                    "lists",
                    "This text is mostly a list. Lists and bullet points carry little style "
                    "information, so the result is less reliable.",
                    False,
                )
            )
    if n_words >= 20:
        lang, _ = py3langid.classify(text[:3000])
        if lang != "en":
            warnings.append(
                ReliabilityWarning(
                    "language",
                    "This does not look like English. The detector was trained on English only.",
                    True,
                )
            )
    if len(split_paragraphs(text)) == 1 and n_words > 600:
        warnings.append(
            ReliabilityWarning(
                "layout",
                "The text has no paragraph breaks; if it was copied from a PDF, layout may "
                "have been lost.",
                False,
            )
        )
    warnings.append(
        ReliabilityWarning(
            "always",
            "Formal, technical, template-based or heavily edited writing, and writing by people "
            "using a second language, can look more 'AI-like' than it is.",
            False,
        )
    )
    return warnings
