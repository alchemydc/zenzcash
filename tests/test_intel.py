import copy
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import pytest
from anthropic.resources.beta.messages.messages import Messages
from hypothesis import given
from hypothesis import strategies as st

from tests.intel_fixtures import CATEGORIES, sample_thread, valid_analysis, valid_brief, valid_check, valid_issues, valid_quiz
from tests.threads import make_thread
from zforum.attest.draft import DraftText
from zforum.domain import TopicId, UtcTimestamp
from zforum.fsio import canonical_json_bytes, load_json
from zforum.intel import inputs, jobs, validate
from zforum.intel.backends import API_FALLBACK_BETA, API_MAX_TOKENS, API_MODEL, AnthropicBackend, BackendError, SubagentBackend
from zforum.intel.jobs import JobError, ProducedOutput, accept, load_job, load_result, prepare_job, render_template, render_view
from zforum.intel.validate import OutputInvalid
from zforum.vocab import MODEL_SIGNAL_IDS

NOW = UtcTimestamp(datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc))
DRAFT = DraftText("We should end the dev fund; it costs 30% of issuance.")


def analysis_input() -> dict[str, Any]:
    return inputs.analyze_thread_input(sample_thread(), CATEGORIES)


def problems_of(task: str, input_document: dict[str, Any], output: object) -> list[str]:
    validator = jobs.TASKS[task].validator
    with pytest.raises(OutputInvalid) as raised:
        validator(input_document, output)
    return raised.value.problems


# --- inputs -----------------------------------------------------------------------------


def test_thread_document_exact() -> None:
    document = analysis_input()
    assert document["topic"] == {"id": 100, "title": "A topic", "category": "Governance", "created_at": "2026-10-01T00:00:00Z", "scope": "complete thread"}
    assert document["posts"][1] == {
        "post_number": 2,
        "author": "bob",
        "author_title": None,
        "created_at": "2026-10-20T10:00:00Z",
        "reply_to": 1,
        "hidden": False,
        "text": "No. It pays the core developers, and ending it is reckless.",
        "quotes": [{"post_number": 1, "topic_id": 100, "author": "op", "excerpt": "end the dev fund"}],
    }
    assert document["posts"][2] == {"post_number": 3, "author": "carol", "author_title": None, "created_at": "2026-10-20T10:00:00Z", "reply_to": None, "hidden": True, "text": None, "quotes": []}


def test_small_actions_are_not_analysable() -> None:
    thread = make_thread([{"author": "op", "raw": "hello"}, {"author": "system", "raw": "", "post_type": 3}, {"author": "a", "raw": "reply"}])
    assert [post.number.value for post in inputs.analysable_posts(thread)] == [1, 3]
    assert inputs.visible_analysable_numbers(thread) == frozenset({1, 3})


def test_subcategory_label() -> None:
    from zforum.discourse import Category
    from zforum.domain import CategoryId

    categories = {CategoryId(1): Category(CategoryId(1), "Grants", "grants", None), CategoryId(2): Category(CategoryId(2), "Applications", "apps", CategoryId(1))}
    assert inputs.category_label(categories, CategoryId(2)) == "Grants / Applications"


def test_quiz_and_check_inputs_carry_the_analysis() -> None:
    analysis = valid_analysis()
    quiz = inputs.analyzed_thread_input(sample_thread(), CATEGORIES, analysis)
    assert quiz["analysis"] == {"summary": analysis["summary"], "claims": analysis["claims"], "mind_changes": analysis["mind_changes"]}
    check = inputs.check_draft_input(sample_thread(), CATEGORIES, analysis, DRAFT)
    assert check["draft"] == DRAFT.value
    assert check["analysis"] == {"summary": analysis["summary"], "claims": analysis["claims"]}


