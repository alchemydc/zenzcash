"""Job subject names: the one place that decides what a job or result is called."""

from zforum.attest.draft import DraftText
from zforum.domain import TopicId
from zforum.thread import Snapshot


def thread_subject(topic_id: TopicId) -> str:
    return f"t{topic_id.value}"


def draft_subject(topic_id: TopicId, draft: DraftText) -> str:
    return f"t{topic_id.value}-{draft.sha256().value[:16]}"


def digest_subject(snapshot: Snapshot) -> str:
    return f"forum-{snapshot.path.name.lower()}"


def issues_subject(snapshot: Snapshot) -> str:
    return f"issues-{snapshot.path.name.lower()}"
