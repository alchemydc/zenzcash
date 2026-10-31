import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from hypothesis import given
from hypothesis import strategies as st

from tests.test_draft import draft_texts
from zforum.attest.draft import DraftText
from zforum.attest.keys import KeyringError, generate_issuer_key, load_keyring, load_private_key
from zforum.attest.log import LogError, TransparencyLog, load_log, save_log
from zforum.attest.receipt import (
    GENESIS_PREVIOUS,
    ReceiptRejected,
    b64url_decode,
    b64url_encode,
    compose_post,
    counts_from_findings,
    decode_receipt,
    key_id,
    log_entry_hash,
    sign_payload,
    verify_post,
)
from zforum.domain import UtcTimestamp
from zforum.fsio import canonical_json_bytes, load_json

VECTORS_PATH = Path(__file__).parent / "vectors" / "receipt-v1.json"
_loaded_vectors = load_json(VECTORS_PATH)
assert isinstance(_loaded_vectors, dict)
VECTORS: dict[str, Any] = _loaded_vectors
TEST_KEY = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(VECTORS["secret_key_hex"]))
KEYRING = {key_id(TEST_KEY.public_key()): TEST_KEY.public_key()}


def payload(**overrides: Any) -> dict[str, Any]:
    return {**VECTORS["payload"], **overrides}


# --- base64url --------------------------------------------------------------------------


@given(st.binary(max_size=200))
def test_b64url_round_trips(data: bytes) -> None:
    assert b64url_decode(b64url_encode(data), "x") == data


@pytest.mark.parametrize("text", ["YQ=", "YR", "a+b/", "Y", "Y Q"])
def test_b64url_rejects_non_canonical_forms(text: str) -> None:
    with pytest.raises(ReceiptRejected):
        b64url_decode(text, "field")


# --- signing and verification against the fixed vectors ---------------------------------


def test_signing_reproduces_the_vector_exactly() -> None:
    receipt = sign_payload(payload(), TEST_KEY)
    assert receipt.payload_bytes.decode() == VECTORS["payload_canonical"]
    assert b64url_encode(receipt.signature) == VECTORS["signature_b64url"]
    assert receipt.wire() == VECTORS["wire"]
    assert compose_post(DraftText(VECTORS["draft_normalized"]), receipt) == VECTORS["post"]
    assert key_id(TEST_KEY.public_key()) == VECTORS["kid"]


def test_vector_post_verifies() -> None:
    verified = verify_post(VECTORS["post"], KEYRING)
    assert verified.draft.value == VECTORS["draft_normalized"]
    assert verified.receipt.payload == VECTORS["payload"]


def test_vector_post_verifies_with_crlf_and_surrounding_whitespace() -> None:
    assert verify_post("\n " + VECTORS["post"].replace("\n", "\r\n") + "\n", KEYRING).receipt.payload == VECTORS["payload"]


@pytest.mark.parametrize("case", VECTORS["rejections"], ids=lambda case: case["name"])
def test_rejection_vectors(case: dict[str, str]) -> None:
    with pytest.raises(ReceiptRejected) as raised:
        verify_post(case["post"], KEYRING)
    assert str(raised.value) == case["reason"]


def test_payload_schema_violations_are_named() -> None:
    with pytest.raises(ReceiptRejected, match=r"^payload field counts: 'tone' is a required property$"):
        counts = dict(VECTORS["payload"]["counts"])
        del counts["tone"]
        sign_payload(payload(counts=counts), TEST_KEY)
    with pytest.raises(ReceiptRejected, match=r"^payload field <root>: Additional properties are not allowed"):
        sign_payload(payload(extra=1), TEST_KEY)


def test_signing_with_a_key_that_does_not_match_kid_fails() -> None:
    other = Ed25519PrivateKey.from_private_bytes(bytes(range(32)))
    with pytest.raises(ValueError, match=r"^payload kid 21fe31dfa154a261 does not match the signing key "):
        sign_payload(payload(), other)


def test_signed_but_invalid_payload_is_rejected_after_signature_check() -> None:
    bad_bytes = canonical_json_bytes(payload(v=2))
    signature = TEST_KEY.sign(b"zforum-receipt-v1\x00" + bad_bytes)
    with pytest.raises(ReceiptRejected, match=r"^payload field v: 1 was expected$"):
        decode_receipt(f"zfr1.{b64url_encode(bad_bytes)}.{b64url_encode(signature)}", KEYRING)


def test_signature_over_another_domain_does_not_verify() -> None:
    receipt = sign_payload(payload(), TEST_KEY)
    wrong_domain = TEST_KEY.sign(receipt.payload_bytes)
    with pytest.raises(ReceiptRejected, match="^signature does not verify$"):
        decode_receipt(f"zfr1.{b64url_encode(receipt.payload_bytes)}.{b64url_encode(wrong_domain)}", KEYRING)


@given(draft_texts, st.integers(min_value=0, max_value=10**6), st.integers(min_value=1, max_value=10**7))
def test_compose_then_verify_round_trips(text: str, seq: int, topic_id: int) -> None:
    draft = DraftText.parse(text)
    receipt = sign_payload(payload(seq=seq, topic_id=topic_id, draft_sha256=draft.sha256().value, draft_chars=len(draft.value)), TEST_KEY)
    verified = verify_post(compose_post(draft, receipt), KEYRING)
    assert verified.draft == draft
    assert verified.receipt.payload_bytes == receipt.payload_bytes


@given(draft_texts, st.text(min_size=1, max_size=5).filter(lambda extra: extra.strip() != "" and "\r" not in extra))
def test_any_edit_to_the_body_is_detected(text: str, extra: str) -> None:
    draft = DraftText.parse(text)
    receipt = sign_payload(payload(draft_sha256=draft.sha256().value, draft_chars=len(draft.value)), TEST_KEY)
    tampered = extra + compose_post(draft, receipt)
    with pytest.raises(ReceiptRejected):
        verify_post(tampered, KEYRING)


