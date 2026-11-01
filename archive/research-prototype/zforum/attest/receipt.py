"""The zforum check receipt, format zfr1 (specified in SPEC.md section 12).

A receipt is a signed statement by the zforum checker: "at issued_at, check_draft (this
prompt, this model) read exactly this draft against exactly this thread snapshot and found
these things." It is a findings receipt (D-22), never a clearance: it is issued whatever
the findings are.

Wire form, appended as the last line of a forum post after a blank line:

    zforum-receipt: zfr1.<base64url(payload)>.<base64url(signature)>

payload   canonical JSON (sorted keys, no whitespace, UTF-8) of the fields in PAYLOAD_FIELDS
signature Ed25519 over SIGNING_DOMAIN + payload
"""

import base64
import binascii
import hashlib
import re
from dataclasses import dataclass
from typing import Any

import jsonschema
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from zforum.attest.draft import RECEIPT_LINE_PREFIX, DraftError, DraftText
from zforum.domain import Sha256Hex
from zforum.fsio import JsonFormatError, canonical_json_bytes, parse_json_bytes

RECEIPT_VERSION = 1
RECEIPT_PREFIX = "zfr1"
SIGNING_DOMAIN = b"zforum-receipt-v1\x00"
LOG_DOMAIN = b"zforum-log-v1\x00"
KEY_ID_HEX_CHARS = 16
GENESIS_PREVIOUS = "0" * 64
POST_SEPARATOR = "\n\n"
COUNT_FIELDS = ("repetitions", "contradicted", "supported", "unsourced", "tone", "novel_claims")
# The largest integer every JSON implementation represents exactly (IEEE-754 doubles), so
# verifiers in any language decode integer fields identically.
MAX_PAYLOAD_INTEGER = 2**53 - 1
_RECEIPT_PATTERN = re.compile(r"zfr1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)")
_HEX64 = {"type": "string", "pattern": "^[0-9a-f]{64}$"}

PAYLOAD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["v", "kid", "seq", "prev", "issued_at", "topic_id", "draft_sha256", "draft_chars", "corpus_sha256", "checker", "findings_sha256", "counts"],
    "properties": {
        "v": {"const": RECEIPT_VERSION},
        "kid": {"type": "string", "pattern": f"^[0-9a-f]{{{KEY_ID_HEX_CHARS}}}$"},
        "seq": {"type": "integer", "minimum": 0, "maximum": MAX_PAYLOAD_INTEGER},
        "prev": _HEX64,
        "issued_at": {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"},
        "topic_id": {"type": "integer", "minimum": 1, "maximum": MAX_PAYLOAD_INTEGER},
        "draft_sha256": _HEX64,
        "draft_chars": {"type": "integer", "minimum": 1, "maximum": MAX_PAYLOAD_INTEGER},
        "corpus_sha256": _HEX64,
        "checker": {
            "type": "object",
            "additionalProperties": False,
            "required": ["task", "prompt_sha256", "backend", "model"],
            "properties": {
                "task": {"const": "check_draft"},
                "prompt_sha256": _HEX64,
                "backend": {"enum": ["subagent", "anthropic-api"]},
                "model": {"type": "string", "minLength": 1, "maxLength": 100},
            },
        },
        "findings_sha256": _HEX64,
        "counts": {
            "type": "object",
            "additionalProperties": False,
            "required": list(COUNT_FIELDS),
            "properties": {field: {"type": "integer", "minimum": 0, "maximum": MAX_PAYLOAD_INTEGER} for field in COUNT_FIELDS},
        },
    },
}


class ReceiptRejected(ValueError):
    """A receipt or post failed verification. The message names the failed check."""


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str, what: str) -> bytes:
    """Strict unpadded base64url: exactly the encoding b64url_encode emits, nothing else."""
    if not re.fullmatch(r"[A-Za-z0-9_-]*", text) or len(text) % 4 == 1:
        raise ReceiptRejected(f"{what} is not unpadded base64url")
    try:
        data = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError) as error:
        raise ReceiptRejected(f"{what} is not unpadded base64url ({error})") from error
    if b64url_encode(data) != text:
        raise ReceiptRejected(f"{what} is not in canonical base64url form")
    return data


def raw_public_key(public_key: Ed25519PublicKey) -> bytes:
    return public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)


def key_id(public_key: Ed25519PublicKey) -> str:
    raw = raw_public_key(public_key)
    return hashlib.sha256(raw).hexdigest()[:KEY_ID_HEX_CHARS]


def log_entry_hash(payload_bytes: bytes) -> Sha256Hex:
    return Sha256Hex(hashlib.sha256(LOG_DOMAIN + payload_bytes).hexdigest())


def counts_from_findings(findings: dict[str, Any]) -> dict[str, int]:
    factual = findings["factual"]
    return {
        "repetitions": len(findings["repetitions"]),
        "contradicted": sum(1 for finding in factual if finding["assessment"] == "contradicted-in-thread"),
        "supported": sum(1 for finding in factual if finding["assessment"] == "supported-in-thread"),
        "unsourced": sum(1 for finding in factual if finding["assessment"] == "unsourced"),
        "tone": len(findings["tone"]),
        "novel_claims": len(findings["novel_claims"]),
    }


def findings_hash(findings: dict[str, Any]) -> Sha256Hex:
    return Sha256Hex(hashlib.sha256(canonical_json_bytes(findings)).hexdigest())


