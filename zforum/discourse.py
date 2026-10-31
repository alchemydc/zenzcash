"""Boundary parser for the Discourse JSON responses zforum consumes.

Discourse owns this format, not zforum, and it sends many fields we never read. So this
module is strict about every field it *does* consume (presence, type, range, and the
cross-field invariants it relies on) and ignores the rest. Anything that violates an
assumption raises DiscourseFormatError naming the source, the field and the value.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any

import jsonschema

from zforum.domain import CategoryId, PostId, PostNumber, TopicId, Username, UtcTimestamp


class DiscourseFormatError(ValueError):
    pass


_TIMESTAMP = {"type": "string"}
_NULLABLE_STRING = {"type": ["string", "null"]}

_POST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": [
        "id", "topic_id", "post_number", "username", "name", "created_at", "updated_at", "post_type",
        "reply_to_post_number", "hidden", "user_title", "primary_group_name", "trust_level",
        "staff", "user_deleted", "deleted_at",
    ],
    "properties": {
        "id": {"type": "integer", "minimum": 1},
        "topic_id": {"type": "integer", "minimum": 1},
        "post_number": {"type": "integer", "minimum": 1},
        "username": {"type": "string"},
        "name": _NULLABLE_STRING,
        "created_at": _TIMESTAMP,
        "updated_at": _TIMESTAMP,
        "post_type": {"type": "integer"},
        "reply_to_post_number": {"type": ["integer", "null"], "minimum": 1},
        "hidden": {"type": "boolean"},
        # Present (a string) exactly when the post is not hidden; checked in _parse_post.
        "raw": {"type": "string"},
        "user_title": _NULLABLE_STRING,
        "primary_group_name": _NULLABLE_STRING,
        "trust_level": {"type": "integer", "minimum": 0, "maximum": 4},
        "staff": {"type": "boolean"},
        "user_deleted": {"type": "boolean"},
        "deleted_at": {"type": "null"},
    },
}

_POSTS_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["post_stream"],
    "properties": {
        "post_stream": {
            "type": "object",
            "required": ["posts"],
            "properties": {"posts": {"type": "array", "items": _POST_SCHEMA}},
        }
    },
}

_TOPIC_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["id", "title", "slug", "category_id", "created_at", "posts_count", "highest_post_number", "post_stream"],
    "properties": {
        "id": {"type": "integer", "minimum": 1},
        "title": {"type": "string", "minLength": 1},
        "slug": {"type": "string"},
        "category_id": {"type": "integer", "minimum": 1},
        "created_at": _TIMESTAMP,
        "posts_count": {"type": "integer", "minimum": 1},
        "highest_post_number": {"type": "integer", "minimum": 1},
        "post_stream": {
            "type": "object",
            "required": ["posts", "stream"],
            "properties": {
                "posts": {"type": "array", "items": _POST_SCHEMA},
                "stream": {"type": "array", "items": {"type": "integer", "minimum": 1}, "minItems": 1},
            },
        },
    },
}

_LATEST_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["topic_list"],
    "properties": {
        "topic_list": {
            "type": "object",
            "required": ["topics"],
            "properties": {
                "more_topics_url": {"type": "string"},
                "topics": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["id", "title", "slug", "posts_count", "created_at", "bumped_at", "category_id", "pinned"],
                        "properties": {
                            "id": {"type": "integer", "minimum": 1},
                            "title": {"type": "string", "minLength": 1},
                            "slug": {"type": "string"},
                            "posts_count": {"type": "integer", "minimum": 1},
                            "created_at": _TIMESTAMP,
                            "bumped_at": _TIMESTAMP,
                            "category_id": {"type": "integer", "minimum": 1},
                            "pinned": {"type": "boolean"},
                        },
                    },
                },
            },
        }
    },
}

_CATEGORY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["id", "name", "slug"],
    "properties": {
        "id": {"type": "integer", "minimum": 1},
        "name": {"type": "string", "minLength": 1},
        "slug": {"type": "string"},
    },
}

_CATEGORIES_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["category_list"],
    "properties": {
        "category_list": {
            "type": "object",
            "required": ["categories"],
            "properties": {
                "categories": {
                    "type": "array",
                    "items": {
                        "allOf": [_CATEGORY_SCHEMA],
                        "properties": {"subcategory_list": {"type": "array", "items": _CATEGORY_SCHEMA}},
                    },
                }
            },
        }
    },
}


def _check(schema: dict[str, Any], document: object, source: str) -> None:
    errors = sorted(jsonschema.Draft202012Validator(schema).iter_errors(document), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        path = "/".join(str(part) for part in first.absolute_path) or "<root>"
        raise DiscourseFormatError(f"{source}: at {path}: {first.message}")


class PostKind(Enum):
    REGULAR = 1
    MODERATOR_ACTION = 2
    SMALL_ACTION = 3


@dataclass(frozen=True, slots=True)
class VisibleText:
    markdown: str


@dataclass(frozen=True, slots=True)
class HiddenByCommunity:
    """Discourse withholds the text of a flag-hidden post from anonymous readers. zforum
    never holds it, so this variant has no text field at all."""


PostBody = VisibleText | HiddenByCommunity


@dataclass(frozen=True, slots=True)
class AuthorMetadata:
    """Structured affiliation as Discourse states it (signal D1). Free text set by staff or
    by the user's group membership; never inferred."""

    user_title: str | None
    primary_group: str | None
    trust_level: int
    staff: bool


@dataclass(frozen=True, slots=True)
class Post:
    id: PostId
    topic_id: TopicId
    number: PostNumber
    author: Username
    author_name: str | None
    created_at: UtcTimestamp
    updated_at: UtcTimestamp
    kind: PostKind
    reply_to: PostNumber | None
    body: PostBody
    author_metadata: AuthorMetadata


