from pathlib import Path

import pytest

from tests.factories import latest_json, latest_topic_json, post_json, topic_json
from tests.test_crawl import WINDOW, FakeClock, FakeTransport, make_crawler, posts_path, topic_path
from zforum.crawl import ExplicitTopics, FullScope, RecentWindow
from zforum.discourse import HiddenByCommunity, parse_posts_response, parse_topic_response
from zforum.domain import PostId, PostNumber, TopicId, Username
from zforum.fsio import load_json, write_json_atomic
from zforum.thread import SnapshotError, Thread, authors, load_snapshot


def crawl_fixture(tmp_path: Path) -> Path:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json(
        "/categories.json?include_subcategories=true",
        {"category_list": {"categories": [{"id": 25, "name": "Governance", "slug": "governance"}]}},
    )
    transport.serve_json("/latest.json?order=activity&page=0", latest_json([latest_topic_json(100, "2026-10-29T00:00:00.000Z")], has_more=False))
    transport.serve_json(topic_path(100), topic_json(100, [11, 12, 13], [post_json(11, 1, username="op")]))
    transport.serve_json(
        posts_path(100, [12, 13]),
        {"post_stream": {"posts": [post_json(12, 2, username="bob", raw='[quote="op, post:1, topic:100"]x[/quote]\nNo.'), post_json(13, 3, raw=None, hidden=True)]}},
    )
    return make_crawler(tmp_path, transport, clock).run(WINDOW)


def test_load_snapshot_assembles_threads(tmp_path: Path) -> None:
    snapshot = load_snapshot(crawl_fixture(tmp_path))
    (thread,) = snapshot.threads
    assert thread.head.id == TopicId(100)
    assert [post.number.value for post in thread.posts] == [1, 2, 3]
    assert thread.scope == FullScope()
    assert thread.split[PostNumber(2)].own_text == "No."
    assert PostNumber(3) not in thread.split
    assert thread.post(PostNumber(3)).body == HiddenByCommunity()
    assert snapshot.categories[next(iter(snapshot.categories))].name == "Governance"
    assert authors(thread) == (Username("op"), Username("bob"), Username("alice"))


def test_snapshot_without_manifest_is_refused(tmp_path: Path) -> None:
    snapshot = crawl_fixture(tmp_path)
    (snapshot / "manifest.json").unlink()
    with pytest.raises(SnapshotError, match=r"no manifest.json; the crawl did not finish and the snapshot is unusable$"):
        load_snapshot(snapshot)


def test_manifest_listing_a_file_outside_its_topic_is_refused(tmp_path: Path) -> None:
    snapshot = crawl_fixture(tmp_path)
    manifest = load_json(snapshot / "manifest.json")
    assert isinstance(manifest, dict)
    manifest["topics"][0]["post_files"] = ["topics/999/posts-000.json"]
    write_json_atomic(snapshot / "manifest.json", manifest)
    with pytest.raises(SnapshotError, match=r"file 'topics/999/posts-000.json' listed under topic 100$"):
        load_snapshot(snapshot)


def test_manifest_with_unknown_field_is_refused(tmp_path: Path) -> None:
    snapshot = crawl_fixture(tmp_path)
    manifest = load_json(snapshot / "manifest.json")
    assert isinstance(manifest, dict)
    manifest["extra"] = 1
    write_json_atomic(snapshot / "manifest.json", manifest)
    with pytest.raises(SnapshotError, match=r"Additional properties are not allowed \('extra' was unexpected\) at <root>$"):
        load_snapshot(snapshot)


def test_manifest_path_traversal_is_refused_by_schema(tmp_path: Path) -> None:
    snapshot = crawl_fixture(tmp_path)
    manifest = load_json(snapshot / "manifest.json")
    assert isinstance(manifest, dict)
    manifest["topics"][0]["topic_file"] = "topics/100/../../../etc/passwd"
    write_json_atomic(snapshot / "manifest.json", manifest)
    with pytest.raises(SnapshotError, match=r"does not match .* at topics/0/topic_file$"):
        load_snapshot(snapshot)


def build(stream: list[int], documents: list[dict[str, object]]) -> Thread:
    head = parse_topic_response(topic_json(100, stream, []), "t")
    return Thread.build(head, list(parse_posts_response({"post_stream": {"posts": documents}}, "p")), FullScope(), ())


def test_thread_rejects_duplicate_post_numbers() -> None:
    with pytest.raises(SnapshotError, match=r"^t/100: post number 1 appears twice$"):
        build([1, 2], [post_json(1, 1), post_json(2, 1)])


def test_thread_rejects_posts_outside_the_stream() -> None:
    with pytest.raises(SnapshotError, match=r"^t/100: post 9 is not in the topic's post stream$"):
        build([1], [post_json(9, 1)])


def test_thread_rejects_posts_from_another_topic() -> None:
    with pytest.raises(SnapshotError, match=r"^t/100: post 1 belongs to topic 7$"):
        build([1], [post_json(1, 1, topic_id=7)])


def test_thread_orders_posts_by_number_and_missing_post_lookup_fails() -> None:
    thread = build([2, 1], [post_json(2, 2), post_json(1, 1)])
    assert [post.id for post in thread.posts] == [PostId(1), PostId(2)]
    with pytest.raises(KeyError, match=r"t/100 has no post #5"):
        thread.post(PostNumber(5))


def test_snapshot_selection_and_lookups(tmp_path: Path) -> None:
    snapshot = load_snapshot(crawl_fixture(tmp_path))
    assert snapshot.selection == RecentWindow(WINDOW.window_start)
    assert snapshot.period_description() == "forum activity from 2026-10-01 to 2026-10-31"
    assert snapshot.thread(TopicId(100)).head.id == TopicId(100)
    with pytest.raises(KeyError, match="snapshot snap has no topic 7"):
        snapshot.thread(TopicId(7))


def test_explicit_snapshot_period_description(tmp_path: Path) -> None:
    snapshot_dir = crawl_fixture(tmp_path)
    manifest = load_json(snapshot_dir / "manifest.json")
    assert isinstance(manifest, dict)
    manifest["selection"] = {"kind": "explicit", "topic_ids": [100]}
    write_json_atomic(snapshot_dir / "manifest.json", manifest)
    snapshot = load_snapshot(snapshot_dir)
    assert snapshot.selection == ExplicitTopics((TopicId(100),))
    assert snapshot.period_description() == "1 selected topics, crawled 2026-10-31"
