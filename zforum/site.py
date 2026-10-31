"""Builds the static site's data files from a snapshot plus the accepted model results.

    python -m zforum.site --snapshot data/crawls/<name> --out site/data

Every model result is loaded through the acceptance gate against the input it would be
built from today, so a stale or tampered result stops the build instead of reaching a
reader. The output is a deterministic function of its inputs.
"""

import argparse
import sys
from pathlib import Path
from typing import Any

from zforum.attest.keys import load_keyring
from zforum.attest.log import load_log
from zforum.attest.paths import RECEIPTS_DIR
from zforum.attest.receipt import b64url_encode, findings_hash, raw_public_key
from zforum.crawl import FullScope
from zforum.discourse import TRUST_LEVEL_TITLES, HiddenByCommunity, Post, VisibleText
from zforum.domain import PostNumber, TopicId
from zforum.fsio import load_json, write_json_atomic
from zforum.intel import inputs
from zforum.intel.jobs import RESULTS_DIR, TASKS, AcceptedResult, load_result, render_prompt, result_path, sha256_bytes
from zforum.intel.subjects import digest_subject, thread_subject
from zforum.quotes import QuoteBlock, segments
from zforum.signals import deterministic_signals, volume_shares
from zforum.thread import Snapshot, Thread, load_snapshot
from zforum.vocab import (
    CALM_FOLD_SIGNAL_IDS,
    CLAIM_STATUSES,
    QUIZ_KINDS,
    SIGNALS,
    TONES,
    VOLUME_NUDGE_MIN_POSTS,
    VOLUME_NUDGE_SHARE,
)

INDEX_FORMAT = "zforum-site-index-1"
THREAD_FORMAT = "zforum-site-thread-1"
RECEIPTS_FORMAT = "zforum-site-receipts-1"

JsonObject = dict[str, Any]


def provenance(result: AcceptedResult) -> JsonObject:
    return {
        "task": result.task,
        "backend": result.backend,
        "model": result.model,
        "produced_at": result.produced_at,
        "prompt_sha256": result.prompt_sha256,
        "input_sha256": result.input_sha256,
    }


def optional_result(task_name: str, subject: str, expected_input: JsonObject, results_root: Path) -> AcceptedResult | None:
    """None only when no result was ever produced. A result that exists but no longer
    matches its input or prompt is an error, never silently skipped."""
    if not result_path(task_name, subject, results_root).exists():
        return None
    return load_result(task_name, subject, expected_input, results_root)


def _segment_records(markdown: str) -> list[JsonObject]:
    records: list[JsonObject] = []
    for segment in segments(markdown):
        if isinstance(segment, QuoteBlock):
            source = segment.source
            records.append(
                {
                    "kind": "quote",
                    "author": None if source is None else source.username,
                    "post": None if source is None or source.post is None else source.post.value,
                    "topic": None if source is None or source.topic is None else source.topic.value,
                    "markdown": segment.text,
                }
            )
        else:
            records.append({"kind": "text", "markdown": segment.markdown})
    return records


def affiliation_title(user_title: str | None) -> str | None:
    """D1 shows stated affiliation only; Discourse trust-level titles are not affiliations."""
    if user_title is None or user_title.casefold() in TRUST_LEVEL_TITLES:
        return None
    return user_title


def post_record(post: Post, signals: list[JsonObject]) -> JsonObject:
    base: JsonObject = {
        "number": post.number.value,
        "author": post.author.value,
        "author_title": affiliation_title(post.author_metadata.user_title),
        "author_group": post.author_metadata.primary_group,
        "created_at": post.created_at.iso(),
        "reply_to": None if post.reply_to is None else post.reply_to.value,
        "signals": signals,
    }
    if isinstance(post.body, HiddenByCommunity):
        return {**base, "hidden": True, "segments": []}
    assert isinstance(post.body, VisibleText)
    return {**base, "hidden": False, "segments": _segment_records(post.body.markdown)}


