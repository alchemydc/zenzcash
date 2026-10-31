"""The append-only, hash-chained log of every receipt issued (D-22).

Entry i is a receipt whose payload carries seq = i and prev = the hash of entry i-1
(log_entry_hash), or GENESIS_PREVIOUS for entry 0. Anyone holding the log can check the
chain and see every check that was issued, including checks whose drafts were never posted.
That is what makes "re-check until the findings look good" visible.

The log holds receipts only: hashes and counts, never draft text or findings, so a draft that
was checked but never posted is not published.
"""

import fcntl
import os
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jsonschema
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from zforum.attest.receipt import GENESIS_PREVIOUS, Receipt, ReceiptRejected, decode_receipt, log_entry_hash
from zforum.fsio import load_json, write_json_atomic

LOG_FORMAT = "zforum-receipt-log-1"

_LOG_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["format", "entries"],
    "properties": {"format": {"const": LOG_FORMAT}, "entries": {"type": "array", "items": {"type": "string"}}},
}


class LogError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class TransparencyLog:
    entries: tuple[Receipt, ...]

    def __post_init__(self) -> None:
        for index, entry in enumerate(self.entries):
            expected_previous = GENESIS_PREVIOUS if index == 0 else log_entry_hash(self.entries[index - 1].payload_bytes).value
            if entry.payload["seq"] != index:
                raise LogError(f"log entry {index} has seq {entry.payload['seq']}")
            if entry.payload["prev"] != expected_previous:
                raise LogError(f"log entry {index} has prev {entry.payload['prev']}, expected {expected_previous}")

    def next_seq(self) -> int:
        return len(self.entries)

    def head(self) -> str:
        return GENESIS_PREVIOUS if not self.entries else log_entry_hash(self.entries[-1].payload_bytes).value

    def appended(self, receipt: Receipt) -> "TransparencyLog":
        return TransparencyLog((*self.entries, receipt))

    def contains(self, receipt: Receipt) -> bool:
        seq: int = receipt.payload["seq"]
        return seq < len(self.entries) and self.entries[seq].payload_bytes == receipt.payload_bytes

    def wire(self) -> dict[str, object]:
        return {"format": LOG_FORMAT, "entries": [entry.wire() for entry in self.entries]}


def load_log(path: Path, keyring: dict[str, Ed25519PublicKey]) -> TransparencyLog:
    if not path.exists():
        return TransparencyLog(())
    document = load_json(path)
    errors = list(jsonschema.Draft202012Validator(_LOG_SCHEMA).iter_errors(document))
    if errors:
        raise LogError(f"{path}: {errors[0].message}")
    assert isinstance(document, dict)
    receipts = []
    for index, wire in enumerate(document["entries"]):
        try:
            receipts.append(decode_receipt(wire, keyring))
        except ReceiptRejected as error:
            raise LogError(f"{path}: entry {index}: {error}") from error
    return TransparencyLog(tuple(receipts))


def save_log(path: Path, log: TransparencyLog) -> None:
    write_json_atomic(path, log.wire())


@contextmanager
def exclusive_log(path: Path) -> Iterator[None]:
    """Holds an exclusive lock on the log for a read-append-write cycle, so two issuers can
    never both append at the same seq and fork the chain."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path.with_name(path.name + ".lock"), os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)
