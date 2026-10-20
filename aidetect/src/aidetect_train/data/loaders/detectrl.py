"""DetectRL (Wu et al., NeurIPS 2024): real-world misuse domains with attacks.

``Benchmark/Original_Dataset/<domain>_2800.json`` holds, per item, the human
text and every derived variant. All variants of an item share its group.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from aidetect_train.data.schema import Doc, Label

# Generated fields sometimes have sentences glued together ("vibe.Now") or a
# title glued to the text ("FlameDeep"), from how the dataset was assembled.
_GLUED_SENTENCE = re.compile(r"(?<=[a-z][.!?])(?=[A-Z][a-z])")

HUMAN_FIELD = {
    "arxiv": "abstract",
    "writing_prompt": "story",
    "xsum": "document",
    "yelp_review": "content",
}
DOMAIN_NAME = {
    "arxiv": "academic_abstract",
    "writing_prompt": "creative_writing",
    "xsum": "news",
    "yelp_review": "review",
}

# field -> (label, edit_type). Human text attacked
# with typos is still human-written; human text paraphrased or translated by
# a model is "mixed".
VARIANTS: dict[str, tuple[Label, str]] = {
    "direct_prompt": ("ai", "none"),
    "prompt_few_shot": ("ai", "prompt_few_shot"),
    "prompt_SICO": ("ai", "prompt_sico_evasion"),
    "paraphrase_polish_llm": ("ai", "llm_polish"),
    "paraphrase_polish_human": ("mixed", "ai_polish"),
    "adversarial_character_human": ("human", "char_attack"),
    "adversarial_character_llm": ("ai", "char_attack"),
    "adversarial_word_human": ("human", "word_attack"),
    "adversarial_word_llm": ("ai", "word_attack"),
    "adversarial_character_word_human": ("human", "char_word_attack"),
    "adversarial_character_word_llm": ("ai", "char_word_attack"),
    "paraphrase_back_translation_human": ("mixed", "back_translation"),
    "paraphrase_back_translation_llm": ("ai", "back_translation"),
    "paraphrase_dipper_human": ("mixed", "dipper_paraphrase"),
    "paraphrase_dipper_llm": ("ai", "dipper_paraphrase"),
}


def load(root: Path, options: dict[str, Any]) -> Iterator[Doc]:
    """Load DetectRL's original items with all their variants.

    Options:
        domains: subset of the four domains (default: all).
        variants: subset of ``VARIANTS`` (default: all).
    """
    domains = options.get("domains", list(HUMAN_FIELD))
    variants = options.get("variants", list(VARIANTS))
    for domain in domains:
        path = root / "Benchmark" / "Original_Dataset" / f"{domain}_2800.json"
        items = json.loads(path.read_text(encoding="utf-8"))
        for item in items:
            group = f"detectrl/{domain}/{item['id']}"
            generator = str(item["llm_type"])
            yield Doc(
                str(item[HUMAN_FIELD[domain]]),
                "human",
                f"{domain}/{item['id']}/human",
                group,
                DOMAIN_NAME[domain],
            )
            for field in variants:
                text = item.get(field)
                if not text:
                    continue
                label, edit_type = VARIANTS[field]
                attacked_human = label == "human"
                # Only machine-produced fields are repaired: in human text a
                # missing space is the writer's own and is real signal.
                cleaned = str(text) if attacked_human else _GLUED_SENTENCE.sub(" ", str(text))
                yield Doc(
                    cleaned,
                    label,
                    f"{domain}/{item['id']}/{field}",
                    group,
                    DOMAIN_NAME[domain],
                    generator="textattack" if attacked_human else generator,
                    edit_type=edit_type,
                )