def test_forum_digest_input() -> None:
    thread = sample_thread()
    other = make_thread([{"author": "x", "raw": "release notes"}], topic_id=200)
    document = inputs.forum_digest_input((thread, other), CATEGORIES, {TopicId(100): valid_analysis()}, "forum activity from A to B")
    assert document["window"] == "forum activity from A to B"
    assert [entry["topic_id"] for entry in document["analyzed_threads"]] == [100]
    assert document["analyzed_threads"][0]["mind_changes"] == [{"post_number": 4, "note": "Concedes the core-developer point."}]
    assert document["other_threads"] == [{"topic_id": 200, "title": "A topic", "category": "Governance", "posts_in_snapshot": 1, "last_post_at": "2026-10-20T10:00:00Z"}]
    with pytest.raises(KeyError, match=r"analyses for topics not in the snapshot: \[999\]"):
        inputs.forum_digest_input((thread,), CATEGORIES, {TopicId(999): valid_analysis()}, "w")


# --- templates and prompts --------------------------------------------------------------


def test_render_template_substitutes_and_rejects_unknown_placeholders() -> None:
    assert render_template("a {{X}} b {{X}}", {"X": "1", "UNUSED": "2"}, "t") == "a 1 b 1"
    with pytest.raises(JobError, match=r"^t: unknown placeholders \['MISSING'\]$"):
        render_template("{{MISSING}}", {}, "t")


@pytest.mark.parametrize("task_name", sorted(jobs.TASKS))
def test_every_prompt_renders_completely(task_name: str) -> None:
    rendered = jobs.render_prompt(task_name)
    assert "{{" not in rendered and "}}" not in rendered


def test_analyze_prompt_lists_every_model_signal_and_the_validator_bounds() -> None:
    rendered = jobs.render_prompt("analyze_thread")
    for signal_id in MODEL_SIGNAL_IDS:
        assert f"- **{signal_id} " in rendered
    for bound in (validate.TLDR_MAX_CHARS, validate.ANNOTATION_MAX_CHARS, validate.SPAN_MAX_CHARS):
        assert re.search(rf"at most\s+{bound} characters", rendered), bound


# --- validate: analyze_thread -----------------------------------------------------------


def test_valid_analysis_is_accepted() -> None:
    assert validate.validate_analyze_thread(analysis_input(), valid_analysis()) == valid_analysis()


def test_schema_problems_are_reported_before_semantics() -> None:
    output = valid_analysis()
    output["summary"]["temperature"] = "furious"
    assert problems_of("analyze_thread", analysis_input(), output) == ["summary/temperature: 'furious' is not one of ['calm', 'warm', 'heated', 'hostile']"]


def mutate(change: Any) -> dict[str, Any]:
    output = valid_analysis()
    change(output)
    return output


ANALYSIS_MUTATIONS: list[tuple[str, Any, str]] = [
    ("span not verbatim", lambda o: o["posts"][0]["signals"][0].update(span="end the fund"), "posts[#1].signals[0] (A1): span 'end the fund' does not occur verbatim in post #1"),
    ("span from a quote", lambda o: o["posts"][1]["signals"].append({"signal": "A3", "span": "end the dev fund", "note": "n"}), "posts[#2].signals[0] (A3): span 'end the dev fund' does not occur verbatim in post #2"),
    ("cites hidden post", lambda o: o["summary"]["overview"][0].update(cites=[3]), "summary.overview[0]: cites post #3, which is not a visible post in this thread"),
    ("missing post entry", lambda o: o["posts"].pop(1), "posts: no entry for visible posts [2]; every visible post needs exactly one entry"),
    ("entry for hidden post", lambda o: o["posts"].append({"post_number": 3, "tone": "calm", "claim_ids": [], "annotation": None, "signals": []}), "posts: entries for posts [3], which are not visible posts in this thread"),
    ("first_post wrong", lambda o: o["claims"][0].update(first_post=5), "claims[0] (c1): first_post is #5 but the earliest assertion is #1"),
    ("strongest rebuttal outside rebuttals", lambda o: o["claims"][0].update(strongest_rebuttal=4), "claims[0] (c1): strongest_rebuttal #4 is not in rebuttals"),
    ("unanswered with rebuttals", lambda o: o["claims"][0].update(status="unanswered"), "claims[0] (c1): status is unanswered but it has rebuttals [2]"),
    ("bad claim id", lambda o: (o["claims"][0].update(claim_id="claim-1"), [p.update(claim_ids=["claim-1"]) for p in o["posts"] if p["claim_ids"]]), "claims[0] (claim-1): claim_id must look like c1, c2, ..."),
    ("claim lists post that does not list it", lambda o: o["posts"][3].update(claim_ids=[]), "claims (c1): asserted_in includes #5 but posts[#5].claim_ids does not list it"),
    ("hostile without annotation", lambda o: o["posts"][3].update(annotation=None), "posts[#5]: tone 'hostile' or a conduct signal requires an annotation"),
    ("multi-line annotation", lambda o: o["posts"][3].update(annotation="a\nb"), "posts[#5].annotation: must be a single line"),
    ("E3 without mind change", lambda o: o.update(mind_changes=[]), "mind_changes posts [] must equal posts carrying an E3 signal [4]"),
    ("mind change caused by later post", lambda o: o["mind_changes"][0].update(changed_by=[5]), "mind_changes[0] (#4): changed_by #5 does not precede the mind change"),
    ("unknown participant", lambda o: o["summary"]["positions"][0].update(participants=["mallory"]), "summary.positions[0].participants: 'mallory' did not post in this thread"),
    ("uncited overview", lambda o: o["summary"]["overview"][0].update(cites=[]), "summary.overview[0]: cites no post; every paragraph must be checkable"),
    ("tldr too long", lambda o: o["summary"].update(tldr="x" * 401), "summary.tldr: is 401 characters, over the 400 limit"),
    ("assert and rebut", lambda o: o["claims"][0].update(rebuttals=[1, 2]), "claims[0] (c1): posts [1] both assert and rebut the claim"),
]


