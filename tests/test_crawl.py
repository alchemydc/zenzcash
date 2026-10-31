import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from tests.factories import latest_json, latest_topic_json, post_json, topic_json
from zforum import crawl
from zforum.crawl import CrawlError, Crawler, ExplicitTopics, HttpResponse, PoliteFetcher, RecentWindow
from zforum.domain import TopicId, UtcTimestamp
from zforum.fsio import load_json

BASE = crawl.FORUM_BASE_URL
NOW = UtcTimestamp(datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc))
WINDOW_START = UtcTimestamp(datetime(2026, 10, 1, 12, 0, 0, tzinfo=timezone.utc))
WINDOW = RecentWindow(WINDOW_START)


class FakeClock:
    def __init__(self) -> None:
        self.time = 1000.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.time

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.time += seconds

    def now(self) -> UtcTimestamp:
        return NOW


class FakeTransport:
    """Serves queued responses per URL; any unexpected URL fails the test loudly."""

    def __init__(self) -> None:
        self.queues: dict[str, list[HttpResponse]] = {}
        self.requested: list[str] = []

    def serve(self, path: str, *responses: HttpResponse) -> None:
        self.queues.setdefault(BASE + path, []).extend(responses)

    def serve_json(self, path: str, document: Any) -> None:
        self.serve(path, ok(document))

    def get(self, url: str) -> HttpResponse:
        self.requested.append(url)
        queue = self.queues.get(url)
        if not queue:
            raise AssertionError(f"unexpected request {url}")
        return queue.pop(0)


def ok(document: Any) -> HttpResponse:
    return HttpResponse(status=200, body=json.dumps(document).encode(), retry_after_seconds=None)


def status(code: int, retry_after: float | None = None) -> HttpResponse:
    return HttpResponse(status=code, body=b"", retry_after_seconds=retry_after)


class NullLog:
    def __init__(self) -> None:
        self.messages: list[str] = []

    def info(self, message: str) -> None:
        self.messages.append(message)


def make_crawler(tmp_path: Path, transport: FakeTransport, clock: FakeClock) -> Crawler:
    return Crawler(PoliteFetcher(transport, clock), clock, tmp_path / "snap", NullLog())


def test_fetcher_spaces_consecutive_requests_by_the_minimum_interval() -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve("/a", status(200))
    transport.serve("/b", status(200))
    fetcher = PoliteFetcher(transport, clock)
    fetcher.get("/a")
    fetcher.get("/b")
    assert clock.sleeps == [crawl.MIN_REQUEST_INTERVAL_SECONDS]
    assert fetcher.requests_made == 2


def test_fetcher_does_not_sleep_when_the_interval_already_elapsed() -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve("/a", status(200))
    transport.serve("/b", status(200))
    fetcher = PoliteFetcher(transport, clock)
    fetcher.get("/a")
    clock.time += 5.0
    fetcher.get("/b")
    assert clock.sleeps == []


def test_fetcher_honours_retry_after_on_429() -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve("/a", status(429, retry_after=7.0), HttpResponse(200, b"body", None))
    assert PoliteFetcher(transport, clock).get("/a") == b"body"
    assert clock.sleeps == [7.0]


def test_fetcher_backs_off_exponentially_without_retry_after() -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve("/a", status(429), status(429), HttpResponse(200, b"body", None))
    assert PoliteFetcher(transport, clock).get("/a") == b"body"
    assert clock.sleeps == [2.0, 4.0]


def test_fetcher_gives_up_after_max_attempts() -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve("/a", *[status(429)] * crawl.MAX_ATTEMPTS_PER_REQUEST)
    with pytest.raises(CrawlError, match=rf"^GET {BASE}/a still rate-limited \(HTTP 429\) after 5 attempts$"):
        PoliteFetcher(transport, clock).get("/a")
    assert clock.sleeps == [2.0, 4.0, 8.0, 16.0]


def test_fetcher_fails_on_other_statuses() -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve("/a", status(404))
    with pytest.raises(CrawlError, match=rf"^GET {BASE}/a returned HTTP 404$"):
        PoliteFetcher(transport, clock).get("/a")


@pytest.mark.parametrize("header,expected", [("7", 7.0), (" 12 ", 12.0), (None, None), ("Wed, 21 Oct 2026 07:28:00 GMT", None), ("-3", None)])
def test_parse_retry_after(header: str | None, expected: float | None) -> None:
    assert crawl._parse_retry_after(header) == expected


def latest_path(page: int) -> str:
    return f"/latest.json?order=activity&page={page}"


