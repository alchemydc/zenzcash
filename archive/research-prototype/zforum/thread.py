"""Threads assembled from a crawl snapshot: the boundary where verbatim API responses
become validated, cross-checked domain objects."""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jsonschema

from zforum.crawl import MANIFEST_FORMAT, CrawlScope, ExplicitTopics, FullScope, RecentWindow, Selection, TailScope
from zforum.discourse import (
    Category,
    Post,
    PostKind,
    TopicHead,
    VisibleText,
    parse_categories_response,
    parse_posts_response,
    parse_topic_response,
)
from zforum.domain import CategoryId, PostId, PostNumber, TopicId, Username, UtcTimestamp
from zforum.fsio import load_json
from zforum.quotes import SplitPost, split_quotes


class SnapshotError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Thread:
    head: TopicHead
    posts: tuple[Post, ...]
    scope: CrawlScope
    missing_post_ids: tuple[PostId, ...]
    split: Mapping[PostNumber, SplitPost]
    stream_index: Mapping[PostId, int]

    @staticmethod
    def build(head: TopicHead, posts: list[Post], scope: CrawlScope, missing_post_ids: tuple[PostId, ...]) -> "Thread":
        stream_index = {post_id: index for index, post_id in enumerate(head.stream)}
        by_number: dict[PostNumber, Post] = {}
        for post in posts:
            if post.topic_id != head.id:
                raise SnapshotError(f"t/{head.id.value}: post {post.id.value} belongs to topic {post.topic_id.value}")
            if post.id not in stream_index:
                raise SnapshotError(f"t/{head.id.value}: post {post.id.value} is not in the topic's post stream")
            if post.number in by_number:
                raise SnapshotError(f"t/{head.id.value}: post number {post.number.value} appears twice")
            by_number[post.number] = post
        ordered = tuple(by_number[number] for number in sorted(by_number))
        split = {post.number: split_quotes(post.body.markdown) for post in ordered if isinstance(post.body, VisibleText)}
        return Thread(head=head, posts=ordered, scope=scope, missing_post_ids=missing_post_ids, split=split, stream_index=stream_index)

    def regular_posts(self) -> tuple[Post, ...]:
        return tuple(post for post in self.posts if post.kind is PostKind.REGULAR)

    def post(self, number: PostNumber) -> Post:
        for post in self.posts:
            if post.number == number:
                return post
        raise KeyError(f"t/{self.head.id.value} has no post #{number.value}")


@dataclass(frozen=True, slots=True)
class Snapshot:
    path: Path
    started_at: UtcTimestamp
    finished_at: UtcTimestamp
    selection: Selection
    categories: Mapping[CategoryId, Category]
    threads: tuple[Thread, ...]

    def thread(self, topic_id: TopicId) -> Thread:
        for thread in self.threads:
            if thread.head.id == topic_id:
                return thread
        raise KeyError(f"snapshot {self.path.name} has no topic {topic_id.value}")

    def period_description(self) -> str:
        if isinstance(self.selection, RecentWindow):
            return f"forum activity from {self.selection.window_start.iso()[:10]} to {self.finished_at.iso()[:10]}"
        return f"{len(self.selection.topic_ids)} selected topics, crawled {self.finished_at.iso()[:10]}"


_MANIFEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["format", "base_url", "user_agent", "started_at", "finished_at", "selection", "requests_made", "topics"],
    "properties": {
        "format": {"const": MANIFEST_FORMAT},
        "base_url": {"type": "string"},
        "user_agent": {"type": "string"},
        "started_at": {"type": "string"},
        "finished_at": {"type": "string"},
        "requests_made": {"type": "integer", "minimum": 0},
        "selection": {
            "oneOf": [
                {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["kind", "window_start"],
                    "properties": {"kind": {"const": "recent-window"}, "window_start": {"type": "string"}},
                },
                {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["kind", "topic_ids"],
                    "properties": {"kind": {"const": "explicit"}, "topic_ids": {"type": "array", "items": {"type": "integer", "minimum": 1}, "minItems": 1}},
                },
            ]
        },
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "topic_file", "post_files", "missing_post_ids", "scope"],
                "properties": {
                    "id": {"type": "integer", "minimum": 1},
                    "topic_file": {"type": "string", "pattern": r"^topics/[0-9]+/topic\.json$"},
                    "post_files": {"type": "array", "items": {"type": "string", "pattern": r"^topics/[0-9]+/posts-[0-9]{3}\.json$"}},
                    "missing_post_ids": {"type": "array", "items": {"type": "integer", "minimum": 1}},
                    "scope": {
                        "oneOf": [
                            {"type": "object", "additionalProperties": False, "required": ["kind"], "properties": {"kind": {"const": "full"}}},
                            {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["kind", "first_tail_stream_index", "capped"],
                                "properties": {
                                    "kind": {"const": "tail"},
                                    "first_tail_stream_index": {"type": "integer", "minimum": 0},
                                    "capped": {"type": "boolean"},
                                },
                            },
                        ]
                    },
                },
            },
        },
    },
}


def _parse_timestamp(text: str, source: str) -> UtcTimestamp:
    try:
        return UtcTimestamp.parse_discourse(text)
    except ValueError as error:
        raise SnapshotError(f"{source}: {error}") from error


def load_snapshot(path: Path) -> Snapshot:
    manifest_path = path / "manifest.json"
    if not manifest_path.exists():
        raise SnapshotError(f"{path}: no manifest.json; the crawl did not finish and the snapshot is unusable")
    manifest = load_json(manifest_path)
    errors = list(jsonschema.Draft202012Validator(_MANIFEST_SCHEMA).iter_errors(manifest))
    if errors:
        raise SnapshotError(f"{manifest_path}: {errors[0].message} at {'/'.join(str(p) for p in errors[0].absolute_path) or '<root>'}")
    assert isinstance(manifest, dict)
    categories = {category.id: category for category in parse_categories_response(load_json(path / "categories.json"), "categories.json")}
    threads = []
    for entry in manifest["topics"]:
        topic_id = TopicId(entry["id"])
        expected_prefix = f"topics/{topic_id.value}/"
        for relative in [entry["topic_file"], *entry["post_files"]]:
            if not relative.startswith(expected_prefix):
                raise SnapshotError(f"{manifest_path}: file {relative!r} listed under topic {topic_id.value}")
        head = parse_topic_response(load_json(path / entry["topic_file"]), entry["topic_file"])
        if head.id != topic_id:
            raise SnapshotError(f"{entry['topic_file']}: contains topic {head.id.value}, manifest says {topic_id.value}")
        posts = list(head.first_posts)
        for relative in entry["post_files"]:
            posts.extend(parse_posts_response(load_json(path / relative), relative))
        scope_record = entry["scope"]
        scope: CrawlScope = (
            FullScope()
            if scope_record["kind"] == "full"
            else TailScope(first_tail_stream_index=scope_record["first_tail_stream_index"], capped=scope_record["capped"])
        )
        threads.append(Thread.build(head, posts, scope, tuple(PostId(value) for value in entry["missing_post_ids"])))
    selection_record = manifest["selection"]
    selection: Selection = (
        RecentWindow(_parse_timestamp(selection_record["window_start"], str(manifest_path)))
        if selection_record["kind"] == "recent-window"
        else ExplicitTopics(tuple(TopicId(value) for value in selection_record["topic_ids"]))
    )
    return Snapshot(
        path=path,
        started_at=_parse_timestamp(manifest["started_at"], str(manifest_path)),
        finished_at=_parse_timestamp(manifest["finished_at"], str(manifest_path)),
        selection=selection,
        categories=categories,
        threads=tuple(threads),
    )


def authors(thread: Thread) -> tuple[Username, ...]:
    seen: dict[Username, None] = {}
    for post in thread.regular_posts():
        seen.setdefault(post.author, None)
    return tuple(seen)