@pytest.mark.parametrize("name,change,expected", ANALYSIS_MUTATIONS, ids=[case[0] for case in ANALYSIS_MUTATIONS])
def test_analysis_mutations_are_rejected_with_exact_problem(name: str, change: Any, expected: str) -> None:
    assert expected in problems_of("analyze_thread", analysis_input(), mutate(change))


def test_all_problems_are_reported_together() -> None:
    output = valid_analysis()
    output["summary"]["tldr"] = ""
    output["posts"][3]["annotation"] = None
    problems = problems_of("analyze_thread", analysis_input(), output)
    assert "summary.tldr: is empty" in problems
    assert "posts[#5]: tone 'hostile' or a conduct signal requires an annotation" in problems


# --- validate: quiz, digest, check ------------------------------------------------------


def quiz_input() -> dict[str, Any]:
    return inputs.analyzed_thread_input(sample_thread(), CATEGORIES, valid_analysis())


def test_valid_quiz_is_accepted() -> None:
    assert validate.validate_quiz_thread(quiz_input(), valid_quiz()) == valid_quiz()


def test_quiz_rejections() -> None:
    quiz = valid_quiz()
    quiz["questions"][0]["answer_index"] = 3
    quiz["questions"][1]["cites"] = [3]
    quiz["questions"][2]["options"] = ["same", "same", "other"]
    problems = problems_of("quiz_thread", quiz_input(), quiz)
    assert "questions[0] (q1): answer_index 3 is out of range for 3 options" in problems
    assert "questions[1] (q2).cites: cites post #3, which is not a visible post in this thread" in problems
    assert "questions[2] (q3).options: duplicate values ['same']" in problems


def test_quiz_with_every_answer_in_one_position_is_rejected() -> None:
    quiz = valid_quiz()
    for question in quiz["questions"]:
        question["answer_index"] = 0
    assert problems_of("quiz_thread", quiz_input(), quiz) == ["questions: every answer is option [0]; vary the correct position"]


def test_quiz_question_count_bounds() -> None:
    quiz = valid_quiz()
    quiz["questions"] = quiz["questions"][:4]
    assert "questions: has 4; needs 5-8" in problems_of("quiz_thread", quiz_input(), quiz)


def digest_input() -> dict[str, Any]:
    other = make_thread([{"author": "x", "raw": "release notes"}], topic_id=200)
    return inputs.forum_digest_input((sample_thread(), other), CATEGORIES, {TopicId(100): valid_analysis()}, "w")


