"""The acceptance gate for model output. Every backend's output passes through here before
it is stored, and again whenever the build loads it.

Two layers: the JSON schema (shape, types, closed vocabularies), then semantics: every
cited post exists and is visible, every quoted span occurs verbatim in its source, ids are
unique and cross-references agree in both directions, and the bounds below hold. All
problems are collected and reported together, so a backend can fix them in one pass.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import jsonschema

from zforum.intel.schemas import (
    ANALYZE_THREAD_SCHEMA,
    BRIEF_THREAD_SCHEMA,
    CHECK_DRAFT_SCHEMA,
    FORUM_DIGEST_SCHEMA,
    FORUM_ISSUES_SCHEMA,
    QUIZ_THREAD_SCHEMA,
    JsonSchema,
)

TLDR_MAX_CHARS = 400
SPAN_MAX_CHARS = 400
ANNOTATION_MAX_CHARS = 240
NOTE_MAX_CHARS = 300
OVERVIEW_MIN_PARAGRAPHS = 1
OVERVIEW_MAX_PARAGRAPHS = 6
QUIZ_MIN_QUESTIONS = 5
QUIZ_MAX_QUESTIONS = 8
QUIZ_MIN_OPTIONS = 3
QUIZ_MAX_OPTIONS = 4
DIGEST_MIN_THEMES = 2
DIGEST_MAX_THEMES = 6

BRIEF_HEADLINE_MAX_CHARS = 120
BRIEF_LINE_MAX_CHARS = 200
BRIEF_LABEL_MAX_CHARS = 60
BRIEF_QUOTE_MAX_CHARS = 240
BRIEF_MIN_VIEWS = 1
BRIEF_MAX_VIEWS = 4
BRIEF_MAX_LIST_ITEMS = 3
ISSUES_MIN = 3
ISSUES_MAX = 6
ISSUE_QUESTION_MAX_CHARS = 100
ISSUE_MIN_STANCES = 2
ISSUE_MAX_STANCES = 4
STANCE_LABEL_MAX_CHARS = 30

CLAIM_ID_PATTERN = re.compile(r"c[1-9][0-9]*")
VIEW_ID_PATTERN = re.compile(r"v[1-9][0-9]*")
ISSUE_ID_PATTERN = re.compile(r"i[1-9][0-9]*")
STANCE_ID_PATTERN = re.compile(r"s[1-9][0-9]*")
QUESTION_ID_PATTERN = re.compile(r"q[1-9][0-9]*")

# Tones at which a post must carry a one-line claim annotation, because the Calm lens may
# fold it and the annotation is what a folded post shows.
ANNOTATED_TONES = ("heated", "hostile")

JsonObject = dict[str, Any]


class OutputInvalid(ValueError):
    def __init__(self, task: str, problems: list[str]) -> None:
        self.task = task
        self.problems = problems
        listing = "\n".join(f"  - {problem}" for problem in problems)
        super().__init__(f"{task} output rejected ({len(problems)} problem{'s' if len(problems) != 1 else ''}):\n{listing}")


@dataclass
class _Problems:
    items: list[str]

    def add(self, message: str) -> None:
        self.items.append(message)

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.items.append(message)


def _schema_problems(schema: JsonSchema, document: object) -> list[str]:
    errors = sorted(jsonschema.Draft202012Validator(schema).iter_errors(document), key=lambda error: [str(part) for part in error.absolute_path])
    return [f"{'/'.join(str(part) for part in error.absolute_path) or '<root>'}: {error.message}" for error in errors]


def _post_texts(input_document: JsonObject) -> dict[int, str]:
    return {post["post_number"]: post["text"] for post in input_document["posts"] if not post["hidden"]}


def _check_numbers(problems: _Problems, where: str, numbers: Iterable[int], visible: dict[int, str]) -> None:
    for number in numbers:
        problems.require(number in visible, f"{where}: cites post #{number}, which is not a visible post in this thread")


def _check_span(problems: _Problems, where: str, span: str, source: str, source_name: str) -> None:
    if not span.strip():
        problems.add(f"{where}: span is empty")
    elif len(span) > SPAN_MAX_CHARS:
        problems.add(f"{where}: span is {len(span)} characters, over the {SPAN_MAX_CHARS} limit")
    elif span not in source:
        problems.add(f"{where}: span {span[:80]!r} does not occur verbatim in {source_name}")


def _check_text(problems: _Problems, where: str, text: str, limit: int | None = None, single_line: bool = False) -> None:
    if not text.strip():
        problems.add(f"{where}: is empty")
    if limit is not None and len(text) > limit:
        problems.add(f"{where}: is {len(text)} characters, over the {limit} limit")
    if single_line and "\n" in text:
        problems.add(f"{where}: must be a single line")


def _check_unique(problems: _Problems, where: str, values: list[Any]) -> None:
    duplicates = sorted({value for value in values if values.count(value) > 1}, key=str)
    problems.require(not duplicates, f"{where}: duplicate values {duplicates}")


def validate_analyze_thread(input_document: JsonObject, output: object) -> JsonObject:
    schema_problems = _schema_problems(ANALYZE_THREAD_SCHEMA, output)
    if schema_problems:
        raise OutputInvalid("analyze_thread", schema_problems)
    assert isinstance(output, dict)
    problems = _Problems([])
    visible = _post_texts(input_document)
    authors = {post["post_number"]: post["author"] for post in input_document["posts"]}

    summary = output["summary"]
    _check_text(problems, "summary.tldr", summary["tldr"], TLDR_MAX_CHARS)
    problems.require(
        OVERVIEW_MIN_PARAGRAPHS <= len(summary["overview"]) <= OVERVIEW_MAX_PARAGRAPHS,
        f"summary.overview: has {len(summary['overview'])} paragraphs; needs {OVERVIEW_MIN_PARAGRAPHS}-{OVERVIEW_MAX_PARAGRAPHS}",
    )
    for index, paragraph in enumerate(summary["overview"]):
        _check_text(problems, f"summary.overview[{index}].text", paragraph["text"])
        problems.require(bool(paragraph["cites"]), f"summary.overview[{index}]: cites no post; every paragraph must be checkable")
        _check_numbers(problems, f"summary.overview[{index}]", paragraph["cites"], visible)
    problems.require(bool(summary["positions"]), "summary.positions: is empty; a thread has at least one position")
    for index, position in enumerate(summary["positions"]):
        _check_text(problems, f"summary.positions[{index}].label", position["label"], 80, single_line=True)
        _check_text(problems, f"summary.positions[{index}].summary", position["summary"])
        problems.require(bool(position["key_posts"]), f"summary.positions[{index}]: names no key post")
        _check_numbers(problems, f"summary.positions[{index}].key_posts", position["key_posts"], visible)
        known_authors = set(authors.values())
        for participant in position["participants"]:
            problems.require(participant in known_authors, f"summary.positions[{index}].participants: {participant!r} did not post in this thread")
    for index, question in enumerate(summary["open_questions"]):
        _check_text(problems, f"summary.open_questions[{index}].text", question["text"])
        problems.require(bool(question["cites"]), f"summary.open_questions[{index}]: cites no post")
        _check_numbers(problems, f"summary.open_questions[{index}]", question["cites"], visible)

    claims = output["claims"]
    claim_ids = [claim["claim_id"] for claim in claims]
    _check_unique(problems, "claims[].claim_id", claim_ids)
    for index, claim in enumerate(claims):
        where = f"claims[{index}] ({claim['claim_id']})"
        problems.require(bool(CLAIM_ID_PATTERN.fullmatch(claim["claim_id"])), f"{where}: claim_id must look like c1, c2, ...")
        _check_text(problems, f"{where}.text", claim["text"], NOTE_MAX_CHARS, single_line=True)
        _check_text(problems, f"{where}.status_note", claim["status_note"], NOTE_MAX_CHARS)
        asserted, rebuttals = claim["asserted_in"], claim["rebuttals"]
        problems.require(bool(asserted), f"{where}: asserted_in is empty")
        _check_unique(problems, f"{where}.asserted_in", asserted)
        _check_unique(problems, f"{where}.rebuttals", rebuttals)
        _check_numbers(problems, f"{where}.asserted_in", asserted, visible)
        _check_numbers(problems, f"{where}.rebuttals", rebuttals, visible)
        overlap = sorted(set(asserted) & set(rebuttals))
        problems.require(not overlap, f"{where}: posts {overlap} both assert and rebut the claim")
        if asserted:
            problems.require(claim["first_post"] == min(asserted), f"{where}: first_post is #{claim['first_post']} but the earliest assertion is #{min(asserted)}")
        problems.require(claim["strongest_statement"] in asserted, f"{where}: strongest_statement #{claim['strongest_statement']} is not in asserted_in")
        if claim["strongest_rebuttal"] is None:
            problems.require(not rebuttals, f"{where}: has rebuttals but strongest_rebuttal is null")
        else:
            problems.require(claim["strongest_rebuttal"] in rebuttals, f"{where}: strongest_rebuttal #{claim['strongest_rebuttal']} is not in rebuttals")
        if claim["status"] == "unanswered":
            problems.require(not rebuttals, f"{where}: status is unanswered but it has rebuttals {rebuttals}")
        if claim["status"] == "contested":
            problems.require(bool(rebuttals), f"{where}: status is contested but it has no rebuttals")

    posts = output["posts"]
    numbers = [post["post_number"] for post in posts]
    _check_unique(problems, "posts[].post_number", numbers)
    missing = sorted(set(visible) - set(numbers))
    extra = sorted(set(numbers) - set(visible))
    problems.require(not missing, f"posts: no entry for visible posts {missing}; every visible post needs exactly one entry")
    problems.require(not extra, f"posts: entries for posts {extra}, which are not visible posts in this thread")
    asserted_by_claim = {claim["claim_id"]: set(claim["asserted_in"]) for claim in claims}
    for post in posts:
        number = post["post_number"]
        where = f"posts[#{number}]"
        source = visible.get(number, "")
        for claim_id in post["claim_ids"]:
            if claim_id not in asserted_by_claim:
                problems.add(f"{where}: claim_ids names unknown claim {claim_id!r}")
            else:
                problems.require(number in asserted_by_claim[claim_id], f"{where}: lists {claim_id} but {claim_id}.asserted_in does not include #{number}")
        signals = post["signals"]
        for signal_index, signal in enumerate(signals):
            _check_span(problems, f"{where}.signals[{signal_index}] ({signal['signal']})", signal["span"], source, f"post #{number}")
            _check_text(problems, f"{where}.signals[{signal_index}].note", signal["note"], NOTE_MAX_CHARS)
        has_conduct_signal = any(signal["signal"].startswith("B") for signal in signals)
        if post["tone"] in ANNOTATED_TONES or has_conduct_signal:
            problems.require(post["annotation"] is not None, f"{where}: tone {post['tone']!r} or a conduct signal requires an annotation")
        if post["annotation"] is not None:
            _check_text(problems, f"{where}.annotation", post["annotation"], ANNOTATION_MAX_CHARS, single_line=True)
    for claim in claims:
        for number in claim["asserted_in"]:
            entry = next((post for post in posts if post["post_number"] == number), None)
            if entry is not None:
                problems.require(claim["claim_id"] in entry["claim_ids"], f"claims ({claim['claim_id']}): asserted_in includes #{number} but posts[#{number}].claim_ids does not list it")

    e3_posts = {post["post_number"] for post in posts if any(signal["signal"] == "E3" for signal in post["signals"])}
    change_posts = [change["post_number"] for change in output["mind_changes"]]
    _check_unique(problems, "mind_changes[].post_number", change_posts)
    for index, change in enumerate(output["mind_changes"]):
        number = change["post_number"]
        where = f"mind_changes[{index}] (#{number})"
        _check_numbers(problems, where, [number], visible)
        _check_numbers(problems, f"{where}.changed_by", change["changed_by"], visible)
        problems.require(bool(change["changed_by"]), f"{where}: changed_by is empty")
        for earlier in change["changed_by"]:
            problems.require(earlier < number, f"{where}: changed_by #{earlier} does not precede the mind change")
        _check_span(problems, where, change["span"], visible.get(number, ""), f"post #{number}")
        _check_text(problems, f"{where}.note", change["note"], NOTE_MAX_CHARS)
    problems.require(e3_posts == set(change_posts), f"mind_changes posts {sorted(change_posts)} must equal posts carrying an E3 signal {sorted(e3_posts)}")

    if problems.items:
        raise OutputInvalid("analyze_thread", problems.items)
    return output


def validate_quiz_thread(input_document: JsonObject, output: object) -> JsonObject:
    schema_problems = _schema_problems(QUIZ_THREAD_SCHEMA, output)
    if schema_problems:
        raise OutputInvalid("quiz_thread", schema_problems)
    assert isinstance(output, dict)
    problems = _Problems([])
    visible = _post_texts(input_document)
    questions = output["questions"]
    problems.require(
        QUIZ_MIN_QUESTIONS <= len(questions) <= QUIZ_MAX_QUESTIONS, f"questions: has {len(questions)}; needs {QUIZ_MIN_QUESTIONS}-{QUIZ_MAX_QUESTIONS}"
    )
    _check_unique(problems, "questions[].question_id", [question["question_id"] for question in questions])
    for index, question in enumerate(questions):
        where = f"questions[{index}] ({question['question_id']})"
        problems.require(bool(QUESTION_ID_PATTERN.fullmatch(question["question_id"])), f"{where}: question_id must look like q1, q2, ...")
        _check_text(problems, f"{where}.prompt", question["prompt"])
        _check_text(problems, f"{where}.explanation", question["explanation"])
        options = question["options"]
        problems.require(QUIZ_MIN_OPTIONS <= len(options) <= QUIZ_MAX_OPTIONS, f"{where}: has {len(options)} options; needs {QUIZ_MIN_OPTIONS}-{QUIZ_MAX_OPTIONS}")
        _check_unique(problems, f"{where}.options", options)
        for option_index, option in enumerate(options):
            _check_text(problems, f"{where}.options[{option_index}]", option, NOTE_MAX_CHARS)
        problems.require(0 <= question["answer_index"] < len(options), f"{where}: answer_index {question['answer_index']} is out of range for {len(options)} options")
        problems.require(bool(question["cites"]), f"{where}: cites no post; every answer must be checkable")
        _check_numbers(problems, f"{where}.cites", question["cites"], visible)
    answer_positions = {question["answer_index"] for question in questions}
    problems.require(len(questions) < 4 or len(answer_positions) > 1, f"questions: every answer is option {sorted(answer_positions)}; vary the correct position")
    if problems.items:
        raise OutputInvalid("quiz_thread", problems.items)
    return output


def validate_forum_digest(input_document: JsonObject, output: object) -> JsonObject:
    schema_problems = _schema_problems(FORUM_DIGEST_SCHEMA, output)
    if schema_problems:
        raise OutputInvalid("forum_digest", schema_problems)
    assert isinstance(output, dict)
    problems = _Problems([])
    analyzed = {thread["topic_id"]: thread for thread in input_document["analyzed_threads"]}
    known = set(analyzed) | {thread["topic_id"] for thread in input_document["other_threads"]}
    _check_text(problems, "headline", output["headline"], 160, single_line=True)
    themes = output["themes"]
    problems.require(DIGEST_MIN_THEMES <= len(themes) <= DIGEST_MAX_THEMES, f"themes: has {len(themes)}; needs {DIGEST_MIN_THEMES}-{DIGEST_MAX_THEMES}")
    for index, theme in enumerate(themes):
        _check_text(problems, f"themes[{index}].title", theme["title"], 80, single_line=True)
        _check_text(problems, f"themes[{index}].summary", theme["summary"])
        problems.require(bool(theme["topic_ids"]), f"themes[{index}]: names no topic")
        for topic_id in theme["topic_ids"]:
            problems.require(topic_id in known, f"themes[{index}]: topic {topic_id} is not in the input")
    for index, pick in enumerate(output["worth_reading"]):
        where = f"worth_reading[{index}]"
        thread = analyzed.get(pick["topic_id"])
        if thread is None:
            problems.add(f"{where}: topic {pick['topic_id']} is not an analyzed thread")
            continue
        highlighted = {change["post_number"] for change in thread["mind_changes"]}
        for claim in thread["claims"]:
            highlighted |= {claim["first_post"], claim["strongest_statement"]}
            if claim["strongest_rebuttal"] is not None:
                highlighted.add(claim["strongest_rebuttal"])
        problems.require(pick["post_number"] in highlighted, f"{where}: t/{pick['topic_id']}#{pick['post_number']} is not a post the thread analysis highlights")
        _check_text(problems, f"{where}.why", pick["why"], NOTE_MAX_CHARS)
    for index, pick in enumerate(output["quiet_but_notable"]):
        problems.require(pick["topic_id"] in known and pick["topic_id"] not in analyzed, f"quiet_but_notable[{index}]: topic {pick['topic_id']} must be one of other_threads")
        _check_text(problems, f"quiet_but_notable[{index}].why", pick["why"], NOTE_MAX_CHARS)
    if problems.items:
        raise OutputInvalid("forum_digest", problems.items)
    return output


def validate_check_draft(input_document: JsonObject, output: object) -> JsonObject:
    schema_problems = _schema_problems(CHECK_DRAFT_SCHEMA, output)
    if schema_problems:
        raise OutputInvalid("check_draft", schema_problems)
    assert isinstance(output, dict)
    problems = _Problems([])
    visible = _post_texts(input_document)
    draft: str = input_document["draft"]
    claim_ids = {claim["claim_id"] for claim in input_document["analysis"]["claims"]}
    for index, repetition in enumerate(output["repetitions"]):
        where = f"repetitions[{index}]"
        _check_span(problems, where, repetition["span"], draft, "the draft")
        problems.require(repetition["claim_id"] in claim_ids, f"{where}: unknown claim {repetition['claim_id']!r}")
        _check_text(problems, f"{where}.note", repetition["note"], NOTE_MAX_CHARS)
    for index, finding in enumerate(output["factual"]):
        where = f"factual[{index}] ({finding['assessment']})"
        _check_span(problems, where, finding["span"], draft, "the draft")
        _check_numbers(problems, where, finding["cites"], visible)
        if finding["assessment"] == "unsourced":
            problems.require(not finding["cites"], f"{where}: an unsourced finding cites no posts")
        else:
            problems.require(bool(finding["cites"]), f"{where}: must cite the posts it relies on")
        _check_text(problems, f"{where}.note", finding["note"], NOTE_MAX_CHARS)
    for index, finding in enumerate(output["tone"]):
        _check_span(problems, f"tone[{index}] ({finding['signal']})", finding["span"], draft, "the draft")
        _check_text(problems, f"tone[{index}].note", finding["note"], NOTE_MAX_CHARS)
    for index, finding in enumerate(output["novel_claims"]):
        _check_span(problems, f"novel_claims[{index}]", finding["span"], draft, "the draft")
        _check_text(problems, f"novel_claims[{index}].note", finding["note"], NOTE_MAX_CHARS)
    _check_text(problems, "summary", output["summary"], 600)
    if problems.items:
        raise OutputInvalid("check_draft", problems.items)
    return output


def _check_quote(problems: _Problems, where: str, quote: JsonObject, visible: dict[int, str]) -> None:
    number = quote["post_number"]
    if number not in visible:
        problems.add(f"{where}: cites post #{number}, which is not a visible post in this thread")
        return
    text = quote["quote"]
    if not text.strip():
        problems.add(f"{where}: quote is empty")
    elif len(text) > BRIEF_QUOTE_MAX_CHARS:
        problems.add(f"{where}: quote is {len(text)} characters, over the {BRIEF_QUOTE_MAX_CHARS} limit")
    elif text not in visible[number]:
        problems.add(f"{where}: quote {text[:80]!r} does not occur verbatim in post #{number}")


def _check_cited_list(problems: _Problems, where: str, items: list[JsonObject], visible: dict[int, str]) -> None:
    problems.require(len(items) <= BRIEF_MAX_LIST_ITEMS, f"{where}: has {len(items)} items; at most {BRIEF_MAX_LIST_ITEMS}")
    for index, item in enumerate(items):
        _check_text(problems, f"{where}[{index}].text", item["text"], BRIEF_LINE_MAX_CHARS, single_line=True)
        problems.require(bool(item["cites"]), f"{where}[{index}]: cites no post")
        _check_numbers(problems, f"{where}[{index}]", item["cites"], visible)


def validate_brief_thread(input_document: JsonObject, output: object) -> JsonObject:
    schema_problems = _schema_problems(BRIEF_THREAD_SCHEMA, output)
    if schema_problems:
        raise OutputInvalid("brief_thread", schema_problems)
    assert isinstance(output, dict)
    problems = _Problems([])
    visible = _post_texts(input_document)
    authors = {post["author"] for post in input_document["posts"]}
    _check_text(problems, "headline", output["headline"], BRIEF_HEADLINE_MAX_CHARS, single_line=True)
    _check_text(problems, "why_it_matters", output["why_it_matters"], BRIEF_LINE_MAX_CHARS, single_line=True)
    stakes = output["stakes"]
    if stakes["decision_pending"]:
        problems.require(stakes["decision"] is not None, "stakes: decision_pending is true but decision is null")
    if stakes["decision"] is not None:
        _check_text(problems, "stakes.decision", stakes["decision"], BRIEF_LINE_MAX_CHARS, single_line=True)
    views = output["views"]
    problems.require(BRIEF_MIN_VIEWS <= len(views) <= BRIEF_MAX_VIEWS, f"views: has {len(views)}; needs {BRIEF_MIN_VIEWS}-{BRIEF_MAX_VIEWS}")
    _check_unique(problems, "views[].view_id", [view["view_id"] for view in views])
    for index, view in enumerate(views):
        where = f"views[{index}] ({view['view_id']})"
        problems.require(bool(VIEW_ID_PATTERN.fullmatch(view["view_id"])), f"{where}: view_id must look like v1, v2, ...")
        _check_text(problems, f"{where}.label", view["label"], BRIEF_LABEL_MAX_CHARS, single_line=True)
        _check_text(problems, f"{where}.one_line", view["one_line"], BRIEF_LINE_MAX_CHARS, single_line=True)
        problems.require(bool(view["holders"]), f"{where}: holders is empty")
        _check_unique(problems, f"{where}.holders", view["holders"])
        for holder in view["holders"]:
            problems.require(holder in authors, f"{where}.holders: {holder!r} did not post in this thread")
        _check_quote(problems, f"{where}.best_for", view["best_for"], visible)
        if view["best_against"] is not None:
            _check_quote(problems, f"{where}.best_against", view["best_against"], visible)
            problems.require(view["best_against"]["post_number"] != view["best_for"]["post_number"], f"{where}: best_for and best_against cite the same post")
    _check_cited_list(problems, "common_ground", output["common_ground"], visible)
    _check_cited_list(problems, "unresolved", output["unresolved"], visible)
    if output["next"] is not None:
        _check_text(problems, "next", output["next"], BRIEF_LINE_MAX_CHARS, single_line=True)
    if problems.items:
        raise OutputInvalid("brief_thread", problems.items)
    return output


def validate_forum_issues(input_document: JsonObject, output: object) -> JsonObject:
    schema_problems = _schema_problems(FORUM_ISSUES_SCHEMA, output)
    if schema_problems:
        raise OutputInvalid("forum_issues", schema_problems)
    assert isinstance(output, dict)
    problems = _Problems([])
    views = {(brief["topic_id"], view["view_id"]) for brief in input_document["briefs"] for view in brief["views"]}
    issues = output["issues"]
    problems.require(ISSUES_MIN <= len(issues) <= ISSUES_MAX, f"issues: has {len(issues)}; needs {ISSUES_MIN}-{ISSUES_MAX}")
    _check_unique(problems, "issues[].issue_id", [issue["issue_id"] for issue in issues])
    for index, issue in enumerate(issues):
        where = f"issues[{index}] ({issue['issue_id']})"
        problems.require(bool(ISSUE_ID_PATTERN.fullmatch(issue["issue_id"])), f"{where}: issue_id must look like i1, i2, ...")
        _check_text(problems, f"{where}.question", issue["question"], ISSUE_QUESTION_MAX_CHARS, single_line=True)
        problems.require(issue["question"].rstrip().endswith("?"), f"{where}.question: must be a question ending in '?'")
        _check_text(problems, f"{where}.context", issue["context"], BRIEF_LINE_MAX_CHARS, single_line=True)
        stances = issue["stances"]
        problems.require(ISSUE_MIN_STANCES <= len(stances) <= ISSUE_MAX_STANCES, f"{where}: has {len(stances)} stances; needs {ISSUE_MIN_STANCES}-{ISSUE_MAX_STANCES}")
        stance_ids = [stance["stance_id"] for stance in stances]
        _check_unique(problems, f"{where}.stances[].stance_id", stance_ids)
        for stance_index, stance in enumerate(stances):
            problems.require(bool(STANCE_ID_PATTERN.fullmatch(stance["stance_id"])), f"{where}.stances[{stance_index}]: stance_id must look like s1, s2, ...")
            _check_text(problems, f"{where}.stances[{stance_index}].label", stance["label"], STANCE_LABEL_MAX_CHARS, single_line=True)
            _check_text(problems, f"{where}.stances[{stance_index}].description", stance["description"], BRIEF_LINE_MAX_CHARS, single_line=True)
        mapped = [(entry["topic_id"], entry["view_id"]) for entry in issue["mapping"]]
        _check_unique(problems, f"{where}.mapping (topic, view)", mapped)
        for entry in issue["mapping"]:
            problems.require((entry["topic_id"], entry["view_id"]) in views, f"{where}.mapping: t/{entry['topic_id']} {entry['view_id']} is not a view in the input briefs")
            problems.require(entry["stance_id"] in stance_ids, f"{where}.mapping: unknown stance {entry['stance_id']!r}")
        used = {entry["stance_id"] for entry in issue["mapping"]}
        problems.require(len(used) >= 2, f"{where}: maps views to {len(used)} stance(s); an issue must divide views across at least 2")
    if problems.items:
        raise OutputInvalid("forum_issues", problems.items)
    return output