def test_compose_refuses_a_receipt_for_another_draft() -> None:
    with pytest.raises(ValueError, match="^receipt was issued for a different draft$"):
        compose_post(DraftText("something else"), sign_payload(payload(), TEST_KEY))


def test_counts_from_findings() -> None:
    findings = {
        "repetitions": [{}, {}],
        "factual": [{"assessment": "contradicted-in-thread"}, {"assessment": "unsourced"}, {"assessment": "unsourced"}, {"assessment": "supported-in-thread"}],
        "tone": [{}],
        "novel_claims": [],
    }
    assert counts_from_findings(findings) == {"repetitions": 2, "contradicted": 1, "supported": 1, "unsourced": 2, "tone": 1, "novel_claims": 0}


# --- transparency log -------------------------------------------------------------------


def test_log_vector_chain() -> None:
    receipts = tuple(decode_receipt(wire, KEYRING) for wire in VECTORS["log"]["entries"])
    log = TransparencyLog(receipts)
    assert log.head() == VECTORS["log"]["head"]
    assert log_entry_hash(receipts[0].payload_bytes).value == VECTORS["log"]["entry0_hash"]
    assert log.next_seq() == 2
    assert log.contains(receipts[1])


def test_empty_log_head_is_genesis(tmp_path: Path) -> None:
    log = load_log(tmp_path / "absent.json", KEYRING)
    assert log.entries == ()
    assert log.head() == GENESIS_PREVIOUS


def test_log_rejects_wrong_seq_and_broken_chain() -> None:
    first = sign_payload(payload(), TEST_KEY)
    with pytest.raises(LogError, match=r"^log entry 0 has seq 1$"):
        TransparencyLog((sign_payload(payload(seq=1), TEST_KEY),))
    broken = sign_payload(payload(seq=1, prev="d" * 64), TEST_KEY)
    with pytest.raises(LogError, match=rf"^log entry 1 has prev {'d' * 64}, expected {log_entry_hash(first.payload_bytes).value}$"):
        TransparencyLog((first, broken))


def test_log_save_load_round_trip_and_contains(tmp_path: Path) -> None:
    first = sign_payload(payload(), TEST_KEY)
    second = sign_payload(payload(seq=1, prev=log_entry_hash(first.payload_bytes).value), TEST_KEY)
    path = tmp_path / "log.json"
    save_log(path, TransparencyLog((first,)).appended(second))
    loaded = load_log(path, KEYRING)
    assert [entry.payload_bytes for entry in loaded.entries] == [first.payload_bytes, second.payload_bytes]
    outsider = sign_payload(payload(seq=1, prev=log_entry_hash(first.payload_bytes).value, topic_id=1), TEST_KEY)
    assert not loaded.contains(outsider)
    assert not loaded.contains(sign_payload(payload(seq=5), TEST_KEY))


def test_log_with_tampered_entry_fails_to_load(tmp_path: Path) -> None:
    path = tmp_path / "log.json"
    path.write_text('{"entries":["zfr1.AAAA.BBBB"],"format":"zforum-receipt-log-1"}')
    with pytest.raises(LogError, match=r"entry 0: signature is 3 bytes; Ed25519 signatures are 64$"):
        load_log(path, KEYRING)


# --- keys -------------------------------------------------------------------------------

NOW = UtcTimestamp(datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc))


def test_keygen_creates_private_key_0600_and_publishes_the_public_key(tmp_path: Path) -> None:
    private_path, keyring_path = tmp_path / "keys" / "issuer.pem", tmp_path / "keyring.json"
    kid = generate_issuer_key(private_path, keyring_path, NOW)
    assert stat.S_IMODE(private_path.stat().st_mode) == 0o600
    private_key = load_private_key(private_path)
    keyring = load_keyring(keyring_path)
    assert list(keyring) == [kid]
    assert key_id(private_key.public_key()) == kid
    assert load_json(keyring_path) == {"format": "zforum-keyring-1", "keys": [{"kid": kid, "public_key": b64url_encode(keyring[kid].public_bytes_raw()), "created_at": "2026-10-31T12:00:00Z"}]}


def test_keygen_refuses_to_overwrite(tmp_path: Path) -> None:
    private_path, keyring_path = tmp_path / "issuer.pem", tmp_path / "keyring.json"
    generate_issuer_key(private_path, keyring_path, NOW)
    with pytest.raises(FileExistsError):
        generate_issuer_key(private_path, keyring_path, NOW)


def test_private_key_readable_by_others_is_refused(tmp_path: Path) -> None:
    private_path = tmp_path / "issuer.pem"
    generate_issuer_key(private_path, tmp_path / "keyring.json", NOW)
    os.chmod(private_path, 0o644)
    with pytest.raises(KeyringError, match=r"private key is accessible to group or others \(mode -rw-r--r--\); chmod 600 it$"):
        load_private_key(private_path)


def test_keyring_with_mismatched_kid_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "keyring.json"
    path.write_text('{"format":"zforum-keyring-1","keys":[{"kid":"0000000000000000","public_key":"' + VECTORS["public_key_b64url"] + '","created_at":"x"}]}')
    with pytest.raises(KeyringError, match=r"kid 0000000000000000 does not match its public key \(21fe31dfa154a261\)$"):
        load_keyring(path)


def test_test_key_public_half_matches_vector() -> None:
    public: Ed25519PublicKey = TEST_KEY.public_key()
    assert b64url_encode(public.public_bytes_raw()) == VECTORS["public_key_b64url"]
