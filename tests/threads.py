"""Builds Thread objects from compact post specs for tests."""

from typing import Any

from tests.factories import post_json, topic_json
from zforum.crawl import FullScope
from zforum.discourse import parse_posts_response, parse_topic_response
from zforum.thread import Thread


def make_thread(specs: list[dict[str, Any]], *, topic_id: int = 100, stream: list[int] | None = None) -> Thread:
    """Each spec gives `author` and `raw` (None for a hidden post) plus optional post_json
    overrides. Post n gets id 1000+n and post number n."""
    documents = []
    for number, spec in enumerate(specs, start=1):
        overrides = {key: value for key, value in spec.items() if key not in {"author", "raw"}}
        raw = spec["raw"]
        documents.append(
            post_json(1000 + number, number, topic_id=topic_id, username=spec["author"], raw=raw, hidden=raw is None, **overrides)
        )
    ids = stream if stream is not None else [document["id"] for document in documents]
    head = parse_topic_response(topic_json(topic_id, ids, documents[:1]), "test-topic")
    posts = list(head.first_posts) + list(parse_posts_response({"post_stream": {"posts": documents[1:]}}, "test-posts"))
    return Thread.build(head, posts, FullScope(), ())
