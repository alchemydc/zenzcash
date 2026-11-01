import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from tests.intel_fixtures import CATEGORIES, sample_thread, valid_analysis, valid_brief, valid_issues, valid_quiz
from zforum.attest.keys import generate_issuer_key
from zforum.crawl import RecentWindow
from zforum.domain import UtcTimestamp
from zforum.fsio import load_json
from zforum.intel import inputs
from zforum.intel.jobs import JobError, ProducedOutput, accept, prepare_job
from zforum.site import CATCH_UP_RULE, affiliation_title, already_answered, build_site, catch_up_order, importance, optional_result
from zforum.thread import Snapshot

NOW = UtcTimestamp(datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc))


def snapshot() -> Snapshot:
    return Snapshot(
        path=Path("20261031T120000Z"),
        started_at=NOW,
        finished_at=NOW,
        selection=RecentWindow(UtcTimestamp(datetime(2026, 10, 1, tzinfo=timezone.utc))),
        categories=CATEGORIES,
        threads=(sample_thread(),),
    )


def workspace(tmp_path: Path, *, with_analysis: bool = True, with_brief: bool = False) -> tuple[Path, Path]:
    results, receipts = tmp_path / "results", tmp_path / "receipts"
    if with_brief:
        thread = sample_thread()
        brief_input = inputs.analyzed_thread_input(thread, CATEGORIES, valid_analysis())
        accept(prepare_job(tmp_path / "jobs", "brief_thread", "t100", brief_input), ProducedOutput(json.dumps(valid_brief()), "subagent", "claude-sonnet-5-5"), NOW, results)
        issues_input = inputs.forum_issues_input([(thread, valid_brief())])
        accept(prepare_job(tmp_path / "jobs", "forum_issues", "issues-20261031t120000z", issues_input), ProducedOutput(json.dumps(valid_issues()), "subagent", "claude-sonnet-5-5"), NOW, results)
    if with_analysis:
        thread = sample_thread()
        analysis_input = inputs.analyze_thread_input(thread, CATEGORIES)
        accept(prepare_job(tmp_path / "jobs", "analyze_thread", "t100", analysis_input), ProducedOutput(json.dumps(valid_analysis()), "subagent", "claude-sonnet-5-5"), NOW, results)
        quiz_input = inputs.analyzed_thread_input(thread, CATEGORIES, valid_analysis())
        accept(prepare_job(tmp_path / "jobs", "quiz_thread", "t100", quiz_input), ProducedOutput(json.dumps(valid_quiz()), "subagent", "claude-sonnet-5-5"), NOW, results)
    generate_issuer_key(tmp_path / "issuer.pem", receipts / "keyring.json", NOW)
    (receipts / "examples.json").write_text("[]")
    return results, receipts


def test_build_writes_index_thread_and_receipts(tmp_path: Path) -> None:
    results, receipts = workspace(tmp_path)
    out = tmp_path / "out"
    build_site(snapshot(), results, receipts, out)
    index = load_json(out / "index.json")
    assert isinstance(index, dict)
    assert index["format"] == "zforum-site-index-1"
    assert index["snapshot"] == {"name": "20261031T120000Z", "crawled_at": "2026-10-31T12:00:00Z", "period": "forum activity from 2026-10-01 to 2026-10-31"}
    (entry,) = index["threads"]
    assert entry == {
        "id": 100,
        "title": "A topic",
        "category": "Governance",
        "posts": 5,
        "participants": 4,
        "last_post_at": "2026-10-20T10:00:00Z",
        "scope": "full",
        "analyzed": True,
        "has_quiz": True,
        "tldr": valid_analysis()["summary"]["tldr"],
        "temperature": "heated",
        "claims": 1,
        "mind_changes": [{"post": 4, "author": "op", "span": "Fair point, I had not considered the core developers.", "note": "Concedes the core-developer point."}],
        "top_voice_share": None,
        "activity": {"participants": 4, "posts": 5},
        "heat_share": 0.25,
        "brief": None,
        "importance": None,
    }
    assert [record["task"] for record in index["provenance"]] == ["analyze_thread", "quiz_thread"]
    assert set(index["prompts"]) == {"analyze_thread", "brief_thread", "check_draft", "forum_digest", "forum_issues", "quiz_thread"}
    assert index["digest"] is None

    thread = load_json(out / "t" / "100.json")
    assert isinstance(thread, dict)
    assert thread["format"] == "zforum-site-thread-1"
    assert thread["posts"][1]["segments"] == [
        {"kind": "quote", "author": "op", "post": 1, "topic": 100, "markdown": "end the dev fund"},
        {"kind": "text", "markdown": "No. It pays the core developers, and ending it is reckless."},
    ]
    assert thread["posts"][2] == {"number": 3, "author": "carol", "author_title": None, "author_group": None, "created_at": "2026-10-20T10:00:00Z", "reply_to": None, "signals": [], "hidden": True, "segments": []}
    assert thread["analysis"]["already_answered"] == [{"post": 5, "claim_id": "c1", "answered_at": 2}]
    assert thread["quiz"]["output"] == valid_quiz()

    receipts_out = load_json(out / "receipts.json")
    assert isinstance(receipts_out, dict)
    assert receipts_out["log"] == [] and receipts_out["findings"] == {} and receipts_out["examples"] == []
    assert len(receipts_out["keyring"]) == 1