def valid_digest() -> dict[str, Any]:
    return {
        "headline": "Dev fund debate",
        "themes": [{"title": "Funding", "summary": "The dev fund debate.", "topic_ids": [100]}, {"title": "Releases", "summary": "Release notes.", "topic_ids": [200]}],
        "worth_reading": [{"topic_id": 100, "post_number": 4, "why": "A concession."}],
        "quiet_but_notable": [{"topic_id": 200, "why": "Release notes."}],
    }


def test_valid_digest_is_accepted() -> None:
    assert validate.validate_forum_digest(digest_input(), valid_digest()) == valid_digest()


def test_digest_rejections() -> None:
    digest = valid_digest()
    digest["worth_reading"] = [{"topic_id": 100, "post_number": 2 + 3, "why": "x"}, {"topic_id": 200, "post_number": 1, "why": "x"}]
    digest["quiet_but_notable"] = [{"topic_id": 100, "why": "x"}]
    digest["themes"][0]["topic_ids"] = [999]
    problems = problems_of("forum_digest", digest_input(), digest)
    assert "worth_reading[0]: t/100#5 is not a post the thread analysis highlights" in problems
    assert "worth_reading[1]: topic 200 is not an analyzed thread" in problems
    assert "quiet_but_notable[0]: topic 100 must be one of other_threads" in problems
    assert "themes[0]: topic 999 is not in the input" in problems


def test_digest_worth_reading_must_be_highlighted() -> None:
    digest = valid_digest()
    digest["worth_reading"] = [{"topic_id": 100, "post_number": 5, "why": "x"}]
    assert problems_of("forum_digest", digest_input(), digest) == ["worth_reading[0]: t/100#5 is not a post the thread analysis highlights"]


def check_input() -> dict[str, Any]:
    return inputs.check_draft_input(sample_thread(), CATEGORIES, valid_analysis(), DRAFT)


def test_valid_check_is_accepted() -> None:
    assert validate.validate_check_draft(check_input(), valid_check(DRAFT.value)) == valid_check(DRAFT.value)


def test_check_rejections() -> None:
    check = valid_check(DRAFT.value)
    check["repetitions"][0]["claim_id"] = "c9"
    check["factual"].append({"span": "dev fund", "assessment": "unsourced", "cites": [1], "note": "n"})
    check["factual"].append({"span": "dev fund", "assessment": "supported-in-thread", "cites": [], "note": "n"})
    check["tone"].append({"signal": "B3", "span": "not in draft", "note": "n"})
    problems = problems_of("check_draft", check_input(), check)
    assert problems == [
        "repetitions[0]: unknown claim 'c9'",
        "factual[1] (unsourced): an unsourced finding cites no posts",
        "factual[2] (supported-in-thread): must cite the posts it relies on",
        "tone[0] (B3): span 'not in draft' does not occur verbatim in the draft",
    ]


# --- jobs -------------------------------------------------------------------------------


def test_prepare_and_load_job_round_trip(tmp_path: Path) -> None:
    job = prepare_job(tmp_path, "analyze_thread", "t100", analysis_input())
    assert sorted(path.name for path in job.directory.iterdir()) == ["input.json", "input.view.md", "job.json", "output.schema.json", "prompt.md"]
    assert (job.directory / "input.json").read_bytes() == canonical_json_bytes(analysis_input()) + b"\n"
    loaded = load_job(job.directory)
    assert loaded.input == analysis_input()
    assert loaded.prompt == jobs.render_prompt("analyze_thread")
    assert loaded.subject == "t100"


def test_load_job_detects_modified_input(tmp_path: Path) -> None:
    job = prepare_job(tmp_path, "analyze_thread", "t100", analysis_input())
    (job.directory / "input.json").write_text("{}")
    with pytest.raises(JobError, match=r"input.json: content hash [0-9a-f]{64} differs from job.json \([0-9a-f]{64}\); the job was modified$"):
        load_job(job.directory)


