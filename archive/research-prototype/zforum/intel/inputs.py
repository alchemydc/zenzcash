"""Builds the input document for each model task. Inputs are deterministic functions of the
snapshot (and, for downstream tasks, of accepted upstream outputs), so an input hash
identifies exactly what a model saw."""

from collections.abc import Mapping
from typing import Any

from zforum.attest.draft import DraftText
from zforum.crawl import FullScope
from zforum.discourse import Category, HiddenByCommunity, Post, PostKind, VisibleText
from zforum.domain import CategoryId, TopicId
from zforum.thread import Thread

QUOTE_EXCERPT_CHARS = 300
DIGEST_OTHER_THREADS_LIMIT = 60

JsonObject = dict[str, Any]


def analysable_posts(thread: Thread) -> tuple[Post, ...]:
    """Posts a model reads and must account for. Small actions ("closed the topic") carry no
    argument and are excluded everywhere."""
    return tuple(post for post in thread.posts if post.kind is not PostKind.SMALL_ACTION)


def visible_analysable_numbers(thread: Thread) -> frozenset[int]:
    return frozenset(post.number.value for post in analysable_posts(thread) if isinstance(post.body, VisibleText))


def category_label(categories: Mapping[CategoryId, Category], category_id: CategoryId) -> str:
    category = categories[category_id]
    if category.parent is None:
        return category.name
    return f"{categories[category.parent].name} / {category.name}"


def _scope_description(thread: Thread) -> str:
    if isinstance(thread.scope, FullScope):
        return "complete thread"
    return f"opening posts plus the most recent {len(thread.head.stream) - thread.scope.first_tail_stream_index} posts of {len(thread.head.stream)}"


def _post_document(thread: Thread, post: Post) -> JsonObject:
    base: JsonObject = {
        "post_number": post.number.value,
        "author": post.author.value,
        "author_title": post.author_metadata.user_title,
        "created_at": post.created_at.iso(),
        "reply_to": None if post.reply_to is None else post.reply_to.value,
    }
    if isinstance(post.body, HiddenByCommunity):
        return {**base, "hidden": True, "text": None, "quotes": []}
    split = thread.split[post.number]
    quotes = [
        {
            "post_number": block.source.post.value,
            "topic_id": block.source.topic.value,
            "author": block.source.username,
            "excerpt": block.text[:QUOTE_EXCERPT_CHARS],
        }
        for block in split.quotes
        if block.source is not None and block.source.post is not None and block.source.topic is not None
    ]
    return {**base, "hidden": False, "text": split.own_text, "quotes": quotes}


def thread_document(thread: Thread, categories: Mapping[CategoryId, Category]) -> JsonObject:
    return {
        "topic": {
            "id": thread.head.id.value,
            "title": thread.head.title,
            "category": category_label(categories, thread.head.category),
            "created_at": thread.head.created_at.iso(),
            "scope": _scope_description(thread),
        },
        "posts": [_post_document(thread, post) for post in analysable_posts(thread)],
    }


def analyze_thread_input(thread: Thread, categories: Mapping[CategoryId, Category]) -> JsonObject:
    return thread_document(thread, categories)


def analyzed_thread_input(thread: Thread, categories: Mapping[CategoryId, Category], analysis: JsonObject) -> JsonObject:
    """The thread plus its accepted analysis: the input of quiz_thread and brief_thread."""
    return {**thread_document(thread, categories), "analysis": {"summary": analysis["summary"], "claims": analysis["claims"], "mind_changes": analysis["mind_changes"]}}


def check_draft_input(thread: Thread, categories: Mapping[CategoryId, Category], analysis: JsonObject, draft: DraftText) -> JsonObject:
    return {**thread_document(thread, categories), "analysis": {"summary": analysis["summary"], "claims": analysis["claims"]}, "draft": draft.value}


def forum_digest_input(
    threads: tuple[Thread, ...],
    categories: Mapping[CategoryId, Category],
    analyses: Mapping[TopicId, JsonObject],
    window_description: str,
) -> JsonObject:
    by_id = {thread.head.id: thread for thread in threads}
    unknown = sorted(topic.value for topic in analyses if topic not in by_id)
    if unknown:
        raise KeyError(f"analyses for topics not in the snapshot: {unknown}")
    analyzed = []
    for topic_id in sorted(analyses):
        thread, analysis = by_id[topic_id], analyses[topic_id]
        analyzed.append(
            {
                "topic_id": topic_id.value,
                "title": thread.head.title,
                "category": category_label(categories, thread.head.category),
                "post_count": len(analysable_posts(thread)),
                "tldr": analysis["summary"]["tldr"],
                "temperature": analysis["summary"]["temperature"],
                "positions": [{"label": position["label"], "summary": position["summary"]} for position in analysis["summary"]["positions"]],
                "claims": [
                    {"text": claim["text"], "status": claim["status"], "first_post": claim["first_post"], "strongest_statement": claim["strongest_statement"], "strongest_rebuttal": claim["strongest_rebuttal"]}
                    for claim in analysis["claims"]
                ],
                "mind_changes": [{"post_number": change["post_number"], "note": change["note"]} for change in analysis["mind_changes"]],
            }
        )
    others = sorted((thread for thread in threads if thread.head.id not in analyses), key=lambda thread: (-len(thread.posts), thread.head.id.value))
    return {
        "window": window_description,
        "analyzed_threads": analyzed,
        "other_threads": [
            {
                "topic_id": thread.head.id.value,
                "title": thread.head.title,
                "category": category_label(categories, thread.head.category),
                "posts_in_snapshot": len(thread.posts),
                "last_post_at": thread.posts[-1].created_at.iso(),
            }
            for thread in others[:DIGEST_OTHER_THREADS_LIMIT]
        ],
    }


def forum_issues_input(briefs: list[tuple[Thread, JsonObject]]) -> JsonObject:
    """The cross-thread questions are derived from the briefs' views only."""
    return {
        "briefs": [
            {
                "topic_id": thread.head.id.value,
                "title": thread.head.title,
                "headline": brief["headline"],
                "stakes": brief["stakes"]["kind"],
                "views": [{"view_id": view["view_id"], "label": view["label"], "one_line": view["one_line"], "holder_count": len(view["holders"])} for view in brief["views"]],
            }
            for thread, brief in sorted(briefs, key=lambda pair: pair[0].head.id.value)
        ]
    }
