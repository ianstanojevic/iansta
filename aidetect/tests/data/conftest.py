"""Small synthetic copies of each source's on-disk format, for loader and pipeline tests."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import pandas as pd
import pytest

from aidetect_train.data.schema import Doc, docs_to_frame

LOREM_HUMAN = (
    "Honestly I wasn't sure the bus would come, so I walked the long way past the bakery "
    "and the old cinema, which still smells like popcorn even though it closed years ago. "
    "My sister says I exaggerate, but she wasn't there."
)
LOREM_AI = (
    "Public transportation plays a crucial role in modern urban life. It reduces traffic "
    "congestion, lowers emissions, and provides affordable mobility for residents. "
    "Furthermore, investing in reliable bus networks fosters economic growth and equity."
)


def words(n: int, seed: str = "w") -> str:
    """A deterministic pseudo-text of ``n`` distinct-ish words."""
    vocab = [f"{seed}{i}" for i in range(n)]
    return " ".join(vocab) + "."


@pytest.fixture
def make_frame() -> Callable[..., pd.DataFrame]:
    """Build a schema frame from a list of ``Doc`` plus source metadata."""

    def _make(docs: list[Doc], source: str = "src", use: str = "train") -> pd.DataFrame:
        frame = docs_to_frame(
            docs,
            source=source,
            licence="mit",
            use=use,
            ood_set="" if use == "train" else "ood",
        )
        frame["n_words"] = frame["text"].str.split().str.len()
        frame["language"] = "en"
        return frame

    return _make


@pytest.fixture
def ghostbuster_root(tmp_path: Path) -> Path:
    root = tmp_path / "ghostbuster"
    for domain in ("essay", "reuter"):
        for variant, text in (("human", LOREM_HUMAN), ("gpt", LOREM_AI), ("claude", LOREM_AI)):
            sub = root / domain / variant / ("AuthorA" if domain == "reuter" else "")
            sub.mkdir(parents=True, exist_ok=True)
            for i in range(2):
                (sub / f"{i}.txt").write_text(f"{text} ({domain} {variant} {i})")
            for skipped in ("logprobs", "logprobs_babbage", ".ipynb_checkpoints", "headlines"):
                (sub / skipped).mkdir(exist_ok=True)
                (sub / skipped / "0.txt").write_text("not a document")
    other = root / "other" / "toefl91"
    other.mkdir(parents=True)
    (other / "0.txt").write_text(LOREM_HUMAN)
    return root


@pytest.fixture
def ellipse_root(tmp_path: Path) -> Path:
    root = tmp_path / "ellipse"
    root.mkdir()
    pd.DataFrame(
        {
            "text_id_kaggle": ["111", "222"],
            "full_text": [
                LOREM_HUMAN,
                "My friend Generic_Name lives in Generic_City. " + LOREM_HUMAN,
            ],
            "set": ["train", "train"],
        }
    ).to_csv(root / "ELLIPSE_Final_github_train.csv", index=False)
    return root


@pytest.fixture
def beemo_root(tmp_path: Path) -> Path:
    root = tmp_path / "beemo"
    root.mkdir()
    edits = repr([{"P1": LOREM_AI + " edited by llama"}, {"P2": LOREM_AI + " second llama"}])
    pd.DataFrame(
        {
            "id": ["0", "1"],
            "category": ["Open QA", "Open QA"],
            "model": ["HuggingFaceH4/zephyr-7b-beta", "google/gemma-7b-it"],
            "prompt_id": ["p1", "p1"],
            "prompt": ["q", "q"],
            "model_output": [LOREM_AI, LOREM_AI + " gemma"],
            "human_output": [LOREM_HUMAN, LOREM_HUMAN],
            "human_edits": [LOREM_AI + " expert", LOREM_AI + " expert gemma"],
            "llama-3.1-70b_edits": [edits, ""],
            "gpt-4o_edits": [repr([{"P1": LOREM_AI + " by gpt-4o"}]), ""],
        }
    ).to_parquet(root / "dataset.parquet")
    return root


@pytest.fixture
def apt_root(tmp_path: Path) -> Path:
    data = tmp_path / "apt" / "data"
    (data / "polished").mkdir(parents=True)
    cols = ["id", "model", "decoding", "repetition_penalty", "attack", "domain", "generation"]
    pd.DataFrame([[1, "human", "none", "none", "none", "blog", LOREM_HUMAN]], columns=cols).to_csv(
        data / "HWT_original_data.csv", index=False
    )
    pd.DataFrame(
        [[1, "hybrid", "none", "none", "polish_minor", "blog", LOREM_HUMAN + " polished"]],
        columns=cols,
    ).to_csv(data / "polished" / "polished_texts_minor_gpt.csv", index=False)
    pd.DataFrame(
        [
            [1, "human", "none", "none", "none", "blog", LOREM_HUMAN],
            [7, "GPT4", "none", "none", "none", "SQuAD1_LLMs", LOREM_AI],
        ],
        columns=cols,
    ).to_csv(data / "merged_mgt_hwt_data.csv", index=False)
    return tmp_path / "apt"


@pytest.fixture
def detectrl_root(tmp_path: Path) -> Path:
    folder = tmp_path / "detectrl" / "Benchmark" / "Original_Dataset"
    folder.mkdir(parents=True)
    item = {
        "id": "1",
        "abstract": LOREM_HUMAN,
        "direct_prompt": LOREM_AI,
        "llm_type": "ChatGPT",
        "adversarial_character_human": LOREM_HUMAN + " typo",
        "paraphrase_polish_human": LOREM_HUMAN + " polished",
        "paraphrase_dipper_llm": LOREM_AI + " dipper",
    }
    (folder / "arxiv_2800.json").write_text(json.dumps([item]))
    return tmp_path / "detectrl"


@pytest.fixture
def m4_root(tmp_path: Path) -> Path:
    data = tmp_path / "m4" / "data"
    data.mkdir(parents=True)
    rows = [
        {"human_text": LOREM_HUMAN, "machine_text": LOREM_AI, "model": "gpt-3.5-turbo",
         "source_ID": "abc"},
    ]  # fmt: skip
    (data / "reddit_chatGPT.jsonl").write_text("\n".join(json.dumps(r) for r in rows))
    (data / "reddit_cohere.jsonl").write_text(
        json.dumps({**rows[0], "machine_text": LOREM_AI + " cohere", "model": "cohere"})
    )
    (data / "arabic_chatGPT.jsonl").write_text(json.dumps(rows[0]))
    return tmp_path / "m4"