def test_prepare_rejects_bad_subject_and_task(tmp_path: Path) -> None:
    with pytest.raises(JobError, match=r"^invalid job subject '../escape'$"):
        prepare_job(tmp_path, "analyze_thread", "../escape", analysis_input())
    with pytest.raises(JobError, match=r"^unknown task 'nope'; known tasks: "):
        prepare_job(tmp_path, "nope", "t100", analysis_input())


def test_accept_writes_result_with_provenance_and_load_result_revalidates(tmp_path: Path) -> None:
    job = prepare_job(tmp_path / "jobs", "analyze_thread", "t100", analysis_input())
    results = tmp_path / "results"
    produced = ProducedOutput(text=json.dumps(valid_analysis()), backend="subagent", model="claude-sonnet-5-5")
    result = accept(job, produced, NOW, results)
    envelope = load_json(results / "analyze_thread" / "t100.json")
    assert isinstance(envelope, dict)
    assert {key: envelope[key] for key in ("format", "task", "subject", "backend", "model", "produced_at")} == {
        "format": "zforum-intel-result-1",
        "task": "analyze_thread",
        "subject": "t100",
        "backend": "subagent",
        "model": "claude-sonnet-5-5",
        "produced_at": "2026-10-31T12:00:00Z",
    }
    assert envelope["input_sha256"] == jobs.input_hash(analysis_input()).value
    assert envelope["prompt_sha256"] == jobs.sha256_bytes(jobs.render_prompt("analyze_thread").encode()).value
    assert load_result("analyze_thread", "t100", analysis_input(), results) == result


def test_accept_refuses_invalid_output(tmp_path: Path) -> None:
    job = prepare_job(tmp_path / "jobs", "analyze_thread", "t100", analysis_input())
    with pytest.raises(OutputInvalid, match="malformed JSON"):
        accept(job, ProducedOutput(text="{not json", backend="subagent", model="m"), NOW, tmp_path / "results")
    assert not (tmp_path / "results").exists()


def test_load_result_refuses_stale_input(tmp_path: Path) -> None:
    job = prepare_job(tmp_path / "jobs", "analyze_thread", "t100", analysis_input())
    accept(job, ProducedOutput(text=json.dumps(valid_analysis()), backend="subagent", model="m"), NOW, tmp_path / "results")
    changed = copy.deepcopy(analysis_input())
    changed["topic"]["title"] = "Edited title"
    with pytest.raises(JobError, match=r"stale; produced from input [0-9a-f]{64}, current input is [0-9a-f]{64}$"):
        load_result("analyze_thread", "t100", changed, tmp_path / "results")


def test_load_result_refuses_output_from_another_prompt(tmp_path: Path) -> None:
    job = prepare_job(tmp_path / "jobs", "analyze_thread", "t100", analysis_input())
    accept(job, ProducedOutput(text=json.dumps(valid_analysis()), backend="subagent", model="m"), NOW, tmp_path / "results")
    path = tmp_path / "results" / "analyze_thread" / "t100.json"
    envelope = load_json(path)
    assert isinstance(envelope, dict)
    envelope["prompt_sha256"] = "0" * 64
    path.write_text(json.dumps(envelope))
    with pytest.raises(JobError, match=r"produced by prompt 0{64}, current prompt is [0-9a-f]{64}; re-run the task$"):
        load_result("analyze_thread", "t100", analysis_input(), tmp_path / "results")


@given(st.text(alphabet=st.characters(exclude_categories=["Cs"]), max_size=3000))
def test_view_soft_wrap_is_reversible_and_bounded(text: str) -> None:
    rendered = jobs._verbatim(text)
    assert rendered.replace("\n" + jobs.VIEW_CONTINUATION, "") == text or "\n" + jobs.VIEW_CONTINUATION in text
    for line in rendered.split("\n"):
        assert len(line) <= jobs.VIEW_WRAP_CHARS + len(jobs.VIEW_CONTINUATION)


def test_render_view_shows_post_text_verbatim() -> None:
    view = render_view(analysis_input())
    assert "### #2 · bob · 2026-10-20T10:00:00Z · reply to #1" in view
    assert "No. It pays the core developers, and ending it is reckless." in view
    assert "(hidden by the community; no text)" in view


# --- backends ---------------------------------------------------------------------------


