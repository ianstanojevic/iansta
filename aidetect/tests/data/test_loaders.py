import json
from pathlib import Path

import pandas as pd

from aidetect_train.data.loaders import get_loader
from aidetect_train.data.schema import Doc

from .conftest import LOREM_AI, LOREM_HUMAN


def load(name: str, root: Path, **options: object) -> list[Doc]:
    return list(get_loader(name)(root, dict(options)))


def test_ghostbuster_pairs_share_groups_and_skip_logprobs(ghostbuster_root: Path) -> None:
    docs = load("ghostbuster", ghostbuster_root, domains=["essay", "reuter"])
    # 2 domains x 3 variants x 2 files; logprobs*, headlines and hidden folders ignored
    assert len(docs) == 12
    assert not any("not a document" in d.text for d in docs)
    by_group: dict[str, set[str]] = {}
    for doc in docs:
        by_group.setdefault(doc.group_id, set()).add(doc.label)
    assert all(labels == {"human", "ai"} for labels in by_group.values())
    reuter = next(d for d in docs if d.domain == "news" and d.label == "ai")
    assert reuter.group_id.startswith("ghostbuster/reuter/AuthorA/")
    assert {d.generator for d in docs if d.label == "ai"} == {"gpt-3.5-turbo", "claude-2023"}


def test_ghostbuster_other_subset(ghostbuster_root: Path) -> None:
    (doc,) = load("ghostbuster_other", ghostbuster_root, subset="toefl91")
    assert doc.label == "human"
    assert doc.writer_l1 == "non_native"


def test_ellipse_flags_placeholders(ellipse_root: Path) -> None:
    docs = load("ellipse", ellipse_root)
    assert [d.artefacts for d in docs] == [(), ("anonymisation_placeholders",)]
    assert all(d.writer_l1 == "non_native" and d.label == "human" for d in docs)


def test_beemo_emits_human_model_expert_and_llm_edits(beemo_root: Path) -> None:
    docs = load("beemo", beemo_root)
    kinds = [(d.label, d.edit_type) for d in docs]
    assert kinds.count(("human", "none")) == 1  # one human answer per prompt
    assert kinds.count(("ai", "none")) == 2
    assert kinds.count(("ai", "expert_edit")) == 2
    assert kinds.count(("ai", "llm_edit")) == 3
    assert {d.group_id for d in docs} == {"beemo/p1"}
    assert {d.domain for d in docs} == {"instruction_open_qa"}


def test_apt_eval_polished_is_mixed(apt_root: Path) -> None:
    docs = load("apt_eval", apt_root)
    labels = {(d.label, d.edit_type, d.generator) for d in docs}
    assert ("human", "none", "human") in labels
    assert ("mixed", "ai_polish_minor", "gpt-4o") in labels
    assert ("ai", "none", "GPT4") in labels
    polished = next(d for d in docs if d.label == "mixed")
    original = next(d for d in docs if d.label == "human")
    assert polished.group_id == original.group_id


def test_detectrl_variants(detectrl_root: Path) -> None:
    docs = load("detectrl", detectrl_root, domains=["arxiv"])
    got = {(d.label, d.edit_type) for d in docs}
    assert got == {
        ("human", "none"),
        ("ai", "none"),
        ("human", "char_attack"),
        ("mixed", "ai_polish"),
        ("ai", "dipper_paraphrase"),
    }
    attacked = next(d for d in docs if d.edit_type == "char_attack")
    assert attacked.generator == "textattack"


def test_m4_english_only_and_human_once(m4_root: Path) -> None:
    docs = load("m4", m4_root, domains=["reddit"])
    assert [d.label for d in docs].count("human") == 1
    assert {d.generator for d in docs if d.label == "ai"} == {"gpt-3.5-turbo", "cohere"}


def test_raid(tmp_path: Path) -> None:
    pd.DataFrame(
        {
            "id": ["h1", "g1", "g1a"],
            "adv_source_id": ["h1", "g1", "g1"],
            "source_id": ["h1", "h1", "h1"],
            "model": ["human", "mistral-chat", "mistral-chat"],
            "decoding": ["", "sampling", "sampling"],
            "repetition_penalty": ["", "no", "no"],
            "attack": ["none", "none", "paraphrase"],
            "domain": ["news", "news", "news"],
            "title": ["t", "t", "t"],
            "prompt": ["", "p", "p"],
            "generation": [LOREM_HUMAN, LOREM_AI, LOREM_AI + " paraphrased"],
        }
    ).to_csv(tmp_path / "train.csv", index=False)
    docs = load("raid", tmp_path)
    assert [(d.label, d.edit_type) for d in docs] == [
        ("human", "none"),
        ("ai", "none"),
        ("ai", "attack_paraphrase"),
    ]
    assert {d.group_id for d in docs} == {"raid/h1"}


def test_hc3_skips_open_qa(tmp_path: Path) -> None:
    rows = [
        {"id": 1, "question": "q", "human_answers": [LOREM_HUMAN], "chatgpt_answers": [LOREM_AI],
         "source": "reddit_eli5"},
        {"id": 2, "question": "q", "human_answers": [LOREM_HUMAN], "chatgpt_answers": [],
         "source": "open_qa"},
    ]  # fmt: skip
    (tmp_path / "all.jsonl").write_text("\n".join(json.dumps(r) for r in rows))
    docs = load("hc3", tmp_path)
    assert [(d.label, d.domain) for d in docs] == [
        ("human", "qa_reddit_eli5"),
        ("ai", "qa_reddit_eli5"),
    ]


def test_mage_label_convention(tmp_path: Path) -> None:
    pd.DataFrame(
        {
            "text": [LOREM_HUMAN, LOREM_AI],
            "label": [1, 0],  # MAGE: 1 = human, 0 = machine
            "src": ["cmv_human", "cmv_machine_specified_gpt-3.5-trubo"],
        }
    ).to_csv(tmp_path / "train.csv", index=False)
    docs = load("mage", tmp_path, files=["train.csv"])
    assert [(d.label, d.domain, d.generator) for d in docs] == [
        ("human", "cmv", "human"),
        ("ai", "cmv", "gpt-3.5-trubo"),
    ]
