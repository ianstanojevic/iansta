"""Writing-style features: sentence rhythm, vocabulary, punctuation, function words.

All features are rates or ratios, so they are comparable across text lengths,
and each has a plain-language description used in explanations.
"""

from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np

from aidetect.core.text import split_paragraphs, split_sentences

_WORD = re.compile(r"[^\W\d_](?:[\w'’\-]*[^\W_])?", re.UNICODE)

FUNCTION_WORDS = frozenset(
    [
        "a",
        "about",
        "above",
        "after",
        "again",
        "against",
        "all",
        "am",
        "an",
        "and",
        "any",
        "are",
        "as",
        "at",
        "be",
        "because",
        "been",
        "before",
        "being",
        "below",
        "between",
        "both",
        "but",
        "by",
        "can",
        "could",
        "did",
        "do",
        "does",
        "doing",
        "down",
        "during",
        "each",
        "few",
        "for",
        "from",
        "further",
        "had",
        "has",
        "have",
        "having",
        "he",
        "her",
        "here",
        "hers",
        "herself",
        "him",
        "himself",
        "his",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "itself",
        "just",
        "me",
        "more",
        "most",
        "my",
        "myself",
        "no",
        "nor",
        "not",
        "now",
        "of",
        "off",
        "on",
        "once",
        "only",
        "or",
        "other",
        "our",
        "ours",
        "ourselves",
        "out",
        "over",
        "own",
        "same",
        "she",
        "should",
        "so",
        "some",
        "such",
        "than",
        "that",
        "the",
        "their",
        "theirs",
        "them",
        "themselves",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "through",
        "to",
        "too",
        "under",
        "until",
        "up",
        "very",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "while",
        "who",
        "whom",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
        "yours",
        "yourself",
        "yourselves",
    ]
)

# Connectives that AI assistants overuse. Matched as whole phrases, lower case.
TRANSITIONS = (
    "additionally", "furthermore", "moreover", "in addition", "in conclusion",
    "overall", "ultimately", "consequently", "therefore", "thus", "however",
    "nevertheless", "notably", "importantly", "it is important to note",
    "it is worth noting", "in summary", "to summarize", "on the other hand",
    "in today's", "plays a crucial role", "plays a vital role", "a testament to",
    "delve", "navigate", "landscape", "foster", "crucial", "vital", "pivotal",
    "seamless", "robust", "tapestry", "realm", "multifaceted", "nuanced",
)  # fmt: skip
_TRANSITION_RE = re.compile(r"\b(?:" + "|".join(map(re.escape, TRANSITIONS)) + r")\b")
_CONTRACTION = re.compile(r"\b\w+(?:'|’)(?:t|s|re|ve|ll|d|m)\b", re.IGNORECASE)
_FIRST_PERSON = frozenset({"i", "me", "my", "mine", "myself", "we", "us", "our", "ours"})
_SECOND_PERSON = frozenset({"you", "your", "yours", "yourself", "yourselves"})

# name -> plain-language description (what a high value means).
FEATURES: dict[str, str] = {
    "log_words": "length of the text",
    "sent_len_mean": "average sentence length",
    "sent_len_cv": "how much sentence lengths vary",
    "sent_len_max_ratio": "how long the longest sentence is compared with the average",
    "word_len_mean": "average word length",
    "word_len_cv": "how much word lengths vary",
    "mattr": "vocabulary variety",
    "hapax_ratio": "share of words used only once",
    "yules_k": "how often the same words are repeated",
    "function_word_rate": "share of small function words (the, of, and ...)",
    "comma_rate": "commas per sentence",
    "semicolon_rate": "use of semicolons",
    "colon_rate": "use of colons",
    "dash_rate": "use of dashes",
    "paren_rate": "use of brackets",
    "exclaim_rate": "use of exclamation marks",
    "question_rate": "use of question marks",
    "quote_rate": "use of quotation marks",
    "ellipsis_rate": "use of '...'",
    "contraction_rate": "use of contractions (don't, it's)",
    "first_person_rate": "use of I, me, we",
    "second_person_rate": "use of you, your",
    "transition_rate": "stock connective words (moreover, furthermore, crucial ...)",
    "repeat_trigram_rate": "repeated three-word phrases",
    "sent_start_diversity": "variety in how sentences begin",
    "para_len_cv": "how much paragraph lengths vary",
    "words_per_para": "paragraph length",
    "digit_rate": "use of digits",
    "upper_rate": "use of capital letters",
    "lowercase_sent_start": "sentences that start with a lower-case letter",
    "double_space_or_typo": "informal slips (doubled words, missing spaces after full stops)",
}


