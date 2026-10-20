"""Licence audit, schema, cleaning, dedup, splitting and leakage rules."""

from collections.abc import Callable
from pathlib import Path

import pandas as pd
import pytest
from pydantic import ValidationError

from aidetect_train.data.clean import CleanStats, clean_frame, fill_placeholders
from aidetect_train.data.dedup import deduplicate
from aidetect_train.data.leakage import check_leakage
from aidetect_train.data.licence import audit_source, card_licences, identify_licences
from aidetect_train.data.pipeline import subsample_groups
from aidetect_train.data.schema import Doc, generator_family, validate_frame
from aidetect_train.data.sources import SourceSpec
from aidetect_train.data.split import assign_splits

from .conftest import LOREM_AI, LOREM_HUMAN, words

MIT = "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining"
APACHE = "Apache License\n                Version 2.0, January 2004"
NC_SA = (
    "provided under a CC BY-NC-SA 4.0 DEED Attribution-NonCommercial-ShareAlike 4.0 International"
)

FRACTIONS = {"train_clf": 0.6, "train_meta": 0.15, "calib": 0.1, "test": 0.15}


def spec(**overrides: object) -> SourceSpec:
    base: dict[str, object] = {
        "id": "s",
        "name": "S",
        "kind": "git",
        "location": "https://example.org/s",
        "revision": "a" * 40,
        "licence": "mit",
        "licence_evidence": ["LICENSE"],
        "use": "train",
        "loader": "ellipse",
        "attribution": "someone",
    }
    base.update(overrides)
    return SourceSpec.model_validate(base)


class TestLicence:
    def test_identifies_licence_texts(self) -> None:
        assert identify_licences(MIT) == {"mit"}
        assert identify_licences(APACHE) == {"apache-2.0"}
        assert identify_licences(NC_SA) == {"cc-by-nc-sa-4.0"}
        assert identify_licences("License: see website") == set()

    def test_card_front_matter(self) -> None:
        assert card_licences("---\nlicense: cc-by-sa-4.0\n---\n# Card") == {"cc-by-sa-4.0"}
        assert card_licences("---\nlicense: [mit, apache-2.0]\n---") == {"mit", "apache-2.0"}
        assert card_licences("# no front matter") == set()

    def test_audit_passes_and_fails(self, tmp_path: Path) -> None:
        (tmp_path / "LICENSE").write_text(MIT)
        assert audit_source(spec(), tmp_path).ok
        result = audit_source(spec(licence="apache-2.0"), tmp_path)
        assert not result.ok
        assert "found ['mit']" in result.message

    def test_missing_evidence_fails(self, tmp_path: Path) -> None:
        assert not audit_source(spec(), tmp_path).ok

    def test_unspecific_cc_by_sa_claim(self, tmp_path: Path) -> None:
        (tmp_path / "README.md").write_text("our products follow the CC-BY-SA license")
        assert audit_source(spec(licence="cc-by-sa", licence_evidence=["README.md"]), tmp_path).ok

    def test_policy_unknown_licence_cannot_train(self) -> None:
        with pytest.raises(ValidationError, match="cannot be used for training"):
            spec(licence="unknown", licence_evidence=[])
        assert spec(licence="unknown", licence_evidence=[], use="eval_only", ood_set="x")

    def test_policy_requires_evidence_and_ood_name(self) -> None:
        with pytest.raises(ValidationError, match="licence_evidence"):
            spec(licence_evidence=[])
        with pytest.raises(ValidationError, match="ood_set"):
            spec(use="eval_only")

    def test_noncommercial_flag(self) -> None:
        assert spec(licence="cc-by-nc-sa-4.0", licence_evidence=["README.md"]).noncommercial
        assert not spec().noncommercial


@pytest.mark.parametrize(
    ("name", "family"),
    [
        ("gpt-3.5-turbo", "openai-gpt3.5"),
        ("ChatGPT", "openai-gpt3.5"),
        ("gpt-4o", "openai-gpt4"),
        ("gpt-5-mini", "openai-gpt5"),
        ("text-davinci-003", "openai-gpt3"),
        ("claude-instant", "anthropic-claude"),
        ("HuggingFaceH4/zephyr-7b-beta", "mistral"),
        ("allenai/tulu-2-13b", "meta-llama"),
        ("Llama-2-70b", "meta-llama"),
        ("google/gemma-7b-it", "google-gemma"),
        ("Google-PaLM", "google-palm"),
        ("flan-t5", "google-t5"),
        ("Qwen3-8B", "alibaba-qwen"),
        ("human", "human"),
        ("mystery-model", "other"),
    ],
)
def test_generator_family(name: str, family: str) -> None:
    assert generator_family(name) == family


