"""Command line for model jobs.

    python -m zforum.intel prepare analyze_thread --snapshot S --topic 58515
    python -m zforum.intel prepare quiz_thread    --snapshot S --topic 58515
    python -m zforum.intel prepare forum_digest   --snapshot S --topics 58515 58566 ...
    python -m zforum.intel prepare check_draft    --snapshot S --topic 58515 --draft draft.md
    python -m zforum.intel check   JOB_DIR                      # validate output.json, exit 1 on problems
    python -m zforum.intel accept  JOB_DIR --subagent-model M   # store a subagent's output.json
    python -m zforum.intel run-api JOB_DIR                      # produce and store via the Anthropic API
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import anthropic

from zforum.attest.draft import DraftText
from zforum.domain import TopicId, UtcTimestamp
from zforum.fsio import write_bytes_atomic
from zforum.intel import inputs
from zforum.intel.backends import AnthropicBackend, SubagentBackend
from zforum.intel.jobs import REPO_ROOT, Job, JsonObject, accept, check_output_text, load_job, load_result, prepare_job
from zforum.intel.subjects import digest_subject, draft_subject, thread_subject
from zforum.intel.validate import OutputInvalid
from zforum.thread import Snapshot, load_snapshot

DEFAULT_JOBS_ROOT = REPO_ROOT / "data" / "intel-jobs"


def accepted_analysis(snapshot: Snapshot, topic_id: TopicId) -> JsonObject:
    thread = snapshot.thread(topic_id)
    expected = inputs.analyze_thread_input(thread, snapshot.categories)
    return load_result("analyze_thread", thread_subject(topic_id), expected).output


def prepare(arguments: argparse.Namespace) -> Job:
    snapshot = load_snapshot(arguments.snapshot)
    jobs_root: Path = arguments.jobs
    task_name: str = arguments.task
    if task_name == "forum_digest":
        if not arguments.topics:
            raise SystemExit("forum_digest needs --topics: the analyzed topics to digest")
        topic_ids = [TopicId(value) for value in arguments.topics]
        analyses = {topic_id: accepted_analysis(snapshot, topic_id) for topic_id in topic_ids}
        document = inputs.forum_digest_input(snapshot.threads, snapshot.categories, analyses, snapshot.period_description())
        return prepare_job(jobs_root, task_name, digest_subject(snapshot), document)
    if arguments.topic is None:
        raise SystemExit(f"{task_name} needs --topic")
    topic_id = TopicId(arguments.topic)
    thread = snapshot.thread(topic_id)
    if task_name == "analyze_thread":
        return prepare_job(jobs_root, task_name, thread_subject(topic_id), inputs.analyze_thread_input(thread, snapshot.categories))
    analysis = accepted_analysis(snapshot, topic_id)
    if task_name == "quiz_thread":
        return prepare_job(jobs_root, task_name, thread_subject(topic_id), inputs.quiz_thread_input(thread, snapshot.categories, analysis))
    if task_name == "check_draft":
        if arguments.draft is None:
            raise SystemExit("check_draft needs --draft")
        draft = DraftText.parse(arguments.draft.read_text(encoding="utf-8"))
        return prepare_job(jobs_root, task_name, draft_subject(topic_id, draft), inputs.check_draft_input(thread, snapshot.categories, analysis, draft))
    raise SystemExit(f"unknown task {task_name!r}")


def now() -> UtcTimestamp:
    return UtcTimestamp(datetime.now(timezone.utc))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m zforum.intel", description="Prepare, check and accept model jobs.")
    commands = parser.add_subparsers(dest="command", required=True)
    prepare_parser = commands.add_parser("prepare", help="write a job directory")
    prepare_parser.add_argument("task", choices=["analyze_thread", "quiz_thread", "forum_digest", "check_draft"])
    prepare_parser.add_argument("--snapshot", type=Path, required=True)
    prepare_parser.add_argument("--topic", type=int)
    prepare_parser.add_argument("--topics", type=int, nargs="+")
    prepare_parser.add_argument("--draft", type=Path)
    prepare_parser.add_argument("--jobs", type=Path, default=DEFAULT_JOBS_ROOT)
    check_parser = commands.add_parser("check", help="validate a job's output.json")
    check_parser.add_argument("job", type=Path)
    accept_parser = commands.add_parser("accept", help="store a subagent's output.json as a result")
    accept_parser.add_argument("job", type=Path)
    accept_parser.add_argument("--subagent-model", required=True)
    api_parser = commands.add_parser("run-api", help="produce output via the Anthropic API and store it")
    api_parser.add_argument("job", type=Path)
    arguments = parser.parse_args(argv)

    if arguments.command == "prepare":
        print(prepare(arguments).directory)
        return 0
    job = load_job(arguments.job)
    if arguments.command == "check":
        if not job.output_path.exists():
            print(f"{job.output_path} does not exist yet", file=sys.stderr)
            return 1
        try:
            check_output_text(job, job.output_path.read_text(encoding="utf-8"))
        except OutputInvalid as error:
            print(error, file=sys.stderr)
            return 1
        print(f"ok: {job.task.name}/{job.subject} output is valid")
        return 0
    if arguments.command == "accept":
        result = accept(job, SubagentBackend(arguments.subagent_model).produce(job), now())
        print(f"accepted {result.task}/{result.subject} ({result.backend}, {result.model})")
        return 0
    if arguments.command == "run-api":
        produced = AnthropicBackend(anthropic.Anthropic().beta.messages).produce(job)
        write_bytes_atomic(job.output_path, produced.text.encode("utf-8"))
        result = accept(job, produced, now())
        print(f"accepted {result.task}/{result.subject} ({result.backend}, {result.model})")
        return 0
    raise AssertionError(f"unhandled command {arguments.command!r}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
