"""Output schemas for every model task, built from the vocabulary in zforum.vocab.

The schemas stay inside the JSON Schema subset that the API's structured outputs accept:
every object closes with additionalProperties false and lists all of its properties as
required, nullability is spelled with anyOf, and there are no numeric, length or array-size
constraints. Everything those keywords would express (ranges, counts, cross-references,
verbatim spans) is enforced by zforum.intel.validate, which every backend's output passes
through."""

from typing import Any

from zforum.vocab import CHECK_DRAFT_SIGNAL_IDS, CLAIM_KINDS, CLAIM_STATUSES, FACTUAL_ASSESSMENTS, MODEL_SIGNAL_IDS, QUIZ_KINDS, STAKE_KINDS, TONES

JsonSchema = dict[str, Any]


def _object(properties: dict[str, JsonSchema]) -> JsonSchema:
    return {"type": "object", "additionalProperties": False, "required": list(properties), "properties": properties}


def _array(items: JsonSchema) -> JsonSchema:
    return {"type": "array", "items": items}


_STRING: JsonSchema = {"type": "string"}
_INTEGER: JsonSchema = {"type": "integer"}
_POST_NUMBERS = _array(_INTEGER)
_NULLABLE_STRING: JsonSchema = {"anyOf": [_STRING, {"type": "null"}]}
_NULLABLE_INTEGER: JsonSchema = {"anyOf": [_INTEGER, {"type": "null"}]}


def _enum(values: tuple[str, ...]) -> JsonSchema:
    return {"type": "string", "enum": list(values)}


_CITED_TEXT = _object({"text": _STRING, "cites": _POST_NUMBERS})

THREAD_SUMMARY_SCHEMA = _object(
    {
        "tldr": _STRING,
        "overview": _array(_CITED_TEXT),
        "positions": _array(_object({"label": _STRING, "summary": _STRING, "participants": _array(_STRING), "key_posts": _POST_NUMBERS})),
        "open_questions": _array(_CITED_TEXT),
        "temperature": _enum(TONES),
    }
)

CLAIM_SCHEMA = _object(
    {
        "claim_id": _STRING,
        "text": _STRING,
        "kind": _enum(CLAIM_KINDS),
        "asserted_in": _POST_NUMBERS,
        "first_post": _INTEGER,
        "strongest_statement": _INTEGER,
        "rebuttals": _POST_NUMBERS,
        "strongest_rebuttal": _NULLABLE_INTEGER,
        "status": _enum(CLAIM_STATUSES),
        "status_note": _STRING,
    }
)

ANALYZE_THREAD_SCHEMA = _object(
    {
        "summary": THREAD_SUMMARY_SCHEMA,
        "claims": _array(CLAIM_SCHEMA),
        "posts": _array(
            _object(
                {
                    "post_number": _INTEGER,
                    "tone": _enum(TONES),
                    "claim_ids": _array(_STRING),
                    "annotation": _NULLABLE_STRING,
                    "signals": _array(_object({"signal": _enum(MODEL_SIGNAL_IDS), "span": _STRING, "note": _STRING})),
                }
            )
        ),
        "mind_changes": _array(_object({"post_number": _INTEGER, "changed_by": _POST_NUMBERS, "span": _STRING, "note": _STRING})),
    }
)

QUIZ_THREAD_SCHEMA = _object(
    {
        "questions": _array(
            _object(
                {
                    "question_id": _STRING,
                    "kind": _enum(QUIZ_KINDS),
                    "prompt": _STRING,
                    "options": _array(_STRING),
                    "answer_index": _INTEGER,
                    "explanation": _STRING,
                    "cites": _POST_NUMBERS,
                }
            )
        )
    }
)

FORUM_DIGEST_SCHEMA = _object(
    {
        "headline": _STRING,
        "themes": _array(_object({"title": _STRING, "summary": _STRING, "topic_ids": _array(_INTEGER)})),
        "worth_reading": _array(_object({"topic_id": _INTEGER, "post_number": _INTEGER, "why": _STRING})),
        "quiet_but_notable": _array(_object({"topic_id": _INTEGER, "why": _STRING})),
    }
)

_QUOTE = _object({"post_number": _INTEGER, "quote": _STRING})

BRIEF_THREAD_SCHEMA = _object(
    {
        "headline": _STRING,
        "why_it_matters": _STRING,
        "stakes": _object({"kind": _enum(STAKE_KINDS), "decision_pending": {"type": "boolean"}, "decision": _NULLABLE_STRING}),
        "views": _array(
            _object(
                {
                    "view_id": _STRING,
                    "label": _STRING,
                    "one_line": _STRING,
                    "holders": _array(_STRING),
                    "best_for": _QUOTE,
                    "best_against": {"anyOf": [_QUOTE, {"type": "null"}]},
                }
            )
        ),
        "common_ground": _array(_CITED_TEXT),
        "unresolved": _array(_CITED_TEXT),
        "next": _NULLABLE_STRING,
    }
)

FORUM_ISSUES_SCHEMA = _object(
    {
        "issues": _array(
            _object(
                {
                    "issue_id": _STRING,
                    "question": _STRING,
                    "context": _STRING,
                    "stances": _array(_object({"stance_id": _STRING, "label": _STRING, "description": _STRING})),
                    "mapping": _array(_object({"topic_id": _INTEGER, "view_id": _STRING, "stance_id": _STRING})),
                }
            )
        )
    }
)

CHECK_DRAFT_SCHEMA = _object(
    {
        "repetitions": _array(_object({"span": _STRING, "claim_id": _STRING, "note": _STRING})),
        "factual": _array(_object({"span": _STRING, "assessment": _enum(FACTUAL_ASSESSMENTS), "cites": _POST_NUMBERS, "note": _STRING})),
        "tone": _array(_object({"signal": _enum(CHECK_DRAFT_SIGNAL_IDS), "span": _STRING, "note": _STRING})),
        "novel_claims": _array(_object({"span": _STRING, "note": _STRING})),
        "summary": _STRING,
    }
)