def _mattr(words: list[str], window: int = 50) -> float:
    """Moving-average type-token ratio: vocabulary variety independent of length."""
    if len(words) <= window:
        return len(set(words)) / max(len(words), 1)
    counts = Counter(words[:window])
    total = len(counts)
    for i in range(window, len(words)):
        out, inc = words[i - window], words[i]
        counts[out] -= 1
        if counts[out] == 0:
            del counts[out]
        counts[inc] += 1
        total += len(counts)
    return total / ((len(words) - window + 1) * window)


def _cv(values: list[int] | list[float]) -> float:
    arr = np.asarray(values, dtype=float)
    if arr.size < 2 or arr.mean() == 0:
        return 0.0
    return float(arr.std() / arr.mean())


def extract(text: str) -> dict[str, float]:
    """Compute every feature in :data:`FEATURES` for a normalised text."""
    sentences = [s.text(text) for s in split_sentences(text)] or [text]
    paragraphs = [p.text(text) for p in split_paragraphs(text)] or [text]
    words = [w.lower() for w in _WORD.findall(text)]
    n = max(len(words), 1)
    per100 = 100.0 / n
    sent_lens = [len(_WORD.findall(s)) for s in sentences]
    sent_lens = [x for x in sent_lens if x > 0] or [0]
    word_lens = [len(w) for w in words] or [0]
    counts = Counter(words)
    m2 = sum(c * c for c in counts.values())
    trigrams = list(zip(words, words[1:], words[2:], strict=False))
    tri_counts = Counter(trigrams)
    lower = text.lower()
    starts = [_WORD.findall(s)[:1] for s in sentences]
    first_words = [s[0].lower() for s in starts if s]
    n_sent = max(len(sentences), 1)

    return {
        "log_words": math.log1p(len(words)),
        "sent_len_mean": float(np.mean(sent_lens)),
        "sent_len_cv": _cv(sent_lens),
        "sent_len_max_ratio": max(sent_lens) / max(float(np.mean(sent_lens)), 1.0),
        "word_len_mean": float(np.mean(word_lens)),
        "word_len_cv": _cv(word_lens),
        "mattr": _mattr(words),
        "hapax_ratio": sum(1 for c in counts.values() if c == 1) / n,
        "yules_k": 1e4 * (m2 - n) / (n * n) if n > 1 else 0.0,
        "function_word_rate": sum(counts[w] for w in FUNCTION_WORDS if w in counts) / n,
        "comma_rate": text.count(",") / n_sent,
        "semicolon_rate": text.count(";") * per100,
        "colon_rate": text.count(":") * per100,
        "dash_rate": (text.count("—") + text.count("–") + text.count(" - ")) * per100,
        "paren_rate": text.count("(") * per100,
        "exclaim_rate": text.count("!") * per100,
        "question_rate": text.count("?") * per100,
        "quote_rate": sum(text.count(q) for q in '"“”') * per100,
        "ellipsis_rate": (text.count("...") + text.count("…")) * per100,
        "contraction_rate": len(_CONTRACTION.findall(text)) * per100,
        "first_person_rate": sum(counts[w] for w in _FIRST_PERSON) * per100,
        "second_person_rate": sum(counts[w] for w in _SECOND_PERSON) * per100,
        "transition_rate": len(_TRANSITION_RE.findall(lower)) * per100,
        "repeat_trigram_rate": sum(c - 1 for c in tri_counts.values() if c > 1)
        / max(len(trigrams), 1),
        "sent_start_diversity": len(set(first_words)) / max(len(first_words), 1),
        "para_len_cv": _cv([len(_WORD.findall(p)) for p in paragraphs]),
        "words_per_para": len(words) / max(len(paragraphs), 1),
        "digit_rate": sum(c.isdigit() for c in text) / max(len(text), 1),
        "upper_rate": sum(c.isupper() for c in text) / max(len(text), 1),
        "lowercase_sent_start": sum(1 for s in sentences if s[:1].islower()) / n_sent,
        "double_space_or_typo": (
            len(re.findall(r"\b(\w+) \1\b", lower)) + len(re.findall(r"[a-z][.,][A-Za-z]", text))
        )
        * per100,
    }


def extract_matrix(texts: list[str]) -> np.ndarray:
    """Feature matrix (documents x features), columns in :data:`FEATURES` order."""
    names = list(FEATURES)
    return np.array([[row[k] for k in names] for row in map(extract, texts)], dtype=float)
