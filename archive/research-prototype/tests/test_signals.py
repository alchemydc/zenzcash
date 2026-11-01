import re
from typing import Any

from hypothesis import given
from hypothesis import strategies as st

from tests.threads import make_thread
from zforum.domain import PostNumber, Username
from zforum.signals import (
    CONTENTLESS_AGREEMENT_MAX_CHARS,
    AuthorShare,
    PostSignal,
    consecutive_runs,
    contentless_agreement,
    deterministic_signals,
    unsourced_numbers,
    volume_shares,
    walls_of_text,
)

OPENING = {"author": "op", "raw": "Opening post with a proposal."}


def test_contentless_agreement_flags_short_agreement() -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": "I agree with your point 100%"}, {"author": "b", "raw": "Yeah, very fair take"}])
    assert contentless_agreement(thread) == [
        PostSignal("C1", PostNumber(2), "I agree with your point 100%", "short reply whose content is agreement"),
        PostSignal("C1", PostNumber(3), "Yeah, very fair take", "short reply whose content is agreement"),
    ]


def test_contentless_agreement_ignores_quotes_when_measuring() -> None:
    long_quote = '[quote="op, post:1, topic:100"]' + "x" * 500 + "[/quote]\nThis, exactly."
    thread = make_thread([OPENING, {"author": "a", "raw": long_quote}])
    assert [signal.span for signal in contentless_agreement(thread)] == ["This, exactly."]


def test_contentless_agreement_exclusions() -> None:
    thread = make_thread(
        [
            {"author": "op", "raw": "Agreed."},
            {"author": "a", "raw": "Agreed, but what about the audit?"},
            {"author": "b", "raw": "Agreed, see https://example.org/report"},
            {"author": "c", "raw": "Agreed. " + "Here is a lot more substance. " * 6},
            {"author": "d", "raw": "Kill both."},
            {"author": "e", "raw": None},
        ]
    )
    assert contentless_agreement(thread) == []


@given(st.text(min_size=1, max_size=400))
def test_contentless_agreement_never_flags_long_or_questioning_text(text: str) -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": text}])
    for signal in contentless_agreement(thread):
        assert signal.span is not None
        assert len(signal.span) <= CONTENTLESS_AGREEMENT_MAX_CHARS
        assert "?" not in signal.span


def test_consecutive_runs_number_each_continuation() -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": "one"}, {"author": "a", "raw": "two"}, {"author": "a", "raw": "three"}, {"author": "b", "raw": "x"}])
    assert consecutive_runs(thread) == [
        PostSignal("C2", PostNumber(3), None, "post 2 in a row by a"),
        PostSignal("C2", PostNumber(4), None, "post 3 in a row by a"),
    ]


def test_consecutive_runs_do_not_bridge_a_gap_in_what_was_fetched() -> None:
    specs: list[dict[str, Any]] = [OPENING, {"author": "a", "raw": "one"}, {"author": "a", "raw": "two"}]
    thread = make_thread(specs, stream=[1001, 1002, 5555, 1003])
    assert consecutive_runs(thread) == []


def test_consecutive_runs_skip_hidden_continuations_but_count_them() -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": "one"}, {"author": "a", "raw": None}, {"author": "a", "raw": "three"}])
    assert consecutive_runs(thread) == [PostSignal("C2", PostNumber(4), None, "post 3 in a row by a")]


@given(st.lists(st.sampled_from(["a", "b", "c"]), min_size=1, max_size=30))
def test_consecutive_runs_never_flag_a_post_whose_predecessor_has_another_author(sequence: list[str]) -> None:
    thread = make_thread([{"author": author, "raw": f"post by {author}"} for author in sequence])
    flagged = {signal.post.value for signal in consecutive_runs(thread)}
    expected = {number for number in range(2, len(sequence) + 1) if sequence[number - 1] == sequence[number - 2]}
    assert flagged == expected


