import json
import os
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from zforum.fsio import JsonFormatError, canonical_json_bytes, load_json, parse_json_bytes, write_bytes_atomic, write_json_atomic

json_values = st.recursive(
    st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False, allow_infinity=False) | st.text(),
    lambda children: st.lists(children) | st.dictionaries(st.text(), children),
    max_leaves=30,
)


@given(json_values)
def test_canonical_json_round_trips_and_is_a_fixed_point(value: object) -> None:
    encoded = canonical_json_bytes(value)
    decoded = parse_json_bytes(encoded, "test")
    assert decoded == value
    assert canonical_json_bytes(decoded) == encoded


def test_canonical_json_exact_encoding() -> None:
    assert canonical_json_bytes({"b": 1, "a": [True, None, "é"]}) == '{"a":[true,null,"é"],"b":1}'.encode()


def test_canonical_json_refuses_nan() -> None:
    with pytest.raises(ValueError, match="Out of range float values are not JSON compliant"):
        canonical_json_bytes(float("nan"))


def test_parse_rejects_duplicate_keys() -> None:
    with pytest.raises(JsonFormatError, match=r"^src: duplicate JSON key 'a'$"):
        parse_json_bytes(b'{"a":1,"a":2}', "src")


@pytest.mark.parametrize("constant", ["NaN", "Infinity", "-Infinity"])
def test_parse_rejects_nonstandard_constants(constant: str) -> None:
    with pytest.raises(JsonFormatError, match=rf"^src: non-standard JSON constant '{constant}'$"):
        parse_json_bytes(f'{{"a":{constant}}}'.encode(), "src")


def test_parse_rejects_invalid_utf8() -> None:
    with pytest.raises(JsonFormatError, match=r"^src: not valid UTF-8"):
        parse_json_bytes(b'{"a":"\xff"}', "src")


def test_parse_rejects_malformed_json() -> None:
    with pytest.raises(JsonFormatError, match=r"^src: malformed JSON"):
        parse_json_bytes(b'{"a":', "src")


def test_write_json_atomic_writes_canonical_bytes_with_newline(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "out.json"
    write_json_atomic(target, {"z": 1, "a": 2})
    assert target.read_bytes() == b'{"a":2,"z":1}\n'
    assert load_json(target) == {"a": 2, "z": 1}
    assert sorted(path.name for path in target.parent.iterdir()) == ["out.json"]


def test_write_replaces_existing_file(tmp_path: Path) -> None:
    target = tmp_path / "out.bin"
    write_bytes_atomic(target, b"first")
    write_bytes_atomic(target, b"second")
    assert target.read_bytes() == b"second"


def test_failed_write_leaves_original_and_no_temp_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "out.bin"
    write_bytes_atomic(target, b"original")

    def failing_replace(source: object, destination: object) -> None:
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(os, "replace", failing_replace)
    with pytest.raises(OSError, match="No space left on device"):
        write_bytes_atomic(target, b"new")
    assert target.read_bytes() == b"original"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["out.bin"]


def test_load_json_names_the_file(tmp_path: Path) -> None:
    target = tmp_path / "bad.json"
    target.write_bytes(b"[1,")
    with pytest.raises(JsonFormatError, match=rf"^{json.dumps(str(target))[1:-1]}: malformed JSON"):
        load_json(target)


def test_load_json_truncated_file_is_a_format_error(tmp_path: Path) -> None:
    target = tmp_path / "torn.json"
    full = canonical_json_bytes({"key": "value", "list": [1, 2, 3]})
    target.write_bytes(full[: len(full) // 2])
    with pytest.raises(JsonFormatError, match="malformed JSON"):
        load_json(target)


def test_load_json_missing_file_is_an_os_error(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_json(tmp_path / "absent.json")
    assert not os.path.exists(tmp_path / "absent.json")