def test_validate_frame_rejects_bad_rows(make_frame: Callable[..., pd.DataFrame]) -> None:
    good = make_frame([Doc(LOREM_HUMAN, "human", "1", "g1", "d")])
    validate_frame(good)
    with pytest.raises(ValueError, match="generator 'human'"):
        validate_frame(make_frame([Doc(LOREM_HUMAN, "human", "1", "g1", "d", generator="gpt-4")]))
    dup = pd.concat([good, good])
    with pytest.raises(ValueError, match="duplicate"):
        validate_frame(dup)


class TestClean:
    def test_strips_preamble_and_drops_refusals(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        frame = make_frame(
            [
                Doc("Sure! Here's an essay about buses:\n\n" + LOREM_AI, "ai", "1", "g1", "d"),
                Doc(
                    "As an AI language model, I cannot write that. " + LOREM_AI,
                    "ai",
                    "2",
                    "g2",
                    "d",
                ),
                Doc("Here's what happened:\n" + LOREM_HUMAN, "human", "3", "g3", "d"),
            ]
        )
        stats = CleanStats()
        out = clean_frame(frame, min_words=5, max_words=1000, stats=stats)
        assert out.loc[out["doc_id"] == "1", "text"].item() == LOREM_AI
        assert "2" not in set(out["doc_id"])
        # Human text is never rewritten by the preamble rule.
        assert out.loc[out["doc_id"] == "3", "text"].item().startswith("Here's what happened:")
        assert stats.dropped == {"refusal_or_ai_disclaimer": 1}

    def test_length_and_language_filters(self, make_frame: Callable[..., pd.DataFrame]) -> None:
        frame = make_frame(
            [
                Doc("Too short.", "human", "1", "g1", "d"),
                Doc("Dies ist ein deutscher Text über Busse und Bahnen in der Stadt. " * 3,
                    "human", "2", "g2", "d"),
                Doc(LOREM_HUMAN, "human", "3", "g3", "d"),
            ]
        )  # fmt: skip
        out = clean_frame(frame, min_words=5, max_words=1000)
        assert out["doc_id"].tolist() == ["3"]
        assert out["n_words"].item() > 5

    def test_placeholders_filled_deterministically(self) -> None:
        text = "Generic_Name went to Generic_School with STUDENT_NAME."
        filled = fill_placeholders(text, "doc-7")
        assert "Generic" not in filled
        assert "_NAME" not in filled
        assert filled == fill_placeholders(text, "doc-7")


class TestDedup:
    def test_exact_duplicate_prefers_eval_copy(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        frame = pd.concat(
            [
                make_frame([Doc(LOREM_HUMAN, "human", "t1", "g-train", "d")], source="a"),
                make_frame([Doc(LOREM_HUMAN, "human", "e1", "g-eval", "d")], "b", "eval_only"),
            ]
        )
        out, report = deduplicate(frame)
        assert out["source"].tolist() == ["b"]
        assert report.dropped_to_protect_eval == 1

    def test_exact_duplicates_within_training(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        frame = make_frame(
            [
                Doc(LOREM_HUMAN, "human", "1", "g1", "d"),
                Doc(LOREM_HUMAN.upper(), "human", "2", "g2", "d"),  # case-insensitive match
            ]
        )
        out, report = deduplicate(frame)
        assert len(out) == 1
        assert report.exact_dropped == 1

    def test_eval_collision_drops_whole_training_group(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        base = words(60)
        frame = pd.concat(
            [
                make_frame(
                    [
                        Doc(base + " x", "human", "t1", "g-train", "d"),
                        Doc(LOREM_AI, "ai", "t2", "g-train", "d", generator="gpt-4"),
                    ],
                    source="a",
                ),
                make_frame([Doc(base + " y", "human", "e1", "g-eval", "d")], "b", "eval_only"),
            ]
        )
        out, _ = deduplicate(frame)
        assert out["doc_id"].tolist() == ["e1"]

    def test_near_duplicates_merge_groups(self, make_frame: Callable[..., pd.DataFrame]) -> None:
        base = words(60)
        frame = make_frame(
            [
                Doc(base + " one", "ai", "1", "g1", "d", generator="gpt-4"),
                Doc(base + " two", "ai", "2", "g2", "d", generator="gpt-4"),
                Doc(LOREM_HUMAN, "human", "3", "g2", "d"),
            ]
        )
        out, report = deduplicate(frame)
        assert len(out) == 3
        assert out["group_id"].nunique() == 1
        assert report.groups_merged == 1

    def test_label_conflict_across_groups_drops_both(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        base = words(60)
        frame = make_frame(
            [
                Doc(base + " one", "ai", "1", "g1", "d", generator="gpt-4"),
                Doc(base + " two", "human", "2", "g2", "d"),
            ]
        )
        out, report = deduplicate(frame)
        assert out.empty
        assert report.dropped_label_conflict == 2

    def test_variants_within_a_group_are_exempt(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        base = words(60)
        frame = make_frame(
            [
                Doc(base + " original", "human", "1", "g1", "d"),
                Doc(base + " polished", "mixed", "2", "g1", "d", generator="gpt-4o",
                    edit_type="ai_polish"),
            ]
        )  # fmt: skip
        out, _ = deduplicate(frame)
        assert len(out) == 2


class TestSplit:
    def frame(self, make_frame: Callable[..., pd.DataFrame], n_groups: int) -> pd.DataFrame:
        docs = []
        for g in range(n_groups):
            docs.append(Doc(LOREM_HUMAN, "human", f"{g}h", f"g{g}", "d"))
            docs.append(Doc(LOREM_AI, "ai", f"{g}a", f"g{g}", "d", generator="gpt-4"))
        return make_frame(docs)

    def test_groups_stay_together_and_fractions_hold(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        frame = self.frame(make_frame, 4000)
        split = assign_splits(frame, FRACTIONS, seed=1)
        assert (frame.assign(split=split).groupby("group_id")["split"].nunique() == 1).all()
        shares = split.value_counts(normalize=True)
        for name, fraction in FRACTIONS.items():
            assert shares[name] == pytest.approx(fraction, abs=0.02)

    def test_deterministic_and_stable_when_data_grows(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        small = self.frame(make_frame, 100)
        large = self.frame(make_frame, 300)
        a = assign_splits(small, FRACTIONS, seed=1)
        b = assign_splits(large, FRACTIONS, seed=1)
        assert a.tolist() == b.iloc[: len(small)].tolist()
        assert a.tolist() != assign_splits(small, FRACTIONS, seed=2).tolist()

    def test_eval_only_goes_to_ood(self, make_frame: Callable[..., pd.DataFrame]) -> None:
        frame = make_frame([Doc(LOREM_HUMAN, "human", "1", "g1", "d")], use="eval_only")
        assert assign_splits(frame, FRACTIONS, seed=1).tolist() == ["ood"]

    def test_subsample_is_independent_of_split(
        self, make_frame: Callable[..., pd.DataFrame]
    ) -> None:
        # Regression: subsampling and splitting once shared a hash, so every
        # subsampled group landed in the first split.
        frame = self.frame(make_frame, 2000)
        sub = subsample_groups(frame, 400, seed=1)
        shares = assign_splits(sub, FRACTIONS, seed=1).value_counts(normalize=True)
        assert shares["train_clf"] < 0.75
        assert shares["test"] > 0.05

    def test_rejects_bad_fractions(self, make_frame: Callable[..., pd.DataFrame]) -> None:
        frame = self.frame(make_frame, 2)
        with pytest.raises(ValueError, match="sum to 1"):
            assign_splits(frame, {**FRACTIONS, "test": 0.5}, seed=1)


class TestLeakage:
    def test_clean_split_passes(self, make_frame: Callable[..., pd.DataFrame]) -> None:
        frame = make_frame(
            [
                Doc(words(50, "a"), "human", "1", "g1", "d"),
                Doc(words(50, "b"), "ai", "2", "g1", "d", generator="gpt-4"),
                Doc(words(50, "c"), "human", "3", "g2", "d"),
                Doc(words(50, "d"), "ai", "4", "g2", "d", generator="gpt-4"),
            ]
        )
        frame["split"] = ["train_clf", "train_clf", "test", "test"]
        report = check_leakage(frame)
        assert report.ok, report.summary()

    def test_detects_planted_leaks(self, make_frame: Callable[..., pd.DataFrame]) -> None:
        shared = words(80, "s")
        frame = make_frame(
            [
                Doc(shared + " end", "human", "1", "g1", "d"),
                Doc(words(50, "b"), "ai", "2", "g1", "d", generator="gpt-4"),
                Doc(shared + " fin", "human", "3", "g2", "d"),  # near-duplicate of doc 1
                Doc(words(50, "d"), "ai", "4", "g3", "d", generator="gpt-4"),
            ]
        )
        frame["split"] = ["train_clf", "train_clf", "test", "calib"]
        frame.loc[frame["doc_id"] == "4", "group_id"] = "g1"  # group spans two splits
        report = check_leakage(frame)
        assert not report.ok
        assert report.near_overlaps == [("1", "3")]
        assert report.groups_in_several_splits == ["g1"]
        assert "test" in report.splits_missing_a_label
