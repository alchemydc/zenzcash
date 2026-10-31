"""Model work as jobs. A job directory holds everything a backend needs, a Sonnet subagent
today or the Anthropic API tomorrow:

    <jobs_root>/<task>/<subject>/
        job.json            hashes of the three files below; the job's identity
        prompt.md           the rendered task prompt (system prompt for the API backend)
        input.json          the task input, canonical JSON
        output.schema.json  the output schema
        input.view.md       a readable rendering of input.json for subagents (derived, not hashed)
        output.json         written by the backend

Accepting a job validates output.json and stores it under intel/results/ with provenance.
Loading a stored result re-validates it and refuses it if the current input or prompt
differs from the ones that produced it, so published outputs always match published prompts.
"""

import hashlib
import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jsonschema

from zforum.domain import Sha256Hex, UtcTimestamp
from zforum.fsio import canonical_json_bytes, load_json, parse_json_bytes, write_bytes_atomic, write_json_atomic
from zforum.intel import validate
from zforum.intel.schemas import (
    ANALYZE_THREAD_SCHEMA,
    BRIEF_THREAD_SCHEMA,
    CHECK_DRAFT_SCHEMA,
    FORUM_DIGEST_SCHEMA,
    FORUM_ISSUES_SCHEMA,
    QUIZ_THREAD_SCHEMA,
    JsonSchema,
)
from zforum.vocab import (
    CHECK_DRAFT_SIGNAL_IDS,
    CLAIM_KINDS,
    CLAIM_STATUSES,
    FACTUAL_ASSESSMENTS,
    MODEL_SIGNAL_IDS,
    QUIZ_KINDS,
    SIGNALS_BY_ID,
    STAKE_KINDS,
    TONES,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PROMPTS_DIR = REPO_ROOT / "intel" / "tasks"
RESULTS_DIR = REPO_ROOT / "intel" / "results"
JOB_FORMAT = "zforum-intel-job-1"
RESULT_FORMAT = "zforum-intel-result-1"
SUBJECT_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]{0,80}")
_PLACEHOLDER = re.compile(r"\{\{([A-Z_]+)\}\}")

JsonObject = dict[str, Any]


class JobError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class TaskDefinition:
    name: str
    schema: JsonSchema
    validator: Callable[[JsonObject, object], JsonObject]


TASKS: Mapping[str, TaskDefinition] = {
    "analyze_thread": TaskDefinition("analyze_thread", ANALYZE_THREAD_SCHEMA, validate.validate_analyze_thread),
    "quiz_thread": TaskDefinition("quiz_thread", QUIZ_THREAD_SCHEMA, validate.validate_quiz_thread),
    "forum_digest": TaskDefinition("forum_digest", FORUM_DIGEST_SCHEMA, validate.validate_forum_digest),
    "check_draft": TaskDefinition("check_draft", CHECK_DRAFT_SCHEMA, validate.validate_check_draft),
    "brief_thread": TaskDefinition("brief_thread", BRIEF_THREAD_SCHEMA, validate.validate_brief_thread),
    "forum_issues": TaskDefinition("forum_issues", FORUM_ISSUES_SCHEMA, validate.validate_forum_issues),
}


def task(name: str) -> TaskDefinition:
    if name not in TASKS:
        raise JobError(f"unknown task {name!r}; known tasks: {sorted(TASKS)}")
    return TASKS[name]


def _signal_lines(ids: tuple[str, ...]) -> str:
    return "\n".join(f"- **{signal_id} {SIGNALS_BY_ID[signal_id].name}**: {SIGNALS_BY_ID[signal_id].description}" for signal_id in ids)


