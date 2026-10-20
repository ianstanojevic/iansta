"""End-to-end: the real CLI building a dataset from synthetic sources, offline."""

import json
import random
from pathlib import Path

import pandas as pd
import pytest

from aidetect_train.data.cli import main

CARD_MIT = "---\nlicense: mit\n---\n# Fixture dataset\n"


VOCAB = [
    "time",
    "person",
    "year",
    "way",
    "day",
    "thing",
    "man",
    "world",
    "life",
    "hand",
    "part",
    "child",
    "eye",
    "woman",
    "place",
    "work",
    "week",
    "case",
    "point",
    "government",
    "company",
    "number",
    "group",
    "problem",
    "fact",
    "river",
    "garden",
    "window",
    "letter",
    "morning",
    "evening",
    "teacher",
    "student",
    "kitchen",
    "market",
    "winter",
    "summer",
    "music",
    "story",
    "picture",
    "village",
    "journey",
    "answer",
    "question",
    "reason",
    "friend",
    "family",
    "country",
    "history",
    "science",
    "moment",
]


def sentence(rng: random.Random, n: int = 45) -> str:
    # Real English words (the build drops non-English text), randomly ordered so
    # unrelated documents are never near-duplicates of each other.
    return "The " + " ".join(rng.choice(VOCAB) for _ in range(n)) + " and the end."


def write_ghostbuster(root: Path, groups: int, rng: random.Random) -> None:
    for i in range(groups):
        for variant in ("human", "gpt"):
            folder = root / "essay" / variant
            folder.mkdir(parents=True, exist_ok=True)
            (folder / f"{i}.txt").write_text(sentence(rng))
    (root / "README.md").write_text(CARD_MIT)


def write_ellipse(root: Path, n: int, rng: random.Random) -> None:
    root.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(
        {
            "text_id_kaggle": [str(i) for i in range(n)],
            "full_text": [sentence(rng) for _ in range(n)],
        }
    ).to_csv(root / "ELLIPSE_Final_github_train.csv", index=False)
    (root / "README.md").write_text("---\nlicense: cc-by-nc-sa-4.0\n---\n")


def write_detectrl(root: Path, items: list[dict[str, str]]) -> None:
    folder = root / "Benchmark" / "Original_Dataset"
    folder.mkdir(parents=True)
    (folder / "arxiv_2800.json").write_text(json.dumps(items))


def source(sid: str, loader: str, licence: str, use: str, **extra: object) -> dict[str, object]:
    entry: dict[str, object] = {
        "id": sid,
        "name": sid,
        "kind": "hf",
        "location": f"fixtures/{sid}",
        "revision": "rev1",
        "licence": licence,
        "licence_evidence": [] if licence == "unknown" else ["card"],
        "use": use,
        "loader": loader,
        "attribution": "fixture",
    }
    if use == "eval_only":
        entry["ood_set"] = sid
    entry.update(extra)
    return entry


@pytest.fixture
def project(tmp_path: Path) -> Path:
    rng = random.Random(7)
    (tmp_path / "pyproject.toml").write_text("[project]\nname='fixture'\n")
    raw = tmp_path / "data" / "raw"
    write_ghostbuster(raw / "hf-ghostbuster-rev1", 60, rng)
    write_ellipse(raw / "hf-ellipse-rev1", 40, rng)
    # The OOD set reuses one Ghostbuster human text: the build must drop the
    # training copy (and its group) so the evaluation set stays unseen.
    leaked = (raw / "hf-ghostbuster-rev1" / "essay" / "human" / "3.txt").read_text()
    write_detectrl(
        raw / "hf-detectrl-rev1",
        [
            {"id": "1", "abstract": leaked, "direct_prompt": sentence(rng), "llm_type": "ChatGPT"},
            {"id": "2", "abstract": sentence(rng), "direct_prompt": sentence(rng),
             "llm_type": "ChatGPT", "paraphrase_polish_human": sentence(rng)},
        ],
    )  # fmt: skip
    configs = tmp_path / "training" / "configs"
    configs.mkdir(parents=True)
    registry = {
        "sources": [
            source(
                "ghostbuster", "ghostbuster", "mit", "train", loader_options={"domains": ["essay"]}
            ),
            source("ellipse", "ellipse", "cc-by-nc-sa-4.0", "train"),
            source("detectrl", "detectrl", "unknown", "eval_only",
                   loader_options={"domains": ["arxiv"]}),
        ]
    }  # fmt: skip
    import yaml

    (configs / "sources.yaml").write_text(yaml.safe_dump(registry))
    (configs / "build.yaml").write_text(
        yaml.safe_dump(
            {
                "name": "fixture",
                "sources": ["ghostbuster", "ellipse", "detectrl"],
                "datacard_path": "docs/DATA_SOURCES.md",
                "min_words": 10,
            }
        )
    )
    (tmp_path / "docs").mkdir()
    return tmp_path


def test_build_end_to_end(project: Path) -> None:
    assert main(["build", str(project / "training/configs/build.yaml"), "--offline"]) == 0
    out = project / "data" / "processed" / "fixture"
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["leakage"] == "leakage checks: all passed"

    frames = {s: pd.read_parquet(out / f"{s}.parquet") for s in manifest["splits"]}
    training = pd.concat([frames[s] for s in ("train_clf", "train_meta", "calib", "test")])
    assert set(training["source"]) == {"ghostbuster", "ellipse"}
    assert set(frames["ood"]["source"]) == {"detectrl"}
    # The leaked human essay and its AI counterpart (group 3) are gone from training.
    assert "ghostbuster/essay/3" not in set(training["group_id"])
    assert manifest["dedup"]["dropped_to_protect_eval"] == 2
    # "mixed" stays in OOD only.
    assert "mixed" in set(frames["ood"]["label"])
    assert "mixed" not in set(training["label"])
    # Groups never span splits; every training split has both labels.
    everything = pd.concat([f.assign(split=s) for s, f in frames.items()])
    assert (everything.groupby("group_id")["split"].nunique() == 1).all()
    for split in ("train_clf", "test"):
        assert set(frames[split]["label"]) == {"human", "ai"}

    report = (out / "BUILD_REPORT.md").read_text()
    assert "leakage checks: all passed" in report
    card = (project / "docs" / "DATA_SOURCES.md").read_text()
    assert "Non-commercial" in card
    assert "cc-by-nc-sa-4.0" in card


def test_failed_audit_stops_the_build(project: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (project / "data/raw/hf-ghostbuster-rev1/README.md").write_text(
        "---\nlicense: apache-2.0\n---\n"
    )
    assert main(["build", str(project / "training/configs/build.yaml"), "--offline"]) == 1
    assert "licence audit failed for ghostbuster" in capsys.readouterr().err
    assert not (project / "data/processed/fixture/train_clf.parquet").exists()


def test_offline_build_needs_cached_sources(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    import shutil

    shutil.rmtree(project / "data/raw/hf-ellipse-rev1")
    assert main(["build", str(project / "training/configs/build.yaml"), "--offline"]) == 1
    assert "offline mode" in capsys.readouterr().err