def test_wall_of_text_requires_length_and_no_structure() -> None:
    wall = "word " * 1300
    structured_heading = "# Heading\n" + wall
    structured_list = wall + "\n- point one"
    thread = make_thread([OPENING, {"author": "a", "raw": wall}, {"author": "b", "raw": structured_heading}, {"author": "c", "raw": structured_list}, {"author": "d", "raw": "short"}])
    assert walls_of_text(thread) == [PostSignal("C4", PostNumber(2), None, f"{len(wall.strip()):,} characters with no headings or lists")]


def test_unsourced_numbers_exact_spans() -> None:
    raw = "They have $125M+ and 12 years of runway, 98.6% disapproval, over $30M a year, 5,000 ZEC, 2 million users.\n\nSee https://example.org: 40% here is sourced."
    thread = make_thread([OPENING, {"author": "a", "raw": raw}])
    assert [signal.span for signal in unsourced_numbers(thread)] == ["$125M", "98.6%", "$30M", "5,000 ZEC", "2 million"]


def test_unsourced_numbers_ignores_plain_numbers_and_years() -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": "In 2026 we saw NU7 and post 12 said 3 things."}])
    assert unsourced_numbers(thread) == []


def test_unsourced_numbers_skip_the_opening_post() -> None:
    thread = make_thread([{"author": "op", "raw": "Budget: $9,600 for 40% of the work."}, {"author": "a", "raw": "That is 40% too much."}])
    assert [(signal.post.value, signal.span) for signal in unsourced_numbers(thread)] == [(2, "40%")]


def test_unsourced_numbers_deduplicates_within_a_post() -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": "20% then\n\nagain 20%"}])
    assert [signal.span for signal in unsourced_numbers(thread)] == ["20%"]


@given(st.text(max_size=300))
def test_every_signal_span_occurs_verbatim_in_own_text(text: str) -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": text}])
    for signal in deterministic_signals(thread):
        if signal.span is not None:
            assert signal.span in thread.split[signal.post].own_text


@given(st.text(max_size=300))
def test_unsourced_number_spans_never_come_from_a_paragraph_with_a_link(text: str) -> None:
    raw = text + "\n\nhttps://example.org 55% sourced"
    thread = make_thread([OPENING, {"author": "a", "raw": raw}])
    own = thread.split[PostNumber(2)].own_text
    linked_paragraphs = [paragraph for paragraph in re.split(r"\n\s*\n", own) if re.search(r"https?://\S+", paragraph, re.IGNORECASE)]
    unlinked = "\n\n".join(paragraph for paragraph in re.split(r"\n\s*\n", own) if paragraph not in linked_paragraphs)
    for signal in unsourced_numbers(thread):
        assert signal.span is not None
        assert signal.span in unlinked


def test_deterministic_signals_are_sorted_and_deterministic() -> None:
    specs: list[dict[str, Any]] = [OPENING, {"author": "a", "raw": "Agreed, 50%"}, {"author": "a", "raw": "Thanks!"}]
    first = deterministic_signals(make_thread(specs))
    assert first == deterministic_signals(make_thread(specs))
    assert [(signal.post.value, signal.signal_id) for signal in first] == [(2, "A2"), (2, "C1"), (3, "C1"), (3, "C2")]


def test_volume_shares() -> None:
    thread = make_thread([OPENING, {"author": "a", "raw": "1"}, {"author": "a", "raw": "2"}, {"author": "b", "raw": "3"}, {"author": "b", "raw": None}])
    assert volume_shares(thread) == (
        AuthorShare(Username("a"), 2, 0.5),
        AuthorShare(Username("b"), 1, 0.25),
        AuthorShare(Username("op"), 1, 0.25),
    )


@given(st.lists(st.sampled_from(["a", "b", "c", "d"]), min_size=1, max_size=40))
def test_volume_shares_sum_to_one_and_are_finite(sequence: list[str]) -> None:
    shares = volume_shares(make_thread([{"author": author, "raw": "x"} for author in sequence]))
    assert abs(sum(share.share for share in shares) - 1.0) < 1e-9
    assert all(0.0 < share.share <= 1.0 for share in shares)
    assert sum(share.posts for share in shares) == len(sequence)