def template_values() -> dict[str, str]:
    """Every value a prompt template may reference. Vocabularies and bounds come from their
    one home, so a prompt can never disagree with the validator that judges its output."""
    return {
        "MODEL_SIGNALS": _signal_lines(MODEL_SIGNAL_IDS),
        "CHECK_DRAFT_SIGNALS": _signal_lines(CHECK_DRAFT_SIGNAL_IDS),
        "TONES": ", ".join(TONES),
        "ANNOTATED_TONES": ", ".join(validate.ANNOTATED_TONES),
        "CLAIM_KINDS": ", ".join(CLAIM_KINDS),
        "CLAIM_STATUSES": ", ".join(CLAIM_STATUSES),
        "FACTUAL_ASSESSMENTS": ", ".join(FACTUAL_ASSESSMENTS),
        "QUIZ_KINDS": ", ".join(QUIZ_KINDS),
        "TLDR_MAX_CHARS": str(validate.TLDR_MAX_CHARS),
        "SPAN_MAX_CHARS": str(validate.SPAN_MAX_CHARS),
        "ANNOTATION_MAX_CHARS": str(validate.ANNOTATION_MAX_CHARS),
        "NOTE_MAX_CHARS": str(validate.NOTE_MAX_CHARS),
        "OVERVIEW_MIN_PARAGRAPHS": str(validate.OVERVIEW_MIN_PARAGRAPHS),
        "OVERVIEW_MAX_PARAGRAPHS": str(validate.OVERVIEW_MAX_PARAGRAPHS),
        "QUIZ_MIN_QUESTIONS": str(validate.QUIZ_MIN_QUESTIONS),
        "QUIZ_MAX_QUESTIONS": str(validate.QUIZ_MAX_QUESTIONS),
        "QUIZ_MIN_OPTIONS": str(validate.QUIZ_MIN_OPTIONS),
        "QUIZ_MAX_OPTIONS": str(validate.QUIZ_MAX_OPTIONS),
        "DIGEST_MIN_THEMES": str(validate.DIGEST_MIN_THEMES),
        "DIGEST_MAX_THEMES": str(validate.DIGEST_MAX_THEMES),
        "STAKE_KINDS": ", ".join(STAKE_KINDS),
        "BRIEF_HEADLINE_MAX_CHARS": str(validate.BRIEF_HEADLINE_MAX_CHARS),
        "BRIEF_LINE_MAX_CHARS": str(validate.BRIEF_LINE_MAX_CHARS),
        "BRIEF_LABEL_MAX_CHARS": str(validate.BRIEF_LABEL_MAX_CHARS),
        "BRIEF_QUOTE_MAX_CHARS": str(validate.BRIEF_QUOTE_MAX_CHARS),
        "BRIEF_MIN_VIEWS": str(validate.BRIEF_MIN_VIEWS),
        "BRIEF_MAX_VIEWS": str(validate.BRIEF_MAX_VIEWS),
        "BRIEF_MAX_LIST_ITEMS": str(validate.BRIEF_MAX_LIST_ITEMS),
        "ISSUES_MIN": str(validate.ISSUES_MIN),
        "ISSUES_MAX": str(validate.ISSUES_MAX),
        "ISSUE_QUESTION_MAX_CHARS": str(validate.ISSUE_QUESTION_MAX_CHARS),
        "ISSUE_MIN_STANCES": str(validate.ISSUE_MIN_STANCES),
        "ISSUE_MAX_STANCES": str(validate.ISSUE_MAX_STANCES),
        "STANCE_LABEL_MAX_CHARS": str(validate.STANCE_LABEL_MAX_CHARS),
    }


def render_template(template: str, values: Mapping[str, str], source: str) -> str:
    unknown = sorted({match.group(1) for match in _PLACEHOLDER.finditer(template)} - set(values))
    if unknown:
        raise JobError(f"{source}: unknown placeholders {unknown}")
    return _PLACEHOLDER.sub(lambda match: values[match.group(1)], template)


def render_prompt(task_name: str) -> str:
    path = PROMPTS_DIR / task(task_name).name / "prompt.md"
    return render_template(path.read_text(encoding="utf-8"), template_values(), str(path))


def sha256_bytes(data: bytes) -> Sha256Hex:
    return Sha256Hex(hashlib.sha256(data).hexdigest())


def input_hash(input_document: JsonObject) -> Sha256Hex:
    return sha256_bytes(canonical_json_bytes(input_document))


def _check_subject(subject: str) -> None:
    if not SUBJECT_PATTERN.fullmatch(subject):
        raise JobError(f"invalid job subject {subject!r}")


@dataclass(frozen=True, slots=True)
class Job:
    task: TaskDefinition
    subject: str
    directory: Path
    prompt: str
    input: JsonObject

    @property
    def output_path(self) -> Path:
        return self.directory / "output.json"


def _job_files(prompt: str, input_document: JsonObject, schema: JsonSchema) -> dict[str, bytes]:
    return {
        "prompt.md": prompt.encode("utf-8"),
        "input.json": canonical_json_bytes(input_document) + b"\n",
        "output.schema.json": canonical_json_bytes(schema) + b"\n",
    }


VIEW_WRAP_CHARS = 1000
VIEW_CONTINUATION = "↪ "