def test_list_recent_topics_pages_until_unpinned_topics_leave_the_window(tmp_path: Path) -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json(
        latest_path(0),
        latest_json(
            [
                latest_topic_json(1, "2026-09-01T00:00:00.000Z", pinned=True),
                latest_topic_json(2, "2026-10-30T00:00:00.000Z", pinned=True),
                latest_topic_json(3, "2026-10-29T00:00:00.000Z"),
            ],
            has_more=True,
        ),
    )
    transport.serve_json(
        latest_path(1),
        latest_json([latest_topic_json(3, "2026-10-29T00:00:00.000Z"), latest_topic_json(4, "2026-09-15T00:00:00.000Z")], has_more=True),
    )
    topics = make_crawler(tmp_path, transport, clock).list_recent_topics(WINDOW_START)
    assert [topic.id for topic in topics] == [TopicId(2), TopicId(3)]
    assert transport.requested == [BASE + latest_path(0), BASE + latest_path(1)]
    assert (tmp_path / "snap" / "latest" / "page-001.json").exists()


def test_list_recent_topics_stops_when_no_more_pages(tmp_path: Path) -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json(latest_path(0), latest_json([latest_topic_json(3, "2026-10-29T00:00:00.000Z")], has_more=False))
    topics = make_crawler(tmp_path, transport, clock).list_recent_topics(WINDOW_START)
    assert [topic.id for topic in topics] == [TopicId(3)]


def test_list_recent_topics_fails_if_window_never_ends(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crawl, "MAX_LATEST_PAGES", 2)
    transport, clock = FakeTransport(), FakeClock()
    for page in range(2):
        transport.serve_json(latest_path(page), latest_json([latest_topic_json(10 + page, "2026-10-29T00:00:00.000Z")], has_more=True))
    with pytest.raises(CrawlError, match=r"^/latest still inside the 30-day window after 2 pages$"):
        make_crawler(tmp_path, transport, clock).list_recent_topics(WINDOW_START)


def posts_path(topic_id: int, ids: list[int]) -> str:
    return f"/t/{topic_id}/posts.json?include_raw=true&" + "&".join(f"post_ids[]={i}" for i in ids)


def topic_path(topic_id: int) -> str:
    return f"/t/{topic_id}.json?include_raw=true"


def test_crawl_topic_full_scope_fetches_every_remaining_post_in_batches(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crawl, "POST_BATCH_SIZE", 2)
    transport, clock = FakeTransport(), FakeClock()
    stream = [11, 12, 13, 14, 15]
    transport.serve_json(topic_path(100), topic_json(100, stream, [post_json(11, 1)]))
    transport.serve_json(posts_path(100, [12, 13]), {"post_stream": {"posts": [post_json(12, 2), post_json(13, 3)]}})
    transport.serve_json(posts_path(100, [14, 15]), {"post_stream": {"posts": [post_json(14, 4), post_json(15, 5)]}})
    entry = make_crawler(tmp_path, transport, clock).crawl_topic(TopicId(100), WINDOW)
    assert entry == {
        "id": 100,
        "topic_file": "topics/100/topic.json",
        "post_files": ["topics/100/posts-000.json", "topics/100/posts-001.json"],
        "missing_post_ids": [],
        "scope": {"kind": "full"},
    }
    assert load_json(tmp_path / "snap" / "topics" / "100" / "posts-001.json") == {"post_stream": {"posts": [post_json(14, 4), post_json(15, 5)]}}


def tail_fixture(transport: FakeTransport) -> None:
    stream = list(range(1, 11))
    transport.serve_json(topic_path(100), topic_json(100, stream, [post_json(1, 1), post_json(2, 2)]))
    recent, old = "2026-10-20T00:00:00.000Z", "2026-09-01T00:00:00.000Z"
    transport.serve_json(posts_path(100, [9, 10]), {"post_stream": {"posts": [post_json(9, 9, created_at=recent), post_json(10, 10, created_at=recent)]}})
    transport.serve_json(posts_path(100, [7, 8]), {"post_stream": {"posts": [post_json(7, 7, created_at=recent), post_json(8, 8, created_at=recent)]}})
    transport.serve_json(posts_path(100, [5, 6]), {"post_stream": {"posts": [post_json(5, 5, created_at=old), post_json(6, 6, created_at=recent)]}})


def test_crawl_topic_tail_scope_stops_at_the_window(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crawl, "POST_BATCH_SIZE", 2)
    monkeypatch.setattr(crawl, "FULL_THREAD_POST_LIMIT", 5)
    transport, clock = FakeTransport(), FakeClock()
    tail_fixture(transport)
    entry = make_crawler(tmp_path, transport, clock).crawl_topic(TopicId(100), WINDOW)
    assert entry["scope"] == {"kind": "tail", "first_tail_stream_index": 4, "capped": False}
    assert entry["post_files"] == ["topics/100/posts-000.json", "topics/100/posts-001.json", "topics/100/posts-002.json"]