def test_subagent_backend_reads_output_and_declares_model(tmp_path: Path) -> None:
    job = prepare_job(tmp_path, "analyze_thread", "t100", analysis_input())
    with pytest.raises(BackendError, match="the subagent has not written output.json$"):
        SubagentBackend("claude-sonnet-5-5").produce(job)
    job.output_path.write_text("{}")
    assert SubagentBackend("claude-sonnet-5-5").produce(job) == ProducedOutput("{}", "subagent", "claude-sonnet-5-5")
    with pytest.raises(ValueError, match="needs the model"):
        SubagentBackend(" ")


@dataclass
class FakeBlock:
    type: str
    text: str = ""


@dataclass
class FakeStopDetails:
    category: str | None
    explanation: str | None


@dataclass
class FakeMessage:
    stop_reason: str
    content: list[FakeBlock]
    model: str = "claude-sonnet-5-5"
    stop_details: FakeStopDetails | None = None


@dataclass
class FakeStream:
    message: FakeMessage

    def __enter__(self) -> "FakeStream":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def get_final_message(self) -> FakeMessage:
        return self.message


@dataclass
class FakeMessages:
    message: FakeMessage
    calls: list[dict[str, Any]] = field(default_factory=list)

    def stream(self, **kwargs: Any) -> FakeStream:
        self.calls.append(kwargs)
        return FakeStream(self.message)


def run_api(tmp_path: Path, message: FakeMessage) -> tuple[ProducedOutput, FakeMessages]:
    job = prepare_job(tmp_path, "analyze_thread", "t100", analysis_input())
    fake = FakeMessages(message)
    # The fake implements only stream(), the single method AnthropicBackend calls.
    produced = AnthropicBackend(cast(Messages, fake)).produce(job)
    return produced, fake


def test_api_backend_sends_the_job_as_system_prompt_input_and_schema(tmp_path: Path) -> None:
    produced, fake = run_api(tmp_path, FakeMessage("end_turn", [FakeBlock("thinking"), FakeBlock("text", '{"ok":1}')], model="claude-sonnet-5"))
    assert produced == ProducedOutput('{"ok":1}', "anthropic-api", "claude-sonnet-5")
    (call,) = fake.calls
    assert call == {
        "model": API_MODEL,
        "max_tokens": API_MAX_TOKENS,
        "betas": [API_FALLBACK_BETA],
        "fallbacks": "default",
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": "high", "format": {"type": "json_schema", "schema": jobs.TASKS["analyze_thread"].schema}},
        "system": jobs.render_prompt("analyze_thread"),
        "messages": [{"role": "user", "content": canonical_json_bytes(analysis_input()).decode()}],
    }


@pytest.mark.parametrize(
    "message,expected",
    [
        (FakeMessage("refusal", [], stop_details=FakeStopDetails("cyber", "declined")), "analyze_thread/t100: model claude-sonnet-5-5 refused (category 'cyber'): declined"),
        (FakeMessage("max_tokens", [FakeBlock("text", "{")]), f"analyze_thread/t100: output hit max_tokens={API_MAX_TOKENS} and is truncated"),
        (FakeMessage("pause_turn", []), "analyze_thread/t100: unexpected stop_reason 'pause_turn'"),
        (FakeMessage("end_turn", [FakeBlock("text", "a"), FakeBlock("text", "b")]), "analyze_thread/t100: expected exactly one text block, got 2"),
    ],
)
def test_api_backend_failures(tmp_path: Path, message: FakeMessage, expected: str) -> None:
    with pytest.raises(BackendError) as raised:
        run_api(tmp_path, message)
    assert str(raised.value) == expected


def test_schemas_stay_inside_the_structured_outputs_subset() -> None:
    forbidden = {"minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "pattern", "multipleOf"}

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            assert not (forbidden & set(node)), f"{path} uses {forbidden & set(node)}"
            if node.get("type") == "object":
                assert node["additionalProperties"] is False, path
                assert sorted(node["required"]) == sorted(node["properties"]), path
            for key, value in node.items():
                walk(value, f"{path}/{key}")
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}/{index}")

    for name, definition in jobs.TASKS.items():
        walk(definition.schema, name)


