import re

from hypothesis import given
from hypothesis import strategies as st

from zforum.domain import PostNumber, TopicId
from zforum.quotes import QuoteBlock, QuoteSource, SplitPost, parse_quote_param, split_quotes


def test_attributed_quote_is_extracted() -> None:
    markdown = '[quote="alice, post:12, topic:58515"]\nZCG funded it.\n[/quote]\n\nNo, it did not.'
    assert split_quotes(markdown) == SplitPost(
        own_text="No, it did not.",
        quotes=(QuoteBlock(QuoteSource("alice", "alice", PostNumber(12), TopicId(58515)), "ZCG funded it."),),
    )


def test_full_flag_and_separate_username() -> None:
    assert parse_quote_param('"Alice Smith, post:3, topic:9, full:true, username:alice"') == QuoteSource(
        "Alice Smith", "alice", PostNumber(3), TopicId(9)
    )


def test_unquoted_param() -> None:
    assert parse_quote_param("bob, post:1, topic:2") == QuoteSource("bob", "bob", PostNumber(1), TopicId(2))


def test_name_only_param_has_no_reference() -> None:
    assert parse_quote_param('"alice"') == QuoteSource("alice", "alice", None, None)


def test_incomplete_or_invalid_reference_has_no_reference() -> None:
    assert parse_quote_param('"alice, post:3"') == QuoteSource("alice", "alice", None, None)
    assert parse_quote_param('"alice, post:0, topic:9"') == QuoteSource("alice", "alice", None, None)
    assert parse_quote_param('"alice, post:², topic:9"') == QuoteSource("alice", "alice", None, None)


def test_bare_quote_has_no_source() -> None:
    assert split_quotes("[quote]\nsomething\n[/quote]\nreply") == SplitPost("reply", (QuoteBlock(None, "something"),))


def test_tags_are_case_insensitive() -> None:
    assert split_quotes('[QUOTE="a, post:1, topic:2"]x[/Quote] y').own_text == "y"


def test_nested_quote_stays_inside_outer_block() -> None:
    markdown = '[quote="a, post:1, topic:2"]\nouter [quote="b, post:3, topic:2"]inner[/quote] end\n[/quote]\nmine'
    result = split_quotes(markdown)
    assert result.own_text == "mine"
    assert len(result.quotes) == 1
    assert result.quotes[0].text == 'outer [quote="b, post:3, topic:2"]inner[/quote] end'
    assert result.quotes[0].source == QuoteSource("a", "a", PostNumber(1), TopicId(2))


def test_unmatched_opener_is_literal_text() -> None:
    assert split_quotes("[quote] never closed") == SplitPost("[quote] never closed", ())


def test_stray_closer_is_literal_text() -> None:
    assert split_quotes("text [/quote] more") == SplitPost("text [/quote] more", ())


def test_unmatched_outer_opener_keeps_inner_pair() -> None:
    result = split_quotes('[quote] open [quote="a, post:1, topic:2"]q[/quote] tail')
    assert result.own_text == "[quote] open  tail"
    assert [block.text for block in result.quotes] == ["q"]


def test_multiple_quotes_in_order_and_blank_lines_collapse() -> None:
    markdown = 'intro\n\n[quote="a, post:1, topic:2"]one[/quote]\n\n\n\nmiddle\n[quote="b, post:2, topic:2"]two[/quote]\nend'
    result = split_quotes(markdown)
    assert [block.text for block in result.quotes] == ["one", "two"]
    assert result.own_text == "intro\n\nmiddle\n\nend"


plain_text = st.text(alphabet=st.characters(exclude_characters="[]", exclude_categories=["Cs"]), max_size=80)


def _normalize(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text).strip()


@given(plain_text)
def test_text_without_brackets_is_untouched_apart_from_whitespace_normalisation(text: str) -> None:
    assert split_quotes(text) == SplitPost(_normalize(text), ())


@given(plain_text, plain_text, plain_text, st.integers(min_value=1, max_value=10**6), st.integers(min_value=1, max_value=10**6))
def test_one_quote_splits_exactly(before: str, quoted: str, after: str, post: int, topic: int) -> None:
    markdown = f'{before}[quote="u, post:{post}, topic:{topic}"]{quoted}[/quote]{after}'
    result = split_quotes(markdown)
    assert result.own_text == _normalize(before + after)
    assert result.quotes == (QuoteBlock(QuoteSource("u", "u", PostNumber(post), TopicId(topic)), quoted.strip("\n")),)
