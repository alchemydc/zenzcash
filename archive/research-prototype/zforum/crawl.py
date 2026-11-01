"""Anonymous, read-only, polite crawler for forum.zcashcommunity.com.

Each crawl writes an immutable snapshot directory of verbatim API responses. The manifest
is written last and is the commit point: a directory without a manifest is an aborted
crawl, and the build refuses it.
"""

import argparse
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol

from zforum.discourse import LatestPage, TopicHead, TopicSummary, parse_latest_response, parse_posts_response, parse_topic_response
from zforum.domain import PostId, TopicId, UtcTimestamp
from zforum.fsio import parse_json_bytes, write_bytes_atomic, write_json_atomic

FORUM_BASE_URL = "https://forum.zcashcommunity.com"
USER_AGENT = "zforum-prototype/0.1 (read-only research crawler)"
MIN_REQUEST_INTERVAL_SECONDS = 1.0
MAX_ATTEMPTS_PER_REQUEST = 5
REQUEST_TIMEOUT_SECONDS = 30.0
POST_BATCH_SIZE = 40
CRAWL_WINDOW_DAYS = 30
# Threads up to this many posts are fetched whole. Longer ones (multi-year megathreads that
# happen to have been bumped) are fetched as their in-window tail plus the opening posts.
FULL_THREAD_POST_LIMIT = 300
TAIL_POST_CAP = 400
# Paging /latest past this many pages means the window assumption is broken.
MAX_LATEST_PAGES = 60
MANIFEST_FORMAT = "zforum-crawl-1"


class CrawlError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status: int
    body: bytes
    retry_after_seconds: float | None


class Transport(Protocol):
    def get(self, url: str) -> HttpResponse: ...


class Clock(Protocol):
    def monotonic(self) -> float: ...
    def sleep(self, seconds: float) -> None: ...
    def now(self) -> UtcTimestamp: ...


class SystemClock:
    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)

    def now(self) -> UtcTimestamp:
        return UtcTimestamp(datetime.now(timezone.utc))


def _parse_retry_after(header: str | None) -> float | None:
    """Retry-After in delta-seconds form. The HTTP-date form is not used by Discourse; if it
    ever appears, the value is unusable as seconds and the caller's backoff applies."""
    if header is None or not header.strip().isdigit():
        return None
    return float(header.strip())


class UrllibTransport:
    def get(self, url: str) -> HttpResponse:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                return HttpResponse(status=response.status, body=response.read(), retry_after_seconds=None)
        except urllib.error.HTTPError as error:
            return HttpResponse(status=error.code, body=error.read(), retry_after_seconds=_parse_retry_after(error.headers.get("Retry-After")))


class PoliteFetcher:
    """Every request to the forum flows through here: one request per interval, backoff on
    429, and any other non-200 status is a hard error."""

    def __init__(self, transport: Transport, clock: Clock) -> None:
        self._transport = transport
        self._clock = clock
        self._last_request_started: float | None = None
        self.requests_made = 0

    def get(self, path: str) -> bytes:
        url = FORUM_BASE_URL + path
        for attempt in range(1, MAX_ATTEMPTS_PER_REQUEST + 1):
            if self._last_request_started is not None:
                wait = MIN_REQUEST_INTERVAL_SECONDS - (self._clock.monotonic() - self._last_request_started)
                if wait > 0:
                    self._clock.sleep(wait)
            self._last_request_started = self._clock.monotonic()
            self.requests_made += 1
            response = self._transport.get(url)
            if response.status == 200:
                return response.body
            if response.status != 429:
                raise CrawlError(f"GET {url} returned HTTP {response.status}")
            if attempt == MAX_ATTEMPTS_PER_REQUEST:
                break
            backoff = response.retry_after_seconds if response.retry_after_seconds is not None else float(2**attempt)
            self._clock.sleep(backoff)
        raise CrawlError(f"GET {url} still rate-limited (HTTP 429) after {MAX_ATTEMPTS_PER_REQUEST} attempts")


@dataclass(frozen=True, slots=True)
class FullScope:
    pass


@dataclass(frozen=True, slots=True)
class TailScope:
    """Only the opening posts plus the stream from `first_tail_stream_index` onward were
    fetched. `capped` records that TAIL_POST_CAP, not the window, ended the tail."""

    first_tail_stream_index: int
    capped: bool


