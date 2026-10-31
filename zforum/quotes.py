"""Discourse quote blocks in raw markdown.

`[quote="alice, post:12, topic:58515"] ... [/quote]` is how Discourse records who is
answering which sentence of which post. Matching follows Discourse's own rendering: an
opening tag counts only if a closing tag matches it, so an unmatched `[quote]` or
`[/quote]` is literal text, which is exactly how the forum displays it. Tags are
case-insensitive and may nest. Only outermost blocks are extracted; nested quotes stay
inside their parent's text.
"""

import re
from dataclasses import dataclass

from zforum.domain import PostNumber, TopicId

_TAG = re.compile(r'\[quote(?:=(?P<param>"[^"\]\n]*"|[^\]\n]*))?\]|(?P<close>\[/quote\])', re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class QuoteSource:
    """What a quote tag says about its origin. `name` is the attribution text (a username,
    or a display name when `username:` is given separately). `post` and `topic` are present
    only when the tag carries a complete `post:N, topic:M` reference."""

    name: str
    username: str
    post: PostNumber | None
    topic: TopicId | None


@dataclass(frozen=True, slots=True)
class QuoteBlock:
    source: QuoteSource | None
    text: str


@dataclass(frozen=True, slots=True)
class SplitPost:
    own_text: str
    quotes: tuple[QuoteBlock, ...]


_POSITIVE_DECIMAL = re.compile(r"[1-9][0-9]*")


def parse_quote_param(param: str) -> QuoteSource:
    """`"alice, post:12, topic:58515"` or `alice, post:12, topic:58515, full:true`, or with
    `username:` naming the account when the first field is a display name. A tag without a
    complete post/topic reference (e.g. `[quote="alice"]`) still has a source, just no link."""
    value = param[1:-1] if len(param) >= 2 and param[0] == '"' and param[-1] == '"' else param
    name, *rest = [part.strip() for part in value.split(",")]
    fields: dict[str, str] = {}
    for part in rest:
        key, separator, field_value = part.partition(":")
        if separator:
            fields[key.strip()] = field_value.strip()
    post_text, topic_text = fields.get("post", ""), fields.get("topic", "")
    if _POSITIVE_DECIMAL.fullmatch(post_text) and _POSITIVE_DECIMAL.fullmatch(topic_text):
        return QuoteSource(name=name, username=fields.get("username", name), post=PostNumber(int(post_text)), topic=TopicId(int(topic_text)))
    return QuoteSource(name=name, username=fields.get("username", name), post=None, topic=None)


@dataclass(frozen=True, slots=True)
class TextSegment:
    markdown: str


Segment = TextSegment | QuoteBlock


def _ordered_segments(markdown: str) -> list[tuple[str, QuoteBlock | None]]:
    """The post as alternating raw own-text pieces and outermost quote blocks, in order.
    Text pieces are returned exactly as they appear; each is paired with None."""
    openers: list[re.Match[str]] = []
    pairs: list[tuple[re.Match[str], re.Match[str]]] = []
    for match in _TAG.finditer(markdown):
        if match.group("close") is None:
            openers.append(match)
        elif openers:
            pairs.append((openers.pop(), match))
    outermost = [
        (opener, closer)
        for opener, closer in pairs
        if not any(other_open.start() < opener.start() and closer.end() < other_close.end() for other_open, other_close in pairs)
    ]
    outermost.sort(key=lambda pair: pair[0].start())
    ordered: list[tuple[str, QuoteBlock | None]] = []
    cursor = 0
    for opener, closer in outermost:
        ordered.append((markdown[cursor : opener.start()], None))
        param = opener.group("param")
        source = parse_quote_param(param) if param is not None and param.strip() else None
        ordered.append(("", QuoteBlock(source=source, text=markdown[opener.end() : closer.start()].strip("\n"))))
        cursor = closer.end()
    ordered.append((markdown[cursor:], None))
    return ordered


def split_quotes(markdown: str) -> SplitPost:
    ordered = _ordered_segments(markdown)
    own_text = re.sub(r"\n{3,}", "\n\n", "".join(text for text, block in ordered if block is None)).strip()
    return SplitPost(own_text=own_text, quotes=tuple(block for _, block in ordered if block is not None))


def segments(markdown: str) -> tuple[Segment, ...]:
    """The post in reading order for display: own-text pieces (outer blank lines trimmed,
    whitespace-only pieces dropped) interleaved with the quote blocks they answer."""
    result: list[Segment] = []
    for text, block in _ordered_segments(markdown):
        if block is not None:
            result.append(block)
        elif text.strip():
            result.append(TextSegment(text.strip("\n")))
    return tuple(result)
