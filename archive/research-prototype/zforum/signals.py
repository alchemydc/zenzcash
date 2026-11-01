"""Signals computed without any model (SPEC section 8.4: deterministic signals run first).

Every span a signal carries occurs verbatim in the post's own text (its text with quote
blocks removed), so the UI can always show exactly what triggered it.
"""

import re
from dataclasses import dataclass

from zforum.discourse import Post, PostKind, VisibleText
from zforum.domain import PostNumber, Username
from zforum.thread import Thread
from zforum.vocab import SIGNALS_BY_ID

CONTENTLESS_AGREEMENT_MAX_CHARS = 160
WALL_OF_TEXT_MIN_CHARS = 6000

_URL = re.compile(r"https?://\S+", re.IGNORECASE)
_AGREEMENT_MARKER = re.compile(
    r"(?<![\w+])(?:i\s+agree|agreed?|\+1|exactly|well\s+said|well\s+put|same\s+here|so\s+true|totally|absolutely|"
    r"fair\s+(?:take|point)|good\s+point|great\s+point|great\s+post|spot\s+on|couldn'?t\s+agree\s+more|"
    r"thank\s+you|thanks|hear,?\s+hear)(?!\w)",
    re.IGNORECASE,
)
_HEADING_LINE = re.compile(r"^ {0,3}#{1,6}\s", re.MULTILINE)
_LIST_LINE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+\S", re.MULTILINE)
_NUMBER = r"\d[\d,]*(?:\.\d+)?"
_QUANTITY = re.compile(
    rf"(?<![\w.$€£])(?:"
    rf"[$€£]\s?{_NUMBER}(?:\s?(?:k|m|mm|bn|b|million|billion|thousand)(?!\w))?"
    rf"|{_NUMBER}\s?%"
    rf"|{_NUMBER}\s?(?:million|billion|thousand|k|m|b)(?!\w)(?:\s?(?:zec|usd|usdt|dollars)(?!\w))?"
    rf"|{_NUMBER}\s?(?:zec|usd|usdt|dollars)(?!\w)"
    rf")",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class PostSignal:
    signal_id: str
    post: PostNumber
    span: str | None
    detail: str

    def __post_init__(self) -> None:
        if self.signal_id not in SIGNALS_BY_ID:
            raise ValueError(f"unknown signal id {self.signal_id!r}")


@dataclass(frozen=True, slots=True)
class AuthorShare:
    author: Username
    posts: int
    share: float


def _visible_own_text(thread: Thread, post: Post) -> str | None:
    if post.kind is not PostKind.REGULAR or not isinstance(post.body, VisibleText):
        return None
    return thread.split[post.number].own_text


def contentless_agreement(thread: Thread) -> list[PostSignal]:
    signals = []
    for post in thread.regular_posts():
        text = _visible_own_text(thread, post)
        if text is None or post.number.value == 1:
            continue
        if len(text) <= CONTENTLESS_AGREEMENT_MAX_CHARS and "?" not in text and not _URL.search(text) and _AGREEMENT_MARKER.search(text):
            signals.append(PostSignal("C1", post.number, text, "short reply whose content is agreement"))
    return signals


def consecutive_runs(thread: Thread) -> list[PostSignal]:
    """A post continues a run when the post immediately before it in the topic's stream
    was also fetched and has the same author. A gap in what was fetched never joins runs."""
    signals = []
    by_stream_index = {thread.stream_index[post.id]: post for post in thread.posts}
    run_length: dict[PostNumber, int] = {}
    for index in sorted(by_stream_index):
        post = by_stream_index[index]
        previous = by_stream_index.get(index - 1)
        continues = previous is not None and previous.kind is PostKind.REGULAR and post.kind is PostKind.REGULAR and previous.author == post.author
        run_length[post.number] = run_length[previous.number] + 1 if continues and previous is not None else 1
        if continues and isinstance(post.body, VisibleText):
            ordinal = run_length[post.number]
            signals.append(PostSignal("C2", post.number, None, f"post {ordinal} in a row by {post.author.value}"))
    return signals


def walls_of_text(thread: Thread) -> list[PostSignal]:
    signals = []
    for post in thread.regular_posts():
        text = _visible_own_text(thread, post)
        if text is None or len(text) <= WALL_OF_TEXT_MIN_CHARS:
            continue
        if not _HEADING_LINE.search(text) and not _LIST_LINE.search(text):
            signals.append(PostSignal("C4", post.number, None, f"{len(text):,} characters with no headings or lists"))
    return signals


def unsourced_numbers(thread: Thread) -> list[PostSignal]:
    """Replies only. An opening post on this forum is mostly a proposal, grant application
    or report, and its figures are the author's own budget or data, not a claim made
    against someone (F-21)."""
    signals = []
    for post in thread.regular_posts():
        text = _visible_own_text(thread, post)
        if text is None or post.number.value == 1:
            continue
        seen: set[str] = set()
        for paragraph in re.split(r"\n\s*\n", text):
            if _URL.search(paragraph):
                continue
            for match in _QUANTITY.finditer(paragraph):
                span = match.group(0).strip()
                if span not in seen:
                    seen.add(span)
                    signals.append(PostSignal("A2", post.number, span, "quantity in a paragraph with no link"))
    return signals


def deterministic_signals(thread: Thread) -> tuple[PostSignal, ...]:
    combined = [*contentless_agreement(thread), *consecutive_runs(thread), *walls_of_text(thread), *unsourced_numbers(thread)]
    return tuple(sorted(combined, key=lambda signal: (signal.post, signal.signal_id, signal.span or "")))


def volume_shares(thread: Thread) -> tuple[AuthorShare, ...]:
    counts: dict[Username, int] = {}
    for post in thread.regular_posts():
        if isinstance(post.body, VisibleText):
            counts[post.author] = counts.get(post.author, 0) + 1
    total = sum(counts.values())
    if total == 0:
        return ()
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0].value))
    return tuple(AuthorShare(author=author, posts=count, share=count / total) for author, count in ranked)
