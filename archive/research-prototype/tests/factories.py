"""Builders for Discourse-shaped JSON documents used across tests."""

from typing import Any


def post_json(
    post_id: int,
    post_number: int,
    *,
    topic_id: int = 100,
    username: str = "alice",
    raw: str | None = "hello",  # None omits the key, as Discourse does for hidden posts
    hidden: bool = False,
    created_at: str = "2026-10-20T10:00:00.000Z",
    reply_to: int | None = None,
    post_type: int = 1,
    user_title: str | None = None,
    primary_group_name: str | None = None,
) -> dict[str, Any]:
    document: dict[str, Any] = {
        "id": post_id,
        "topic_id": topic_id,
        "post_number": post_number,
        "username": username,
        "name": "",
        "created_at": created_at,
        "updated_at": created_at,
        "post_type": post_type,
        "reply_to_post_number": reply_to,
        "hidden": hidden,
        "user_title": user_title,
        "primary_group_name": primary_group_name,
        "trust_level": 1,
        "staff": False,
        "user_deleted": False,
        "deleted_at": None,
        "cooked": "<p>ignored</p>",
    }
    if raw is not None:
        document["raw"] = raw
    return document


def topic_json(topic_id: int, stream: list[int], first_posts: list[dict[str, Any]], *, title: str = "A topic") -> dict[str, Any]:
    return {
        "id": topic_id,
        "title": title,
        "slug": "a-topic",
        "category_id": 25,
        "created_at": "2026-10-01T00:00:00.000Z",
        "posts_count": len(stream),
        "highest_post_number": len(stream),
        "post_stream": {"posts": first_posts, "stream": stream},
    }


def latest_json(topics: list[dict[str, Any]], *, has_more: bool) -> dict[str, Any]:
    topic_list: dict[str, Any] = {"topics": topics}
    if has_more:
        topic_list["more_topics_url"] = "/latest?page=next"
    return {"topic_list": topic_list}


def latest_topic_json(topic_id: int, bumped_at: str, *, pinned: bool = False, posts_count: int = 5) -> dict[str, Any]:
    return {
        "id": topic_id,
        "title": f"Topic {topic_id}",
        "slug": f"topic-{topic_id}",
        "posts_count": posts_count,
        "created_at": "2026-01-01T00:00:00.000Z",
        "bumped_at": bumped_at,
        "category_id": 25,
        "pinned": pinned,
    }
