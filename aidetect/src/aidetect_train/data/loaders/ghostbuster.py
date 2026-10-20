"""Ghostbuster data (Verma et al., 2023): essays, creative writing, news; ChatGPT and Claude.

Layout: ``<domain>/<variant>/<...>/<n>.txt``, where the same relative path in
``human/`` and in an AI variant refers to the same prompt. That shared path is
the group id. ``logprobs/`` folders hold model scores, not text, and are skipped.

The ``other/`` folder bundles third-party corpora (TOEFL essays, Lang-8, PELIC,
BAWE, ...) that keep their original licences, so they are exposed through a
separate loader and used for evaluation only.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

from aidetect_train.data.schema import Doc, Label, WriterL1

DOMAINS = {"essay": "student_essay", "wp": "creative_writing", "reuter": "news"}

# variant folder -> (label, generator). All AI variants are unedited
# generations; they differ in the prompt used.
VARIANTS: dict[str, tuple[Label, str]] = {
    "human": ("human", "human"),
    "gpt": ("ai", "gpt-3.5-turbo"),
    "gpt_prompt1": ("ai", "gpt-3.5-turbo"),
    "gpt_prompt2": ("ai", "gpt-3.5-turbo"),
    "gpt_writing": ("ai", "gpt-3.5-turbo"),
    "gpt_semantic": ("ai", "gpt-3.5-turbo"),
    "claude": ("ai", "claude-2023"),
}


def _text_files(folder: Path) -> Iterator[Path]:
    for path in sorted(folder.rglob("*.txt")):
        if "logprobs" not in path.relative_to(folder).parts:
            yield path


def load(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load the main Ghostbuster domains.

    Options:
        domains: subset of ``essay``, ``wp``, ``reuter`` (default: all).
        variants: subset of the variant folders (default: all).
    """
    domains = options.get("domains", list(DOMAINS))
    variants = options.get("variants", list(VARIANTS))
    for domain in domains:
        for variant in variants:
            label, generator = VARIANTS[variant]
            folder = root / domain / variant
            if not folder.is_dir():
                continue
            for path in _text_files(folder):
                rel = path.relative_to(folder).with_suffix("").as_posix()
                yield Doc(
                    text=path.read_text(encoding="utf-8", errors="replace"),
                    label=label,
                    doc_id=f"{domain}/{variant}/{rel}",
                    group_id=f"ghostbuster/{domain}/{rel}",
                    domain=DOMAINS[domain],
                    generator=generator,
                )


# subset -> (label, writer_l1, domain, generator, edit_type)
OTHER_SUBSETS: dict[str, tuple[Label, WriterL1, str, str, str]] = {
    "toefl91": ("human", "non_native", "toefl_essay", "human", "none"),
    "ets": ("human", "non_native", "toefl_essay", "human", "none"),
    "lang8": ("human", "non_native", "learner_journal", "human", "none"),
    "pelic": ("human", "non_native", "learner_essay", "human", "none"),
    "bawe": ("human", "unknown", "academic_writing", "human", "none"),
    "undetectable": ("ai", "unknown", "news", "gpt-3.5-turbo", "humanizer"),
}


def load_other(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load one third-party subset from ``other/`` (option ``subset``)."""
    subset = options["subset"]
    folder = root / "other" / subset
    if subset == "gptzero":
        pairs: tuple[tuple[str, Label, str], ...] = (
            ("human", "human", "human"),
            ("gpt", "ai", "gpt-3.5-turbo"),
        )
        for variant, label, generator in pairs:
            for path in _text_files(folder / variant):
                rel = path.relative_to(folder / variant).with_suffix("").as_posix()
                yield Doc(
                    text=path.read_text(encoding="utf-8", errors="replace"),
                    label=label,
                    doc_id=f"gptzero/{variant}/{rel}",
                    group_id=f"ghostbuster-gptzero/{variant}/{rel}",
                    domain="mixed",
                    generator=generator,
                )
        return
    label, writer_l1, domain, generator, edit_type = OTHER_SUBSETS[subset]
    for path in _text_files(folder):
        rel = path.relative_to(folder).with_suffix("").as_posix()
        yield Doc(
            text=path.read_text(encoding="utf-8", errors="replace"),
            label=label,
            doc_id=f"{subset}/{rel}",
            group_id=f"ghostbuster-{subset}/{rel}",
            domain=domain,
            generator=generator,
            edit_type=edit_type,
            writer_l1=writer_l1,
        )
