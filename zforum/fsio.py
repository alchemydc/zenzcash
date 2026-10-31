"""The single chokepoint for persistent reads and writes.

Write policy: every write goes to a temp file in the destination directory, is fsynced,
renamed over the destination, and then the directory is fsynced. Readers therefore see
either the old file or the new one, never a torn write.

Read policy: JSON is parsed strictly. Duplicate keys and the non-standard constants
NaN/Infinity are rejected, and so is non-UTF-8 input.
"""

import json
import os
import tempfile
from pathlib import Path


class JsonFormatError(ValueError):
    pass


def write_bytes_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise
    directory_descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)


def canonical_json_bytes(value: object) -> bytes:
    """The one JSON encoding zforum emits for data files: sorted keys, no insignificant
    whitespace, UTF-8, and no NaN/Infinity (which are not JSON)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode(
        "utf-8"
    )


def write_json_atomic(path: Path, value: object) -> None:
    write_bytes_atomic(path, canonical_json_bytes(value) + b"\n")


def _reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise JsonFormatError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _reject_constant(name: str) -> object:
    raise JsonFormatError(f"non-standard JSON constant {name!r}")


def parse_json_bytes(data: bytes, source: str) -> object:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise JsonFormatError(f"{source}: not valid UTF-8 ({error})") from error
    try:
        return json.loads(text, object_pairs_hook=_reject_duplicate_keys, parse_constant=_reject_constant)
    except JsonFormatError as error:
        raise JsonFormatError(f"{source}: {error}") from error
    except json.JSONDecodeError as error:
        raise JsonFormatError(f"{source}: malformed JSON ({error})") from error


def load_json(path: Path) -> object:
    return parse_json_bytes(path.read_bytes(), str(path))