def _soft_wrap(line: str) -> list[str]:
    """Splits lines longer than VIEW_WRAP_CHARS at a space. Continuation lines start with
    VIEW_CONTINUATION; neither the marker nor the break is part of the text."""
    pieces: list[str] = []
    rest = line
    while len(rest) > VIEW_WRAP_CHARS:
        cut = rest.rfind(" ", 0, VIEW_WRAP_CHARS)
        cut = VIEW_WRAP_CHARS if cut <= 0 else cut + 1
        pieces.append(rest[:cut])
        rest = rest[cut:]
    pieces.append(rest)
    return [pieces[0], *(VIEW_CONTINUATION + piece for piece in pieces[1:])]


def _verbatim(text: str) -> str:
    return "\n".join(wrapped for line in text.split("\n") for wrapped in _soft_wrap(line))


def _post_heading(post: JsonObject) -> str:
    details = [f"#{post['post_number']}", post["author"], post["created_at"]]
    if post["reply_to"] is not None:
        details.append(f"reply to #{post['reply_to']}")
    if post["author_title"] is not None:
        details.append(f"title: {post['author_title']}")
    return "### " + " · ".join(details)


def render_view(input_document: JsonObject) -> str:
    """A readable rendering of a task input. Post and draft text appear verbatim (apart from
    soft wraps), so spans can be copied from it."""
    lines = [
        "# Input view",
        "",
        "Derived from input.json, which is authoritative. Post and draft text below is verbatim,",
        f"except that lines over {VIEW_WRAP_CHARS} characters are soft-wrapped: a line starting with",
        f"'{VIEW_CONTINUATION.strip()} ' continues the previous line, and neither the marker nor the line break is part of the text.",
        "",
    ]
    for key, value in input_document.items():
        if key == "posts":
            lines.append(f"## posts ({len(value)})")
            for post in value:
                lines += ["", _post_heading(post)]
                if post["hidden"]:
                    lines.append("(hidden by the community; no text)")
                    continue
                for quote in post["quotes"]:
                    lines.append(f"> quotes t/{quote['topic_id']} #{quote['post_number']} by {quote['author']}: {quote['excerpt'][:200]!r}")
                lines += ["", _verbatim(post["text"])]
        elif key == "draft":
            lines += ["## draft", "", _verbatim(value)]
        else:
            lines += [f"## {key}", "", "```json", json.dumps(value, indent=1, ensure_ascii=False), "```"]
        lines.append("")
    return "\n".join(lines)


def prepare_job(jobs_root: Path, task_name: str, subject: str, input_document: JsonObject) -> Job:
    definition = task(task_name)
    _check_subject(subject)
    directory = jobs_root / definition.name / subject
    prompt = render_prompt(definition.name)
    files = _job_files(prompt, input_document, definition.schema)
    for name, data in files.items():
        write_bytes_atomic(directory / name, data)
    write_bytes_atomic(directory / "input.view.md", render_view(input_document).encode("utf-8"))
    (directory / "output.json").unlink(missing_ok=True)
    write_json_atomic(
        directory / "job.json",
        {"format": JOB_FORMAT, "task": definition.name, "subject": subject, **{f"{name}.sha256": sha256_bytes(data).value for name, data in files.items()}},
    )
    return Job(definition, subject, directory, prompt, input_document)


_JOB_MANIFEST_SCHEMA: JsonSchema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["format", "task", "subject", "prompt.md.sha256", "input.json.sha256", "output.schema.json.sha256"],
    "properties": {
        "format": {"const": JOB_FORMAT},
        "task": {"enum": sorted(TASKS)},
        "subject": {"type": "string"},
        "prompt.md.sha256": {"type": "string"},
        "input.json.sha256": {"type": "string"},
        "output.schema.json.sha256": {"type": "string"},
    },
}


def load_job(directory: Path) -> Job:
    manifest = load_json(directory / "job.json")
    errors = list(jsonschema.Draft202012Validator(_JOB_MANIFEST_SCHEMA).iter_errors(manifest))
    if errors:
        raise JobError(f"{directory / 'job.json'}: {errors[0].message}")
    assert isinstance(manifest, dict)
    for name in ("prompt.md", "input.json", "output.schema.json"):
        actual = sha256_bytes((directory / name).read_bytes()).value
        if actual != manifest[f"{name}.sha256"]:
            raise JobError(f"{directory / name}: content hash {actual} differs from job.json ({manifest[f'{name}.sha256']}); the job was modified")
    definition = task(manifest["task"])
    prompt = (directory / "prompt.md").read_text(encoding="utf-8")
    if prompt != render_prompt(definition.name):
        raise JobError(f"{directory}: prompt.md differs from the current {definition.name} prompt; prepare the job again")
    input_document = load_json(directory / "input.json")
    assert isinstance(input_document, dict)
    return Job(definition, manifest["subject"], directory, prompt, input_document)


