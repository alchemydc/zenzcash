"""The two ways a job's output gets produced. Both consume the same job files and both feed
the same acceptance gate (zforum.intel.jobs.accept)."""

from typing import Final

from anthropic.resources.beta.messages.messages import Messages
from anthropic.types.beta import BetaOutputConfigParam

from zforum.fsio import canonical_json_bytes
from zforum.intel.jobs import Job, ProducedOutput

API_MODEL = "claude-sonnet-5-5"
API_MAX_TOKENS = 64000
API_EFFORT: Final = "high"
# Server-side refusal fallback: if Sonnet's safety classifiers decline a request, the API
# re-runs it on the model Anthropic recommends for that refusal category. The model that
# actually answered is read from the response and recorded in provenance.
API_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class BackendError(RuntimeError):
    pass


class SubagentBackend:
    """A Claude Code subagent acts as the backend: it reads prompt.md, input.json and
    output.schema.json from the job directory and writes output.json. The subagent cannot
    attest to its own model, so the operator who launched it declares the model."""

    def __init__(self, declared_model: str) -> None:
        if not declared_model.strip():
            raise ValueError("SubagentBackend needs the model the operator ran the subagent on")
        self._model = declared_model

    def produce(self, job: Job) -> ProducedOutput:
        if not job.output_path.exists():
            raise BackendError(f"{job.output_path}: the subagent has not written output.json")
        return ProducedOutput(text=job.output_path.read_text(encoding="utf-8"), backend="subagent", model=self._model)


class AnthropicBackend:
    """Runs a job through the Messages API: the rendered prompt is the system prompt, the
    canonical input JSON is the user message, and structured outputs constrain the reply to
    the task's schema. `messages` is `anthropic.Anthropic().beta.messages`."""

    def __init__(self, messages: Messages) -> None:
        self._messages = messages

    def produce(self, job: Job) -> ProducedOutput:
        output_config: BetaOutputConfigParam = {"effort": API_EFFORT, "format": {"type": "json_schema", "schema": job.task.schema}}
        with self._messages.stream(
            model=API_MODEL,
            max_tokens=API_MAX_TOKENS,
            betas=[API_FALLBACK_BETA],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config=output_config,
            system=job.prompt,
            messages=[{"role": "user", "content": canonical_json_bytes(job.input).decode("utf-8")}],
        ) as stream:
            message = stream.get_final_message()
        if message.stop_reason == "refusal":
            details = message.stop_details
            category = details.category if details is not None else None
            explanation = details.explanation if details is not None else None
            raise BackendError(f"{job.task.name}/{job.subject}: model {message.model} refused (category {category!r}): {explanation}")
        if message.stop_reason == "max_tokens":
            raise BackendError(f"{job.task.name}/{job.subject}: output hit max_tokens={API_MAX_TOKENS} and is truncated")
        if message.stop_reason != "end_turn":
            raise BackendError(f"{job.task.name}/{job.subject}: unexpected stop_reason {message.stop_reason!r}")
        texts = [block.text for block in message.content if block.type == "text"]
        if len(texts) != 1:
            raise BackendError(f"{job.task.name}/{job.subject}: expected exactly one text block, got {len(texts)}")
        return ProducedOutput(text=texts[0], backend="anthropic-api", model=message.model)