# --- validate: brief_thread and forum_issues --------------------------------------------


def brief_input() -> dict[str, Any]:
    return inputs.analyzed_thread_input(sample_thread(), CATEGORIES, valid_analysis())


def test_valid_brief_is_accepted() -> None:
    assert validate.validate_brief_thread(brief_input(), valid_brief()) == valid_brief()


BRIEF_MUTATIONS: list[tuple[str, Any, str]] = [
    ("quote not verbatim", lambda o: o["views"][0]["best_for"].update(quote="It costs 25% of issuance."), "views[0] (v1).best_for: quote 'It costs 25% of issuance.' does not occur verbatim in post #1"),
    ("quote from hidden post", lambda o: o["views"][0]["best_against"].update(post_number=3), "views[0] (v1).best_against: cites post #3, which is not a visible post in this thread"),
    ("unknown holder", lambda o: o["views"][1].update(holders=["mallory"]), "views[1] (v2).holders: 'mallory' did not post in this thread"),
    ("pending without decision", lambda o: o["stakes"].update(decision=None), "stakes: decision_pending is true but decision is null"),
    ("same post for and against", lambda o: o["views"][0]["best_against"].update(post_number=1, quote="end the dev fund"), "views[0] (v1): best_for and best_against cite the same post"),
    ("too many views", lambda o: o.update(views=o["views"] + [dict(o["views"][1], view_id=f"v{n}") for n in range(3, 6)]), "views: has 5; needs 1-4"),
    ("long headline", lambda o: o.update(headline="x" * 121), "headline: is 121 characters, over the 120 limit"),
    ("uncited common ground", lambda o: o["common_ground"][0].update(cites=[]), "common_ground[0]: cites no post"),
    ("bad view id", lambda o: o["views"][0].update(view_id="view1"), "views[0] (view1): view_id must look like v1, v2, ..."),
]


@pytest.mark.parametrize("name,change,expected", BRIEF_MUTATIONS, ids=[case[0] for case in BRIEF_MUTATIONS])
def test_brief_mutations_are_rejected_with_exact_problem(name: str, change: Any, expected: str) -> None:
    output = valid_brief()
    change(output)
    assert expected in problems_of("brief_thread", brief_input(), output)


def issues_input() -> dict[str, Any]:
    return inputs.forum_issues_input([(sample_thread(), valid_brief())])


def test_forum_issues_input_exact() -> None:
    assert issues_input() == {
        "briefs": [
            {
                "topic_id": 100,
                "title": "A topic",
                "headline": "Whether to end the dev fund",
                "stakes": "funding",
                "views": [
                    {"view_id": "v1", "label": "End the fund", "one_line": "It costs too much issuance.", "holder_count": 2},
                    {"view_id": "v2", "label": "Keep the fund", "one_line": "It pays core developers.", "holder_count": 1},
                ],
            }
        ]
    }


def test_valid_issues_are_accepted() -> None:
    assert validate.validate_forum_issues(issues_input(), valid_issues()) == valid_issues()


def test_issue_rejections() -> None:
    issues = valid_issues()
    issues["issues"][0]["question"] = "Fund policy."
    issues["issues"][1]["mapping"] = [{"topic_id": 100, "view_id": "v1", "stance_id": "s1"}]
    issues["issues"][2]["mapping"].append({"topic_id": 999, "view_id": "v1", "stance_id": "s9"})
    problems = problems_of("forum_issues", issues_input(), issues)
    assert "issues[0] (i1).question: must be a question ending in '?'" in problems
    assert "issues[1] (i2): maps views to 1 stance(s); an issue must divide views across at least 2" in problems
    assert "issues[2] (i3).mapping: t/999 v1 is not a view in the input briefs" in problems
    assert "issues[2] (i3).mapping: unknown stance 's9'" in problems


def test_issue_count_bounds() -> None:
    issues = valid_issues()
    issues["issues"] = issues["issues"][:2]
    assert problems_of("forum_issues", issues_input(), issues) == ["issues: has 2; needs 3-6"]