def test_build_is_deterministic(tmp_path: Path) -> None:
    results, receipts = workspace(tmp_path)
    build_site(snapshot(), results, receipts, tmp_path / "a")
    build_site(snapshot(), results, receipts, tmp_path / "b")
    files_a = sorted(path.relative_to(tmp_path / "a") for path in (tmp_path / "a").rglob("*") if path.is_file())
    files_b = sorted(path.relative_to(tmp_path / "b") for path in (tmp_path / "b").rglob("*") if path.is_file())
    assert files_a == files_b == [Path("index.json"), Path("receipts.json"), Path("t/100.json")]
    for relative in files_a:
        assert (tmp_path / "a" / relative).read_bytes() == (tmp_path / "b" / relative).read_bytes(), relative


def test_unanalyzed_thread_builds_without_model_output(tmp_path: Path) -> None:
    results, receipts = workspace(tmp_path, with_analysis=False)
    build_site(snapshot(), results, receipts, tmp_path / "out")
    thread = load_json(tmp_path / "out" / "t" / "100.json")
    assert isinstance(thread, dict)
    assert thread["analysis"] is None and thread["quiz"] is None


def test_stale_result_stops_the_build(tmp_path: Path) -> None:
    results, receipts = workspace(tmp_path)
    path = results / "analyze_thread" / "t100.json"
    envelope = load_json(path)
    assert isinstance(envelope, dict)
    envelope["input_sha256"] = "0" * 64
    path.write_text(json.dumps(envelope))
    with pytest.raises(JobError, match=r"stale; produced from input 0{64}"):
        build_site(snapshot(), results, receipts, tmp_path / "out")


def test_optional_result_is_none_only_when_absent(tmp_path: Path) -> None:
    assert optional_result("analyze_thread", "t100", inputs.analyze_thread_input(sample_thread(), CATEGORIES), tmp_path) is None


def test_findings_file_must_match_its_hash(tmp_path: Path) -> None:
    results, receipts = workspace(tmp_path, with_analysis=False)
    (receipts / "findings").mkdir()
    (receipts / "findings" / ("f" * 64 + ".json")).write_text('{"format":"zforum-findings-1","topic_id":100,"findings":{"repetitions":[]}}')
    with pytest.raises(ValueError, match=r"does not match the file name$"):
        build_site(snapshot(), results, receipts, tmp_path / "out")


@pytest.mark.parametrize("title,expected", [("Regular", None), ("leader", None), ("Member", None), (None, None), ("Zcash Foundation", "Zcash Foundation"), ("ZCG Member", "ZCG Member")])
def test_affiliation_title_drops_trust_levels(title: str | None, expected: str | None) -> None:
    assert affiliation_title(title) == expected


def test_already_answered_requires_an_earlier_rebuttal_by_someone_else() -> None:
    thread = sample_thread()
    analysis = valid_analysis()
    assert already_answered(analysis, thread) == [{"post": 5, "claim_id": "c1", "answered_at": 2}]
    analysis["claims"][0]["rebuttals"] = [2]
    analysis["claims"][0]["asserted_in"] = [1]
    assert already_answered(analysis, thread) == []


def test_build_includes_briefs_issues_and_catch_up_order(tmp_path: Path) -> None:
    results, receipts = workspace(tmp_path, with_brief=True)
    build_site(snapshot(), results, receipts, tmp_path / "out")
    index = load_json(tmp_path / "out" / "index.json")
    assert isinstance(index, dict)
    (entry,) = index["threads"]
    expected_brief = valid_brief()
    expected_brief["views"][0]["best_for"]["author"] = "op"
    expected_brief["views"][0]["best_against"]["author"] = "bob"
    expected_brief["views"][1]["best_for"]["author"] = "bob"
    assert entry["brief"] == expected_brief
    assert entry["importance"] == {"open_decision": True, "stake_kind": "funding", "decision": "Whether to stop the fund at the next upgrade"}
    assert index["catch_up"]["rule"] == CATCH_UP_RULE
    assert index["catch_up"]["order"] == [100]
    assert index["catch_up"]["issues"]["output"] == valid_issues()
    assert index["catch_up"]["also_active"] == []
    assert [record["task"] for record in index["provenance"]] == ["analyze_thread", "brief_thread", "forum_issues", "quiz_thread"]


def entry_for(topic_id: int, open_decision: bool, participants: int) -> dict[str, Any]:
    return {"id": topic_id, "importance": {"open_decision": open_decision, "stake_kind": "funding", "decision": None}, "activity": {"participants": participants, "posts": 1}}


def test_catch_up_order_puts_open_decisions_first_then_participants() -> None:
    entries: list[dict[str, Any]] = [entry_for(1, False, 50), entry_for(2, True, 5), entry_for(3, True, 20), entry_for(4, False, 50), {"id": 5, "importance": None, "activity": {"participants": 99, "posts": 1}}]
    assert catch_up_order(entries) == [3, 2, 1, 4]


@pytest.mark.parametrize("kind,pending,expected", [("funding", True, True), ("protocol", True, True), ("governance", True, True), ("community", True, False), ("funding", False, False)])
def test_importance_open_decision_only_for_ranked_stakes(kind: str, pending: bool, expected: bool) -> None:
    brief = valid_brief()
    brief["stakes"] = {"kind": kind, "decision_pending": pending, "decision": "d" if pending else None}
    assert importance(brief)["open_decision"] is expected
