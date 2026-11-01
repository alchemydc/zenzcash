"""Issuing a receipt for an accepted check_draft result."""

from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from zforum.attest.draft import DraftText
from zforum.attest.log import exclusive_log, load_log, save_log
from zforum.attest.receipt import RECEIPT_VERSION, Receipt, compose_post, counts_from_findings, findings_hash, key_id, sign_payload
from zforum.domain import UtcTimestamp
from zforum.fsio import write_json_atomic
from zforum.intel.jobs import AcceptedResult, Job, input_hash

FINDINGS_FORMAT = "zforum-findings-1"


@dataclass(frozen=True, slots=True)
class IssuedReceipt:
    receipt: Receipt
    post_text: str
    findings_path: Path


def issue_receipt(
    job: Job,
    result: AcceptedResult,
    private_key: Ed25519PrivateKey,
    keyring: dict[str, Ed25519PublicKey],
    log_path: Path,
    findings_dir: Path,
    now: UtcTimestamp,
) -> IssuedReceipt:
    if job.task.name != "check_draft" or result.task != "check_draft" or result.subject != job.subject:
        raise ValueError(f"receipts are issued for accepted check_draft results; got job {job.task.name}/{job.subject}, result {result.task}/{result.subject}")
    if result.input_sha256 != input_hash(job.input).value:
        raise ValueError(f"result {result.subject} was accepted against a different input")
    kid = key_id(private_key.public_key())
    if kid not in keyring:
        raise ValueError(f"signing key {kid} is not in the published keyring")
    draft = DraftText(job.input["draft"])
    findings_sha = findings_hash(result.output).value
    with exclusive_log(log_path):
        log = load_log(log_path, keyring)
        receipt = sign_payload(
            {
                "v": RECEIPT_VERSION,
                "kid": kid,
                "seq": log.next_seq(),
                "prev": log.head(),
                "issued_at": now.iso(),
                "topic_id": job.input["topic"]["id"],
                "draft_sha256": draft.sha256().value,
                "draft_chars": len(draft.value),
                "corpus_sha256": result.input_sha256,
                "checker": {"task": "check_draft", "prompt_sha256": result.prompt_sha256, "backend": result.backend, "model": result.model},
                "findings_sha256": findings_sha,
                "counts": counts_from_findings(result.output),
            },
            private_key,
        )
        findings_path = findings_dir / f"{findings_sha}.json"
        write_json_atomic(findings_path, {"format": FINDINGS_FORMAT, "topic_id": job.input["topic"]["id"], "findings": result.output})
        save_log(log_path, log.appended(receipt))
    return IssuedReceipt(receipt=receipt, post_text=compose_post(draft, receipt), findings_path=findings_path)