def already_answered(analysis: JsonObject, thread: Thread) -> list[JsonObject]:
    """Derived signal A5: a post restates a claim after a different participant had already
    rebutted it. Computed from the accepted claim graph; no model involved."""
    authors = {post.number.value: post.author.value for post in thread.posts}
    derived = []
    for claim in analysis["claims"]:
        for number in sorted(claim["asserted_in"]):
            earlier = [rebuttal for rebuttal in sorted(claim["rebuttals"]) if rebuttal < number and authors[rebuttal] != authors[number]]
            if number != claim["first_post"] and earlier:
                derived.append({"post": number, "claim_id": claim["claim_id"], "answered_at": earlier[0]})
    return sorted(derived, key=lambda item: (item["post"], item["claim_id"]))


def thread_record(snapshot: Snapshot, thread: Thread, results_root: Path) -> tuple[JsonObject, JsonObject]:
    """Returns (thread file, index entry)."""
    analysis_input = inputs.analyze_thread_input(thread, snapshot.categories)
    analysis = optional_result("analyze_thread", thread_subject(thread.head.id), analysis_input, results_root)
    quiz = None
    if analysis is not None:
        quiz = optional_result("quiz_thread", thread_subject(thread.head.id), inputs.analyzed_thread_input(thread, snapshot.categories, analysis.output), results_root)
    signals_by_post: dict[int, list[JsonObject]] = {}
    for signal in deterministic_signals(thread):
        signals_by_post.setdefault(signal.post.value, []).append({"signal": signal.signal_id, "span": signal.span, "detail": signal.detail})
    posts = [post_record(post, signals_by_post.get(post.number.value, [])) for post in inputs.analysable_posts(thread)]
    shares = [{"author": share.author.value, "posts": share.posts, "share": share.share} for share in volume_shares(thread)]
    scope = {"kind": "full"} if isinstance(thread.scope, FullScope) else {"kind": "tail", "description": analysis_input["topic"]["scope"]}
    category = inputs.category_label(snapshot.categories, thread.head.category)
    record: JsonObject = {
        "format": THREAD_FORMAT,
        "topic": {
            "id": thread.head.id.value,
            "title": thread.head.title,
            "slug": thread.head.slug,
            "category": category,
            "created_at": thread.head.created_at.iso(),
            "posts_count": thread.head.posts_count,
        },
        "scope": scope,
        "posts": posts,
        "volume_shares": shares,
        "analysis": None if analysis is None else {"output": analysis.output, "provenance": provenance(analysis), "already_answered": already_answered(analysis.output, thread)},
        "quiz": None if quiz is None else {"output": quiz.output, "provenance": provenance(quiz)},
    }
    visible = [post for post in posts if not post["hidden"]]
    entry: JsonObject = {
        "id": thread.head.id.value,
        "title": thread.head.title,
        "category": category,
        "posts": len(posts),
        "participants": len({post["author"] for post in posts}),
        "last_post_at": posts[-1]["created_at"] if posts else thread.head.created_at.iso(),
        "scope": scope["kind"],
        "analyzed": analysis is not None,
        "has_quiz": quiz is not None,
        "tldr": None if analysis is None else analysis.output["summary"]["tldr"],
        "temperature": None if analysis is None else analysis.output["summary"]["temperature"],
        "claims": None if analysis is None else len(analysis.output["claims"]),
        "mind_changes": [] if analysis is None else [
            {"post": change["post_number"], "author": thread.post(PostNumber(change["post_number"])).author.value, "span": change["span"], "note": change["note"]}
            for change in analysis.output["mind_changes"]
        ],
        "top_voice_share": shares[0]["share"] if shares and len(visible) >= VOLUME_NUDGE_MIN_POSTS else None,
    }
    return record, entry