def check_output_text(job: Job, output_text: str) -> JsonObject:
    try:
        output = parse_json_bytes(output_text.encode("utf-8"), str(job.output_path))
    except ValueError as error:
        raise validate.OutputInvalid(job.task.name, [str(error)]) from error
    return job.task.validator(job.input, output)


@dataclass(frozen=True, slots=True)
class ProducedOutput:
    text: str
    backend: str
    model: str


@dataclass(frozen=True, slots=True)
class AcceptedResult:
    """A model output that passed the acceptance gate against the input it is used with.
    Produced only by accept() and load_result()."""

    task: str
    subject: str
    backend: str
    model: str
    produced_at: str
    prompt_sha256: str
    input_sha256: str
    output: JsonObject


def accept(job: Job, produced: ProducedOutput, produced_at: UtcTimestamp, results_root: Path = RESULTS_DIR) -> AcceptedResult:
    output = check_output_text(job, produced.text)
    result = AcceptedResult(
        task=job.task.name,
        subject=job.subject,
        backend=produced.backend,
        model=produced.model,
        produced_at=produced_at.iso(),
        prompt_sha256=sha256_bytes(job.prompt.encode("utf-8")).value,
        input_sha256=input_hash(job.input).value,
        output=output,
    )
    write_json_atomic(
        results_root / job.task.name / f"{job.subject}.json",
        {
            "format": RESULT_FORMAT,
            "task": result.task,
            "subject": result.subject,
            "backend": result.backend,
            "model": result.model,
            "produced_at": result.produced_at,
            "prompt_sha256": result.prompt_sha256,
            "input_sha256": result.input_sha256,
            "output": result.output,
        },
    )
    return result


_RESULT_ENVELOPE_SCHEMA: JsonSchema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["format", "task", "subject", "backend", "model", "produced_at", "prompt_sha256", "input_sha256", "output"],
    "properties": {
        "format": {"const": RESULT_FORMAT},
        "task": {"enum": sorted(TASKS)},
        "subject": {"type": "string"},
        "backend": {"enum": ["subagent", "anthropic-api"]},
        "model": {"type": "string", "minLength": 1},
        "produced_at": {"type": "string"},
        "prompt_sha256": {"type": "string"},
        "input_sha256": {"type": "string"},
        "output": {"type": "object"},
    },
}


def result_path(task_name: str, subject: str, results_root: Path = RESULTS_DIR) -> Path:
    _check_subject(subject)
    return results_root / task(task_name).name / f"{subject}.json"


def load_result(task_name: str, subject: str, expected_input: JsonObject, results_root: Path = RESULTS_DIR) -> AcceptedResult:
    path = result_path(task_name, subject, results_root)
    envelope = load_json(path)
    errors = list(jsonschema.Draft202012Validator(_RESULT_ENVELOPE_SCHEMA).iter_errors(envelope))
    if errors:
        raise JobError(f"{path}: {errors[0].message}")
    assert isinstance(envelope, dict)
    if envelope["task"] != task_name or envelope["subject"] != subject:
        raise JobError(f"{path}: holds {envelope['task']}/{envelope['subject']}, expected {task_name}/{subject}")
    expected_input_sha = input_hash(expected_input).value
    if envelope["input_sha256"] != expected_input_sha:
        raise JobError(f"{path}: stale; produced from input {envelope['input_sha256']}, current input is {expected_input_sha}")
    current_prompt_sha = sha256_bytes(render_prompt(task_name).encode("utf-8")).value
    if envelope["prompt_sha256"] != current_prompt_sha:
        raise JobError(f"{path}: produced by prompt {envelope['prompt_sha256']}, current prompt is {current_prompt_sha}; re-run the task")
    output = task(task_name).validator(expected_input, envelope["output"])
    return AcceptedResult(
        task=task_name,
        subject=subject,
        backend=envelope["backend"],
        model=envelope["model"],
        produced_at=envelope["produced_at"],
        prompt_sha256=envelope["prompt_sha256"],
        input_sha256=envelope["input_sha256"],
        output=output,
    )