@dataclass(frozen=True, slots=True)
class Receipt:
    payload: dict[str, Any]
    payload_bytes: bytes
    signature: bytes

    def wire(self) -> str:
        return f"{RECEIPT_PREFIX}.{b64url_encode(self.payload_bytes)}.{b64url_encode(self.signature)}"

    def receipt_line(self) -> str:
        return RECEIPT_LINE_PREFIX + self.wire()


def _reject_non_portable_values(value: object, path: str) -> None:
    """Floats (even 1.0) and strings with lone surrogates decode differently, or not at all,
    across JSON implementations; a payload must contain neither."""
    if isinstance(value, float):
        raise ReceiptRejected(f"payload field {path}: {value!r} is not an integer")
    if isinstance(value, str) and any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise ReceiptRejected(f"payload field {path}: contains a lone surrogate")
    if isinstance(value, dict):
        for key, child in value.items():
            _reject_non_portable_values(key, f"{path}/{key}" if path != "<root>" else key)
            _reject_non_portable_values(child, f"{path}/{key}" if path != "<root>" else key)
    if isinstance(value, list):
        for index, child in enumerate(value):
            _reject_non_portable_values(child, f"{path}/{index}")


def _check_payload(payload: object) -> dict[str, Any]:
    _reject_non_portable_values(payload, "<root>")
    errors = sorted(jsonschema.Draft202012Validator(PAYLOAD_SCHEMA).iter_errors(payload), key=lambda error: [str(part) for part in error.absolute_path])
    if errors:
        first = errors[0]
        raise ReceiptRejected(f"payload field {'/'.join(str(part) for part in first.absolute_path) or '<root>'}: {first.message}")
    assert isinstance(payload, dict)
    return payload


def sign_payload(payload: dict[str, Any], private_key: Ed25519PrivateKey) -> Receipt:
    checked = _check_payload(payload)
    if checked["kid"] != key_id(private_key.public_key()):
        raise ValueError(f"payload kid {checked['kid']} does not match the signing key {key_id(private_key.public_key())}")
    payload_bytes = canonical_json_bytes(checked)
    return Receipt(payload=checked, payload_bytes=payload_bytes, signature=private_key.sign(SIGNING_DOMAIN + payload_bytes))


def decode_receipt(wire: str, keyring: dict[str, Ed25519PublicKey]) -> Receipt:
    match = _RECEIPT_PATTERN.fullmatch(wire)
    if match is None:
        raise ReceiptRejected("receipt does not have the form zfr1.<payload>.<signature>")
    payload_bytes = b64url_decode(match.group(1), "payload")
    signature = b64url_decode(match.group(2), "signature")
    if len(signature) != 64:
        raise ReceiptRejected(f"signature is {len(signature)} bytes; Ed25519 signatures are 64")
    try:
        parsed = parse_json_bytes(payload_bytes, "receipt payload")
    except JsonFormatError as error:
        raise ReceiptRejected(str(error)) from error
    if not isinstance(parsed, dict) or not isinstance(parsed.get("kid"), str):
        raise ReceiptRejected("payload is not an object with a kid")
    public_key = keyring.get(parsed["kid"])
    if public_key is None:
        raise ReceiptRejected(f"receipt is signed by unknown key {parsed['kid']!r}")
    try:
        public_key.verify(signature, SIGNING_DOMAIN + payload_bytes)
    except InvalidSignature as error:
        raise ReceiptRejected("signature does not verify") from error
    payload = _check_payload(parsed)
    if canonical_json_bytes(payload) != payload_bytes:
        raise ReceiptRejected("payload is not canonical JSON")
    return Receipt(payload=payload, payload_bytes=payload_bytes, signature=signature)


def compose_post(draft: DraftText, receipt: Receipt) -> str:
    if receipt.payload["draft_sha256"] != draft.sha256().value:
        raise ValueError("receipt was issued for a different draft")
    return draft.value + POST_SEPARATOR + receipt.receipt_line()


@dataclass(frozen=True, slots=True)
class VerifiedPost:
    draft: DraftText
    receipt: Receipt


def verify_post(post_text: str, keyring: dict[str, Ed25519PublicKey]) -> VerifiedPost:
    """Checks a forum post that ends with a receipt line: the receipt is well formed and
    signed by a known key, and the post's body is exactly the draft the receipt covers."""
    text = post_text.replace("\r\n", "\n").strip()
    before, _, last_line = text.rpartition("\n")
    if not last_line.startswith(RECEIPT_LINE_PREFIX):
        raise ReceiptRejected("the post's last line is not a zforum-receipt line")
    body = before.removesuffix("\n")
    if body == before or not body or body != body.rstrip():
        raise ReceiptRejected("the receipt line must follow the post body after exactly one blank line")
    try:
        draft = DraftText(body)
    except DraftError as error:
        raise ReceiptRejected(f"the post body is not a valid draft: {error}") from error
    receipt = decode_receipt(last_line[len(RECEIPT_LINE_PREFIX) :], keyring)
    if receipt.payload["draft_sha256"] != draft.sha256().value:
        raise ReceiptRejected("the post body differs from the draft the receipt covers")
    if receipt.payload["draft_chars"] != len(draft.value):
        raise ReceiptRejected("the receipt's draft_chars does not match the post body")
    return VerifiedPost(draft=draft, receipt=receipt)