CrawlScope = FullScope | TailScope


@dataclass(frozen=True, slots=True)
class RecentWindow:
    """Every topic bumped since `window_start`. Threads longer than FULL_THREAD_POST_LIMIT
    are fetched as their opening posts plus their in-window tail."""

    window_start: UtcTimestamp


@dataclass(frozen=True, slots=True)
class ExplicitTopics:
    """Exactly these topics, each fetched whole regardless of length (e.g. the research
    sample behind SPEC.md section 2)."""

    topic_ids: tuple[TopicId, ...]

    def __post_init__(self) -> None:
        if not self.topic_ids:
            raise ValueError("ExplicitTopics needs at least one topic id")
        if len(set(self.topic_ids)) != len(self.topic_ids):
            raise ValueError(f"ExplicitTopics has duplicate topic ids: {[topic.value for topic in self.topic_ids]}")


Selection = RecentWindow | ExplicitTopics


def _batches(ids: list[PostId], size: int) -> list[list[PostId]]:
    return [ids[start : start + size] for start in range(0, len(ids), size)]


def _posts_path(topic_id: TopicId, batch: list[PostId]) -> str:
    query = "&".join(f"post_ids[]={post_id.value}" for post_id in batch)
    return f"/t/{topic_id.value}/posts.json?include_raw=true&{query}"


