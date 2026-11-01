from datetime import datetime, timedelta, timezone

import pytest
from hypothesis import given
from hypothesis import strategies as st

from zforum.domain import CategoryId, PostId, PostNumber, Sha256Hex, TopicId, Username, UtcTimestamp

ID_TYPES = [TopicId, PostId, PostNumber, CategoryId]


@pytest.mark.parametrize("id_type", ID_TYPES)
@given(value=st.integers(min_value=1))
def test_ids_accept_every_positive_int(id_type: type[TopicId], value: int) -> None:
    assert id_type(value).value == value


@pytest.mark.parametrize("id_type", ID_TYPES)
@given(value=st.integers(max_value=0))
def test_ids_reject_every_non_positive_int(id_type: type[TopicId], value: int) -> None:
    with pytest.raises(ValueError, match=rf"^{id_type.__name__} must be >= 1, got {value}$"):
        id_type(value)


@pytest.mark.parametrize("bad", [True, 1.0, "1", None])
def test_ids_reject_non_int(bad: object) -> None:
    with pytest.raises(TypeError, match=rf"^TopicId must be an int, got {type(bad).__name__} "):
        TopicId(bad)  # type: ignore[arg-type]  # deliberately wrong type to prove the runtime check


def test_ids_order_and_compare_by_value() -> None:
    assert PostNumber(2) > PostNumber(1)
    assert sorted([TopicId(3), TopicId(1)]) == [TopicId(1), TopicId(3)]


@pytest.mark.parametrize("name", ["alice", "Bob_2", "a.b-c", "x" * 60])
def test_username_accepts_discourse_usernames(name: str) -> None:
    assert Username(name).value == name


@pytest.mark.parametrize("name", ["", "x" * 61, "has space", "ünïcode", "a/b"])
def test_username_rejects_others(name: str) -> None:
    with pytest.raises(ValueError, match="^invalid Discourse username "):
        Username(name)


def test_sha256_hex() -> None:
    digest = "ab" * 32
    assert Sha256Hex(digest).value == digest
    for bad in ["AB" * 32, "ab" * 31, "zz" * 32]:
        with pytest.raises(ValueError, match="^not a lowercase hex SHA-256 digest: "):
            Sha256Hex(bad)


def test_parse_discourse_timestamp_exact() -> None:
    parsed = UtcTimestamp.parse_discourse("2026-10-31T12:01:02.345Z")
    assert parsed.value == datetime(2026, 10, 31, 12, 1, 2, 345000, tzinfo=timezone.utc)
    assert parsed.iso() == "2026-10-31T12:01:02Z"
    assert UtcTimestamp.parse_discourse("2026-10-31T12:01:02Z").iso() == "2026-10-31T12:01:02Z"


@pytest.mark.parametrize("text", ["2026-10-31T12:01:02+00:00", "2026-10-31 12:01:02Z", "2026-10-31", ""])
def test_parse_discourse_timestamp_rejects_other_shapes(text: str) -> None:
    with pytest.raises(ValueError, match="^not a Discourse UTC timestamp: "):
        UtcTimestamp.parse_discourse(text)


def test_utc_timestamp_rejects_naive_and_offset_datetimes() -> None:
    with pytest.raises(ValueError, match="^UtcTimestamp must be UTC"):
        UtcTimestamp(datetime(2026, 1, 1))
    with pytest.raises(ValueError, match="^UtcTimestamp must be UTC"):
        UtcTimestamp(datetime(2026, 1, 1, tzinfo=timezone(timedelta(hours=2))))


@given(st.datetimes(min_value=datetime(1970, 1, 1), max_value=datetime(9999, 1, 1), timezones=st.just(timezone.utc)))
def test_iso_round_trips_at_second_precision(moment: datetime) -> None:
    timestamp = UtcTimestamp(moment)
    reparsed = UtcTimestamp.parse_discourse(timestamp.iso())
    assert reparsed.value == moment.replace(microsecond=0)
