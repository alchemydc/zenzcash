"""A small thread with a matching valid analysis, quiz and check, for intel tests."""

import copy
from typing import Any

from tests.threads import make_thread
from zforum.discourse import Category
from zforum.domain import CategoryId
from zforum.thread import Thread

CATEGORIES = {CategoryId(25): Category(CategoryId(25), "Governance", "governance", None)}


def sample_thread() -> Thread:
    return make_thread(
        [
            {"author": "op", "raw": "Proposal: end the dev fund. It costs 20% of issuance."},
            {"author": "bob", "raw": '[quote="op, post:1, topic:100"]end the dev fund[/quote]\nNo. It pays the core developers, and ending it is reckless.', "reply_to": 1},
            {"author": "carol", "raw": None},
            {"author": "op", "raw": "Fair point, I had not considered the core developers.", "reply_to": 2},
            {"author": "dave", "raw": "Only an idiot would keep funding this."},
        ]
    )


def valid_analysis() -> dict[str, Any]:
    return copy.deepcopy(
        {
            "summary": {
                "tldr": "Whether to end the dev fund; the proposer conceded the core-developer point.",
                "overview": [{"text": "op proposed ending the fund; bob answered that it pays core developers.", "cites": [1, 2]}],
                "positions": [
                    {"label": "End the fund", "summary": "The fund costs too much issuance.", "participants": ["op", "dave"], "key_posts": [1]},
                    {"label": "Keep the fund", "summary": "It pays core developers.", "participants": ["bob"], "key_posts": [2]},
                ],
                "open_questions": [],
                "temperature": "heated",
            },
            "claims": [
                {
                    "claim_id": "c1",
                    "text": "The dev fund should end because it costs 20% of issuance.",
                    "kind": "normative",
                    "asserted_in": [1, 5],
                    "first_post": 1,
                    "strongest_statement": 1,
                    "rebuttals": [2],
                    "strongest_rebuttal": 2,
                    "status": "conceded",
                    "status_note": "op conceded at #4 after #2.",
                }
            ],
            "posts": [
                {"post_number": 1, "tone": "calm", "claim_ids": ["c1"], "annotation": None, "signals": [{"signal": "A1", "span": "end the dev fund", "note": "No cost acknowledged."}]},
                {"post_number": 2, "tone": "warm", "claim_ids": [], "annotation": None, "signals": []},
                {"post_number": 4, "tone": "calm", "claim_ids": [], "annotation": None, "signals": [{"signal": "E3", "span": "Fair point", "note": "Concedes."}]},
                {"post_number": 5, "tone": "hostile", "claim_ids": ["c1"], "annotation": "claim: the fund should not be kept", "signals": [{"signal": "B3", "span": "Only an idiot", "note": "Contempt."}]},
            ],
            "mind_changes": [{"post_number": 4, "changed_by": [2], "span": "Fair point, I had not considered the core developers.", "note": "Concedes the core-developer point."}],
        }
    )


def valid_quiz() -> dict[str, Any]:
    question = {"kind": "rebuttal", "prompt": "What answered the proposal?", "options": ["It pays core developers", "It is illegal", "It is too small"], "explanation": "#2 says so.", "cites": [2]}
    return {"questions": [{**question, "question_id": f"q{index}", "answer_index": index % 3} for index in range(1, 6)]}


def valid_check(draft: str) -> dict[str, Any]:
    return {
        "repetitions": [{"span": "end the dev fund", "claim_id": "c1", "note": "First made at #1; answered at #2."}],
        "factual": [{"span": "30% of issuance", "assessment": "contradicted-in-thread", "cites": [1], "note": "#1 says 20%."}],
        "tone": [],
        "novel_claims": [],
        "summary": "Repeats c1 and misstates its figure.",
    }


def valid_brief() -> dict[str, Any]:
    return copy.deepcopy(
        {
            "headline": "Whether to end the dev fund",
            "why_it_matters": "The fund pays core developers from issuance.",
            "stakes": {"kind": "funding", "decision_pending": True, "decision": "Whether to stop the fund at the next upgrade"},
            "views": [
                {
                    "view_id": "v1",
                    "label": "End the fund",
                    "one_line": "It costs too much issuance.",
                    "holders": ["op", "dave"],
                    "best_for": {"post_number": 1, "quote": "It costs 20% of issuance."},
                    "best_against": {"post_number": 2, "quote": "It pays the core developers"},
                },
                {
                    "view_id": "v2",
                    "label": "Keep the fund",
                    "one_line": "It pays core developers.",
                    "holders": ["bob"],
                    "best_for": {"post_number": 2, "quote": "ending it is reckless"},
                    "best_against": None,
                },
            ],
            "common_ground": [{"text": "Core developers need paying.", "cites": [2, 4]}],
            "unresolved": [],
            "next": None,
        }
    )


def valid_issues() -> dict[str, Any]:
    return {
        "issues": [
            {
                "issue_id": f"i{index}",
                "question": f"Should the dev fund end (variant {index})?",
                "context": "The fund pays developers from issuance.",
                "stances": [{"stance_id": "s1", "label": "End it", "description": "Stop the fund."}, {"stance_id": "s2", "label": "Keep it", "description": "Keep paying developers."}],
                "mapping": [{"topic_id": 100, "view_id": "v1", "stance_id": "s1"}, {"topic_id": 100, "view_id": "v2", "stance_id": "s2"}],
            }
            for index in range(1, 4)
        ]
    }