class Crawler:
    def __init__(self, fetcher: PoliteFetcher, clock: Clock, snapshot_dir: Path, log: "LogSink") -> None:
        self._fetcher = fetcher
        self._clock = clock
        self._dir = snapshot_dir
        self._log = log

    def _fetch_to(self, path: str, relative_file: str) -> bytes:
        body = self._fetcher.get(path)
        write_bytes_atomic(self._dir / relative_file, body)
        return body

    def list_recent_topics(self, window_start: UtcTimestamp) -> list[TopicSummary]:
        selected: dict[TopicId, TopicSummary] = {}
        for page_number in range(MAX_LATEST_PAGES):
            relative = f"latest/page-{page_number:03d}.json"
            body = self._fetch_to(f"/latest.json?order=activity&page={page_number}", relative)
            page: LatestPage = parse_latest_response(parse_json_bytes(body, relative), relative)
            for topic in page.topics:
                if topic.bumped_at >= window_start and topic.id not in selected:
                    selected[topic.id] = topic
            # /latest?order=activity is sorted by bumped_at descending, so once the oldest
            # unpinned topic on a page is outside the window every later page is too.
            # Pinned topics sit at the top regardless of activity and say nothing about it.
            unpinned = [topic for topic in page.topics if not topic.pinned]
            if not page.has_more or (unpinned and min(topic.bumped_at for topic in unpinned) < window_start):
                return list(selected.values())
        raise CrawlError(f"/latest still inside the {CRAWL_WINDOW_DAYS}-day window after {MAX_LATEST_PAGES} pages")

    def crawl_topic(self, topic_id: TopicId, selection: Selection) -> dict[str, object]:
        topic_file = f"topics/{topic_id.value}/topic.json"
        body = self._fetch_to(f"/t/{topic_id.value}.json?include_raw=true", topic_file)
        head: TopicHead = parse_topic_response(parse_json_bytes(body, topic_file), topic_file)
        have = {post.id for post in head.first_posts}
        remaining = [post_id for post_id in head.stream if post_id not in have]
        post_files: list[str] = []
        received: set[PostId] = set(have)
        requested: set[PostId] = set()

        def fetch_batch(batch: list[PostId]) -> list[UtcTimestamp]:
            relative = f"topics/{topic_id.value}/posts-{len(post_files):03d}.json"
            batch_body = self._fetch_to(_posts_path(topic_id, batch), relative)
            posts = parse_posts_response(parse_json_bytes(batch_body, relative), relative)
            unexpected = sorted(post.id.value for post in posts if post.id not in batch)
            if unexpected:
                raise CrawlError(f"{relative}: response contains unrequested post ids {unexpected}")
            post_files.append(relative)
            requested.update(batch)
            received.update(post.id for post in posts)
            return [post.created_at for post in posts]

        scope: CrawlScope
        if isinstance(selection, ExplicitTopics) or len(head.stream) <= FULL_THREAD_POST_LIMIT:
            for batch in _batches(remaining, POST_BATCH_SIZE):
                fetch_batch(batch)
            scope = FullScope()
        else:
            tail_start = len(remaining)
            capped = False
            while tail_start > 0:
                if len(remaining) - tail_start >= TAIL_POST_CAP:
                    capped = True
                    break
                batch_start = max(0, tail_start - POST_BATCH_SIZE)
                created = fetch_batch(remaining[batch_start:tail_start])
                tail_start = batch_start
                if created and min(created) < selection.window_start:
                    break
            first_tail_stream_index = len(head.stream) - (len(remaining) - tail_start)
            scope = TailScope(first_tail_stream_index=first_tail_stream_index, capped=capped)
        missing = sorted(post_id.value for post_id in requested - received)
        entry: dict[str, object] = {
            "id": topic_id.value,
            "topic_file": topic_file,
            "post_files": post_files,
            "missing_post_ids": missing,
            "scope": {"kind": "full"}
            if isinstance(scope, FullScope)
            else {"kind": "tail", "first_tail_stream_index": scope.first_tail_stream_index, "capped": scope.capped},
        }
        return entry

    def run(self, selection: Selection) -> Path:
        started = self._clock.now()
        self._fetch_to("/categories.json?include_subcategories=true", "categories.json")
        topic_ids: list[TopicId]
        selection_record: dict[str, object]
        if isinstance(selection, RecentWindow):
            topic_ids = [topic.id for topic in self.list_recent_topics(selection.window_start)]
            selection_record = {"kind": "recent-window", "window_start": selection.window_start.iso()}
            self._log.info(f"{len(topic_ids)} topics active since {selection.window_start.iso()}")
        else:
            topic_ids = list(selection.topic_ids)
            selection_record = {"kind": "explicit", "topic_ids": [topic.value for topic in topic_ids]}
        entries = []
        for index, topic_id in enumerate(topic_ids, start=1):
            entry = self.crawl_topic(topic_id, selection)
            entries.append(entry)
            self._log.info(f"[{index}/{len(topic_ids)}] t/{topic_id.value} {entry['scope']} ({self._fetcher.requests_made} requests so far)")
        manifest = {
            "format": MANIFEST_FORMAT,
            "base_url": FORUM_BASE_URL,
            "user_agent": USER_AGENT,
            "started_at": started.iso(),
            "finished_at": self._clock.now().iso(),
            "selection": selection_record,
            "requests_made": self._fetcher.requests_made,
            "topics": entries,
        }
        write_json_atomic(self._dir / "manifest.json", manifest)
        return self._dir


class LogSink(Protocol):
    def info(self, message: str) -> None: ...


class StderrLog:
    def info(self, message: str) -> None:
        print(message, file=sys.stderr, flush=True)


def snapshot_name(moment: UtcTimestamp) -> str:
    return moment.value.strftime("%Y%m%dT%H%M%SZ")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Crawl forum topics into an immutable snapshot.")
    parser.add_argument("--out", type=Path, required=True, help="directory that holds crawl snapshots")
    parser.add_argument(
        "--topics",
        type=int,
        nargs="+",
        metavar="TOPIC_ID",
        help=f"crawl exactly these topics, whole; without it, every topic active in the last {CRAWL_WINDOW_DAYS} days",
    )
    arguments = parser.parse_args(argv)
    clock = SystemClock()
    now = clock.now()
    selection: Selection
    if arguments.topics is None:
        selection = RecentWindow(UtcTimestamp(now.value - timedelta(days=CRAWL_WINDOW_DAYS)))
    else:
        selection = ExplicitTopics(tuple(TopicId(value) for value in arguments.topics))
    snapshot_dir: Path = arguments.out / snapshot_name(now)
    if snapshot_dir.exists():
        raise CrawlError(f"snapshot directory already exists: {snapshot_dir}")
    crawler = Crawler(PoliteFetcher(UrllibTransport(), clock), clock, snapshot_dir, StderrLog())
    finished = crawler.run(selection)
    print(finished)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
