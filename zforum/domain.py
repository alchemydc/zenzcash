"""Validated value types. Construction is the only way in, and it fails loudly."""

import re
from dataclasses import dataclass
from datetime import datetime, timezone


def _require_int(value: object, type_name: str, minimum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{type_name} must be an int, got {type(value).__name__} {value!r}")
    if value < minimum:
        raise ValueError(f"{type_name} must be >= {minimum}, got {value}")
    return value


@dataclass(frozen=True, slots=True, order=True)
class TopicId:
    value: int

    def __post_init__(self) -> None:
        _require_int(self.value, "TopicId", 1)


@dataclass(frozen=True, slots=True, order=True)
class PostId:
    value: int

    def __post_init__(self) -> None:
        _require_int(self.value, "PostId", 1)


@dataclass(frozen=True, slots=True, order=True)
class PostNumber:
    """A post's 1-based position within its topic, as Discourse numbers it. Deleted posts
    leave gaps, so post numbers are identities, not indexes."""

    value: int

    def __post_init__(self) -> None:
        _require_int(self.value, "PostNumber", 1)


@dataclass(frozen=True, slots=True, order=True)
class CategoryId:
    value: int

    def __post_init__(self) -> None:
        _require_int(self.value, "CategoryId", 1)


# Discourse usernames: letters, digits, underscore, dot, hyphen (the forum does not enable
# unicode usernames). A username outside this set means the assumption is wrong and must be
# revisited, so it is an error rather than something to accept quietly.
_USERNAME_PATTERN = re.compile(r"[A-Za-z0-9_.\-]{1,60}")


@dataclass(frozen=True, slots=True, order=True)
class Username:
    value: str

    def __post_init__(self) -> None:
        if not isinstance(self.value, str) or not _USERNAME_PATTERN.fullmatch(self.value):
            raise ValueError(f"invalid Discourse username {self.value!r}")


_SHA256_HEX_PATTERN = re.compile(r"[0-9a-f]{64}")


@dataclass(frozen=True, slots=True)
class Sha256Hex:
    value: str

    def __post_init__(self) -> None:
        if not isinstance(self.value, str) or not _SHA256_HEX_PATTERN.fullmatch(self.value):
            raise ValueError(f"not a lowercase hex SHA-256 digest: {self.value!r}")


@dataclass(frozen=True, slots=True, order=True)
class UtcTimestamp:
    """A point in time, always timezone-aware UTC."""

    value: datetime

    def __post_init__(self) -> None:
        if not isinstance(self.value, datetime):
            raise TypeError(f"UtcTimestamp needs a datetime, got {type(self.value).__name__}")
        if self.value.utcoffset() != timezone.utc.utcoffset(None):
            raise ValueError(f"UtcTimestamp must be UTC, got {self.value.isoformat()}")

    @staticmethod
    def parse_discourse(text: str) -> "UtcTimestamp":
        """Discourse emits ISO-8601 with milliseconds and a Z suffix: 2026-10-31T12:01:02.345Z."""
        if not isinstance(text, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z", text):
            raise ValueError(f"not a Discourse UTC timestamp: {text!r}")
        return UtcTimestamp(datetime.fromisoformat(text.replace("Z", "+00:00")))

    def iso(self) -> str:
        """Second precision, Z suffix: the one encoding zforum emits."""
        return self.value.strftime("%Y-%m-%dT%H:%M:%SZ")