def vocabulary() -> JsonObject:
    return {
        "signals": [
            {"id": signal.id, "name": signal.name, "category": signal.category, "source": signal.source.value, "polarity": signal.polarity.value, "description": signal.description}
            for signal in SIGNALS
        ],
        "tones": list(TONES),
        "claim_statuses": list(CLAIM_STATUSES),
        "quiz_kinds": list(QUIZ_KINDS),
        "calm_fold_signals": list(CALM_FOLD_SIGNAL_IDS),
        "volume_nudge": {"share": VOLUME_NUDGE_SHARE, "min_posts": VOLUME_NUDGE_MIN_POSTS},
    }


def receipts_record(receipts_dir: Path) -> JsonObject:
    keyring = load_keyring(receipts_dir / "keyring.json")
    log = load_log(receipts_dir / "log.json", keyring)
    findings: JsonObject = {}
    for path in sorted((receipts_dir / "findings").glob("*.json")):
        document = load_json(path)
        assert isinstance(document, dict), path
        digest = findings_hash(document["findings"]).value
        if path.stem != digest:
            raise ValueError(f"{path}: findings hash {digest} does not match the file name")
        findings[digest] = {"topic_id": document["topic_id"], "findings": document["findings"]}
    examples_path = receipts_dir / "examples.json"
    examples = load_json(examples_path)
    return {
        "format": RECEIPTS_FORMAT,
        "keyring": [{"kid": kid, "public_key": b64url_encode(raw_public_key(key))} for kid, key in sorted(keyring.items())],
        "log": [entry.wire() for entry in log.entries],
        "findings": findings,
        "examples": examples,
    }


def build_site(snapshot: Snapshot, results_root: Path, receipts_dir: Path, out_dir: Path) -> None:
    threads_out = out_dir / "t"
    entries = []
    analyses: dict[TopicId, JsonObject] = {}
    provenance_records = []
    for thread in snapshot.threads:
        record, entry = thread_record(snapshot, thread, results_root)
        write_json_atomic(threads_out / f"{thread.head.id.value}.json", record)
        entries.append(entry)
        if record["analysis"] is not None:
            analyses[thread.head.id] = record["analysis"]["output"]
            provenance_records.append({"subject": thread_subject(thread.head.id), **record["analysis"]["provenance"]})
        if record["quiz"] is not None:
            provenance_records.append({"subject": thread_subject(thread.head.id), **record["quiz"]["provenance"]})
    digest = None
    if analyses:
        digest_input = inputs.forum_digest_input(snapshot.threads, snapshot.categories, analyses, snapshot.period_description())
        digest = optional_result("forum_digest", digest_subject(snapshot), digest_input, results_root)
        if digest is not None:
            provenance_records.append({"subject": digest_subject(snapshot), **provenance(digest)})
    entries = sorted([entry for entry in entries if entry["analyzed"]], key=lambda entry: -entry["posts"]) + sorted(
        [entry for entry in entries if not entry["analyzed"]], key=lambda entry: entry["last_post_at"], reverse=True
    )
    prompts = {name: {"sha256": sha256_bytes(render_prompt(name).encode("utf-8")).value, "text": render_prompt(name)} for name in sorted(TASKS)}
    write_json_atomic(
        out_dir / "index.json",
        {
            "format": INDEX_FORMAT,
            "snapshot": {"name": snapshot.path.name, "crawled_at": snapshot.finished_at.iso(), "period": snapshot.period_description()},
            "vocabulary": vocabulary(),
            "digest": None if digest is None else {"output": digest.output, "provenance": provenance(digest)},
            "threads": entries,
            "prompts": prompts,
            "provenance": sorted(provenance_records, key=lambda record: (record["task"], record["subject"])),
        },
    )
    write_json_atomic(out_dir / "receipts.json", receipts_record(receipts_dir))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m zforum.site", description="Build the static site's data files.")
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    arguments = parser.parse_args(argv)
    build_site(load_snapshot(arguments.snapshot), RESULTS_DIR, RECEIPTS_DIR, arguments.out)
    print(f"site data written to {arguments.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
