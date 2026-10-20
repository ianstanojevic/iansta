from hypothesis import given
from hypothesis import strategies as st

from aidetect.core.text import (
    Span,
    count_words,
    normalise_text,
    split_paragraphs,
    split_sentences,
)


def sentences(text: str) -> list[str]:
    return [s.text(text) for s in split_sentences(text)]


class TestNormalise:
    def test_removes_zero_width_characters(self) -> None:
        assert normalise_text("re\u200bsearch\u2060 shows") == "research shows"

    def test_repairs_cyrillic_homoglyphs_inside_latin_words(self) -> None:
        # "presents" with a Cyrillic er and two Cyrillic ie, as homoglyph attacks produce.
        assert normalise_text("This study \u0440r\u0435s\u0435nts") == "This study presents"

    def test_leaves_genuine_cyrillic_text_alone(self) -> None:
        assert normalise_text("Привет мир") == "Привет мир"

    def test_folds_mathematical_letters(self) -> None:
        assert normalise_text("quan\U0001d69dum") == "quantum"

    def test_unifies_whitespace_but_keeps_paragraphs(self) -> None:
        raw = "  One\u00a0 two\t three.\r\n\r\n\r\n\r\nNext   para.  \n"
        assert normalise_text(raw) == "One two three.\n\nNext para."

    def test_drops_control_characters(self) -> None:
        assert normalise_text("a\x00b\x07c") == "abc"

    @given(st.text())
    def test_is_idempotent(self, text: str) -> None:
        once = normalise_text(text)
        assert normalise_text(once) == once


class TestCountWords:
    def test_contractions_and_hyphens_count_once(self) -> None:
        assert count_words("It's a well-known fact, isn't it?") == 6

    def test_ignores_punctuation_and_numbers_count(self) -> None:
        assert count_words("— 42 apples; 3.5 pears!") == 5

    def test_empty(self) -> None:
        assert count_words("  \n ") == 0


class TestSentences:
    def test_basic(self) -> None:
        assert sentences("One here. Two there! Three? Four.") == [
            "One here.",
            "Two there!",
            "Three?",
            "Four.",
        ]

    def test_abbreviations_and_initials(self) -> None:
        text = "Dr. Smith met J. R. Tolkien at 5 p.m. Then they left, e.g. by train."
        assert sentences(text) == [
            "Dr. Smith met J. R. Tolkien at 5 p.m.",
            "Then they left, e.g. by train.",
        ]

    def test_title_abbreviation_does_not_split(self) -> None:
        assert sentences("Mr. Brown arrived. He sat.") == ["Mr. Brown arrived.", "He sat."]

    def test_decimals_do_not_split(self) -> None:
        assert sentences("Pi is 3.14 roughly. Yes.") == ["Pi is 3.14 roughly.", "Yes."]

    def test_quotes_stay_with_their_sentence(self) -> None:
        assert sentences('He said "stop." Then silence.') == ['He said "stop."', "Then silence."]

    def test_lowercase_continuation_is_not_a_boundary(self) -> None:
        assert sentences("Wait... what happened? nothing.") == ["Wait... what happened? nothing."]

    def test_line_breaks_are_boundaries(self) -> None:
        assert sentences("Heading\n- item one\n- item two") == [
            "Heading",
            "- item one",
            "- item two",
        ]

    @given(st.text(alphabet=st.characters(codec="utf-8"), max_size=300))
    def test_spans_are_ordered_trimmed_and_in_bounds(self, raw: str) -> None:
        text = normalise_text(raw)
        spans = split_sentences(text)
        last_end = 0
        for span in spans:
            assert 0 <= last_end <= span.start < span.end <= len(text)
            piece = span.text(text)
            assert piece == piece.strip()
            last_end = span.end


class TestParagraphs:
    def test_split_on_blank_lines(self) -> None:
        text = "First line\nstill first.\n\nSecond.\n\n\nThird."
        assert [p.text(text) for p in split_paragraphs(text)] == [
            "First line\nstill first.",
            "Second.",
            "Third.",
        ]

    def test_span_text(self) -> None:
        assert Span(2, 5).text("abcdefg") == "cde"