def test_crawl_topic_tail_scope_respects_the_cap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crawl, "POST_BATCH_SIZE", 2)
    monkeypatch.setattr(crawl, "FULL_THREAD_POST_LIMIT", 5)
    monkeypatch.setattr(crawl, "TAIL_POST_CAP", 4)
    transport, clock = FakeTransport(), FakeClock()
    tail_fixture(transport)
    entry = make_crawler(tmp_path, transport, clock).crawl_topic(TopicId(100), WINDOW)
    assert entry["scope"] == {"kind": "tail", "first_tail_stream_index": 6, "capped": True}
    assert len(transport.requested) == 3


def test_crawl_topic_records_posts_deleted_between_requests(tmp_path: Path) -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json(topic_path(100), topic_json(100, [11, 12, 13], [post_json(11, 1)]))
    transport.serve_json(posts_path(100, [12, 13]), {"post_stream": {"posts": [post_json(13, 3)]}})
    entry = make_crawler(tmp_path, transport, clock).crawl_topic(TopicId(100), WINDOW)
    assert entry["missing_post_ids"] == [12]


def test_crawl_topic_rejects_unrequested_posts(tmp_path: Path) -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json(topic_path(100), topic_json(100, [11, 12], [post_json(11, 1)]))
    transport.serve_json(posts_path(100, [12]), {"post_stream": {"posts": [post_json(12, 2), post_json(99, 9)]}})
    with pytest.raises(CrawlError, match=r"^topics/100/posts-000.json: response contains unrequested post ids \[99\]$"):
        make_crawler(tmp_path, transport, clock).crawl_topic(TopicId(100), WINDOW)


def test_run_writes_manifest_last_with_exact_contents(tmp_path: Path) -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json("/categories.json?include_subcategories=true", {"category_list": {"categories": []}})
    transport.serve_json(latest_path(0), latest_json([latest_topic_json(100, "2026-10-29T00:00:00.000Z")], has_more=False))
    transport.serve_json(topic_path(100), topic_json(100, [11], [post_json(11, 1)]))
    crawler = make_crawler(tmp_path, transport, clock)
    snapshot = crawler.run(WINDOW)
    assert load_json(snapshot / "manifest.json") == {
        "format": "zforum-crawl-1",
        "base_url": BASE,
        "user_agent": crawl.USER_AGENT,
        "started_at": "2026-10-31T12:00:00Z",
        "finished_at": "2026-10-31T12:00:00Z",
        "selection": {"kind": "recent-window", "window_start": "2026-10-01T12:00:00Z"},
        "requests_made": 3,
        "topics": [{"id": 100, "topic_file": "topics/100/topic.json", "post_files": [], "missing_post_ids": [], "scope": {"kind": "full"}}],
    }


def test_run_without_manifest_leaves_no_commit_point(tmp_path: Path) -> None:
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json("/categories.json?include_subcategories=true", {"category_list": {"categories": []}})
    transport.serve(latest_path(0), status(500))
    with pytest.raises(CrawlError, match="returned HTTP 500"):
        make_crawler(tmp_path, transport, clock).run(WINDOW)
    assert not (tmp_path / "snap" / "manifest.json").exists()


def test_run_explicit_topics_skips_listing_and_fetches_long_threads_whole(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crawl, "POST_BATCH_SIZE", 2)
    monkeypatch.setattr(crawl, "FULL_THREAD_POST_LIMIT", 2)
    transport, clock = FakeTransport(), FakeClock()
    transport.serve_json("/categories.json?include_subcategories=true", {"category_list": {"categories": []}})
    transport.serve_json(topic_path(100), topic_json(100, [11, 12, 13], [post_json(11, 1)]))
    transport.serve_json(posts_path(100, [12, 13]), {"post_stream": {"posts": [post_json(12, 2, created_at="2020-01-01T00:00:00.000Z"), post_json(13, 3)]}})
    snapshot = make_crawler(tmp_path, transport, clock).run(ExplicitTopics((TopicId(100),)))
    manifest = load_json(snapshot / "manifest.json")
    assert isinstance(manifest, dict)
    assert manifest["selection"] == {"kind": "explicit", "topic_ids": [100]}
    assert manifest["topics"] == [
        {"id": 100, "topic_file": "topics/100/topic.json", "post_files": ["topics/100/posts-000.json"], "missing_post_ids": [], "scope": {"kind": "full"}}
    ]
    assert not any("latest.json" in url for url in transport.requested)


def test_explicit_topics_validation() -> None:
    with pytest.raises(ValueError, match=r"^ExplicitTopics needs at least one topic id$"):
        ExplicitTopics(())
    with pytest.raises(ValueError, match=r"^ExplicitTopics has duplicate topic ids: \[5, 5\]$"):
        ExplicitTopics((TopicId(5), TopicId(5)))


def test_user_agent_carries_no_email() -> None:
    assert crawl.USER_AGENT == "zforum-prototype/0.1 (read-only research crawler)"
    assert "@" not in crawl.USER_AGENT