@dataclass(frozen=True, slots=True)
class TopicSummary:
    id: TopicId
    title: str
    slug: str
    category: CategoryId
    posts_count: int
    created_at: UtcTimestamp
    bumped_at: UtcTimestamp
    pinned: bool


@dataclass(frozen=True, slots=True)
class LatestPage:
    topics: tuple[TopicSummary, ...]
    has_more: bool


@dataclass(frozen=True, slots=True)
class TopicHead:
    id: TopicId
    title: str
    slug: str
    category: CategoryId
    created_at: UtcTimestamp
    posts_count: int
    highest_post_number: int
    stream: tuple[PostId, ...]
    first_posts: tuple[Post, ...]


@dataclass(frozen=True, slots=True)
class Category:
    id: CategoryId
    name: str
    slug: str
    parent: CategoryId | None


def _empty_to_none(text: str | None) -> str | None:
    """Discourse uses both null and "" for 'not set' in user_title/name/primary_group_name.
    The two mean the same thing in its data model, so they map to one value here."""
    return None if text is None or text == "" else text


def _parse_post(item: dict[str, Any], source: str) -> Post:
    where = f"{source}: post id {item['id']}"
    try:
        kind = PostKind(item["post_type"])
    except ValueError as error:
        raise DiscourseFormatError(f"{where}: unknown post_type {item['post_type']!r}") from error
    hidden: bool = item["hidden"]
    has_raw = "raw" in item
    body: PostBody
    if hidden and not has_raw:
        body = HiddenByCommunity()
    elif not hidden and has_raw:
        body = VisibleText(item["raw"])
    else:
        raise DiscourseFormatError(f"{where}: hidden={hidden} with raw {'present' if has_raw else 'absent'}")
    try:
        return Post(
            id=PostId(item["id"]),
            topic_id=TopicId(item["topic_id"]),
            number=PostNumber(item["post_number"]),
            author=Username(item["username"]),
            author_name=_empty_to_none(item["name"]),
            created_at=UtcTimestamp.parse_discourse(item["created_at"]),
            updated_at=UtcTimestamp.parse_discourse(item["updated_at"]),
            kind=kind,
            reply_to=None if item["reply_to_post_number"] is None else PostNumber(item["reply_to_post_number"]),
            body=body,
            author_metadata=AuthorMetadata(
                user_title=_empty_to_none(item["user_title"]),
                primary_group=_empty_to_none(item["primary_group_name"]),
                trust_level=item["trust_level"],
                staff=item["staff"],
            ),
        )
    except ValueError as error:
        raise DiscourseFormatError(f"{where}: {error}") from error


def parse_posts_response(document: object, source: str) -> tuple[Post, ...]:
    _check(_POSTS_RESPONSE_SCHEMA, document, source)
    assert isinstance(document, dict)
    return tuple(_parse_post(item, source) for item in document["post_stream"]["posts"])


def parse_topic_response(document: object, source: str) -> TopicHead:
    _check(_TOPIC_RESPONSE_SCHEMA, document, source)
    assert isinstance(document, dict)
    topic_id = TopicId(document["id"])
    first_posts = tuple(_parse_post(item, source) for item in document["post_stream"]["posts"])
    for post in first_posts:
        if post.topic_id != topic_id:
            raise DiscourseFormatError(f"{source}: post {post.id.value} belongs to topic {post.topic_id.value}, not {topic_id.value}")
    stream = tuple(PostId(value) for value in document["post_stream"]["stream"])
    if len(set(stream)) != len(stream):
        raise DiscourseFormatError(f"{source}: post_stream.stream contains duplicate ids")
    return TopicHead(
        id=topic_id,
        title=document["title"],
        slug=document["slug"],
        category=CategoryId(document["category_id"]),
        created_at=UtcTimestamp.parse_discourse(document["created_at"]),
        posts_count=document["posts_count"],
        highest_post_number=document["highest_post_number"],
        stream=stream,
        first_posts=first_posts,
    )


def parse_latest_response(document: object, source: str) -> LatestPage:
    _check(_LATEST_RESPONSE_SCHEMA, document, source)
    assert isinstance(document, dict)
    topic_list = document["topic_list"]
    try:
        topics = tuple(
            TopicSummary(
                id=TopicId(item["id"]),
                title=item["title"],
                slug=item["slug"],
                category=CategoryId(item["category_id"]),
                posts_count=item["posts_count"],
                created_at=UtcTimestamp.parse_discourse(item["created_at"]),
                bumped_at=UtcTimestamp.parse_discourse(item["bumped_at"]),
                pinned=item["pinned"],
            )
            for item in topic_list["topics"]
        )
    except ValueError as error:
        raise DiscourseFormatError(f"{source}: {error}") from error
    return LatestPage(topics=topics, has_more="more_topics_url" in topic_list)


def parse_categories_response(document: object, source: str) -> tuple[Category, ...]:
    _check(_CATEGORIES_RESPONSE_SCHEMA, document, source)
    assert isinstance(document, dict)
    categories: list[Category] = []
    for item in document["category_list"]["categories"]:
        parent_id = CategoryId(item["id"])
        categories.append(Category(id=parent_id, name=item["name"], slug=item["slug"], parent=None))
        for sub in item.get("subcategory_list", []):
            categories.append(Category(id=CategoryId(sub["id"]), name=sub["name"], slug=sub["slug"], parent=parent_id))
    ids = [category.id for category in categories]
    if len(set(ids)) != len(ids):
        raise DiscourseFormatError(f"{source}: duplicate category ids")
    return tuple(categories)
