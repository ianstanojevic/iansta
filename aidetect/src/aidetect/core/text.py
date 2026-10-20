"""Text normalisation and segmentation.

The same functions run at training time and inside the app, so a document is
scored exactly as the training data was prepared. Normalisation also undoes
the cheap evasion tricks found in detection benchmarks: zero-width characters,
look-alike letters from other scripts, and stray whitespace.

Segmentation returns character spans into the *normalised* text so that
per-sentence scores can be drawn back onto it as a heatmap.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Characters that render as nothing and are used to break up tokens without
# changing how the text looks: zero-width space/joiners, word joiner, BOM,
# soft hyphen, Mongolian vowel separator, invisible math operators.
_INVISIBLE_CODEPOINTS = (
    0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00AD, 0x180E, 0x2061, 0x2062, 0x2063, 0x2064,
)  # fmt: skip
# Characters that render as an ordinary space: no-break space, Ogham space,
# the en/em/thin/hair space family, narrow no-break, math and ideographic space.
_SPACE_CODEPOINTS = (0x00A0, 0x1680, *range(0x2000, 0x200B), 0x202F, 0x205F, 0x3000)
_CLEANUP_TABLE: dict[int, str | None] = {
    **dict.fromkeys(_INVISIBLE_CODEPOINTS, None),
    **dict.fromkeys(_SPACE_CODEPOINTS, " "),
}

# Cyrillic and Greek letters that are visually identical to Latin ones, keyed
# by code point. They are only replaced inside words that also contain Latin
# letters, so genuine Russian or Greek text is left alone.
_HOMOGLYPHS: dict[int, str] = {
    # Cyrillic lower case
    0x0430: "a", 0x0435: "e", 0x043E: "o", 0x0440: "p", 0x0441: "c", 0x0443: "y",
    0x0445: "x", 0x0456: "i", 0x0458: "j", 0x0455: "s", 0x0501: "d", 0x051B: "q",
    0x051D: "w",
    # Cyrillic upper case
    0x0410: "A", 0x0412: "B", 0x0415: "E", 0x041A: "K", 0x041C: "M", 0x041D: "H",
    0x041E: "O", 0x0420: "P", 0x0421: "C", 0x0422: "T", 0x0425: "X", 0x0423: "Y",
    0x0406: "I", 0x0408: "J", 0x0405: "S",
    # Greek lower and upper case
    0x03BF: "o", 0x03B1: "a", 0x03C1: "p", 0x03BD: "v",
    0x0391: "A", 0x0392: "B", 0x0395: "E", 0x0396: "Z", 0x0397: "H", 0x0399: "I",
    0x039A: "K", 0x039C: "M", 0x039D: "N", 0x039F: "O", 0x03A1: "P", 0x03A4: "T",
    0x03A5: "Y", 0x03A7: "X",
}  # fmt: skip
_HOMOGLYPH_CHARS = frozenset(map(chr, _HOMOGLYPHS))
_WORD = re.compile(r"\w+", re.UNICODE)


def _is_latin_letter(ch: str) -> bool:
    return ch.isascii() and ch.isalpha()


def _fix_mixed_script_word(match: re.Match[str]) -> str:
    word = match.group(0)
    if any(c in _HOMOGLYPH_CHARS for c in word) and any(_is_latin_letter(c) for c in word):
        return word.translate(_HOMOGLYPHS)
    return word


def normalise_text(text: str) -> str:
    """Return a canonical form of ``text`` for scoring.

    Applies NFKC (which also folds "mathematical" look-alike letters and
    ligatures from PDFs), removes invisible characters, repairs mixed-script
    homoglyphs, unifies line endings and collapses runs of blank space.
    Paragraph breaks (blank lines) are kept because they carry signal.

    Args:
        text: Raw text from a file or the clipboard.

    Returns:
        The normalised text, stripped of leading and trailing whitespace.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.translate(_CLEANUP_TABLE)
    text = unicodedata.normalize("NFKC", text)
    text = _WORD.sub(_fix_mixed_script_word, text)
    # Drop remaining control characters except newline and tab.
    text = "".join(c for c in text if c in "\n\t" or unicodedata.category(c) != "Cc")
    text = text.replace("\t", " ")
    text = re.sub(r"[ ]{2,}", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


_WORD_TOKEN = re.compile(r"[^\W_](?:[\w'\u2019\-]*[^\W_])?", re.UNICODE)


def count_words(text: str) -> int:
    """Count words the way a person would (contractions and hyphenations count once)."""
    return sum(1 for _ in _WORD_TOKEN.finditer(text))


@dataclass(frozen=True, slots=True)
class Span:
    """A half-open character range ``[start, end)`` into a string."""

    start: int
    end: int

    def text(self, source: str) -> str:
        """Return the slice of ``source`` this span covers."""
        return source[self.start : self.end]


def split_paragraphs(text: str) -> list[Span]:
    """Split on blank lines. Returns spans with surrounding whitespace trimmed."""
    spans: list[Span] = []
    for match in re.finditer(r"(?:[^\n]|\n(?!\s*\n))+", text):
        start, end = match.start(), match.end()
        while start < end and text[start].isspace():
            start += 1
        while end > start and text[end - 1].isspace():
            end -= 1
        if end > start:
            spans.append(Span(start, end))
    return spans


# Abbreviations that are (almost) never the last word of a sentence, so a
# period after them is not a boundary. Lower-cased, without the final period.
# Words such as "etc.", "p.m." or "Inc." often do end sentences, so they are
# deliberately absent: a capitalised next word splits after them.
_ABBREVIATIONS = frozenset(
    [
        "mr",
        "mrs",
        "ms",
        "dr",
        "prof",
        "sr",
        "jr",
        "st",
        "mt",
        "ft",
        "vs",
        "al",
        "fig",
        "figs",
        "eq",
        "eqs",
        "no",
        "nos",
        "vol",
        "vols",
        "pp",
        "ch",
        "sec",
        "dept",
        "univ",
        "jan",
        "feb",
        "mar",
        "apr",
        "jun",
        "jul",
        "aug",
        "sep",
        "sept",
        "oct",
        "nov",
        "dec",
        "approx",
        "ca",
        "cf",
        "e.g",
        "i.e",
        "u.s",
        "u.k",
        "gen",
        "col",
        "lt",
        "sgt",
        "capt",
        "gov",
        "rep",
        "sen",
        "rev",
    ]
)

# A candidate boundary: terminal punctuation, optional closing quotes or
# brackets, then whitespace.
_BOUNDARY = re.compile(r"""[.!?\u2026]+["'\u201d\u2019)\]]*(?=\s)""")
_NEXT_STARTS_SENTENCE = re.compile(r"""\s+["'\u201c\u2018(\[]*[A-Z0-9À-ÖØ-Þ]""")


def _ends_with_abbreviation(text: str, dot_index: int) -> bool:
    """True if the period at ``dot_index`` closes an abbreviation or an initial."""
    start = dot_index
    while start > 0 and (text[start - 1].isalnum() or text[start - 1] == "."):
        start -= 1
    token = text[start:dot_index].lower()
    if not token:
        return False
    if token in _ABBREVIATIONS:
        return True
    # Single-letter initials such as "J. Smith".
    return len(token) == 1 and token.isalpha()


def split_sentences(text: str) -> list[Span]:
    """Split ``text`` into sentences.

    A rule-based splitter: it needs no model download, handles common
    abbreviations, initials, decimals and quotes, and treats every line break
    as a boundary so headings and list items stand alone.

    Args:
        text: Normalised text (see :func:`normalise_text`).

    Returns:
        Spans of the sentences in order, trimmed of whitespace.
    """
    cuts: list[int] = []
    for match in _BOUNDARY.finditer(text):
        punct_end = match.end()
        if not _NEXT_STARTS_SENTENCE.match(text, punct_end):
            continue
        punct = match.group(0).rstrip("\"'\u201d\u2019)]")
        if punct == "." and _ends_with_abbreviation(text, match.start()):
            continue
        cuts.append(punct_end)

    spans: list[Span] = []
    start = 0
    for boundary in [*cuts, len(text)]:
        for line in re.finditer(r"[^\n]+", text[start:boundary]):
            s, e = start + line.start(), start + line.end()
            while s < e and text[s].isspace():
                s += 1
            while e > s and text[e - 1].isspace():
                e -= 1
            if e > s:
                spans.append(Span(s, e))
        start = boundary
    return spans
