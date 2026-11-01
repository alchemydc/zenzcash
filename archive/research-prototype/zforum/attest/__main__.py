"""Command line for check receipts.

    python -m zforum.attest keygen               # create the issuer key and publish its public half
    python -m zforum.attest issue JOB_DIR        # sign a receipt for an accepted check_draft job
    python -m zforum.attest verify POST_FILE     # verify a post that ends with a receipt line
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

from zforum.attest.issue import issue_receipt
from zforum.attest.keys import generate_issuer_key, load_keyring, load_private_key
from zforum.attest.log import load_log
from zforum.attest.paths import FINDINGS_DIR, KEYRING_PATH, LOG_PATH, PRIVATE_KEY_PATH
from zforum.attest.receipt import ReceiptRejected, verify_post
from zforum.domain import UtcTimestamp
from zforum.fsio import write_bytes_atomic
from zforum.intel.jobs import load_job, load_result


def now() -> UtcTimestamp:
    return UtcTimestamp(datetime.now(timezone.utc))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m zforum.attest", description="Issue and verify zforum check receipts.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("keygen", help="create the issuer signing key")
    issue_parser = commands.add_parser("issue", help="sign a receipt for an accepted check_draft job")
    issue_parser.add_argument("job", type=Path)
    verify_parser = commands.add_parser("verify", help="verify a post ending in a receipt line")
    verify_parser.add_argument("post", type=Path)
    arguments = parser.parse_args(argv)

    if arguments.command == "keygen":
        kid = generate_issuer_key(PRIVATE_KEY_PATH, KEYRING_PATH, now())
        print(f"created issuer key {kid}; private key at {PRIVATE_KEY_PATH}, public key added to {KEYRING_PATH}")
        return 0
    keyring = load_keyring(KEYRING_PATH)
    if arguments.command == "issue":
        job = load_job(arguments.job)
        result = load_result("check_draft", job.subject, job.input)
        issued = issue_receipt(job, result, load_private_key(PRIVATE_KEY_PATH), keyring, LOG_PATH, FINDINGS_DIR, now())
        post_path = job.directory / "post.md"
        write_bytes_atomic(post_path, issued.post_text.encode("utf-8"))
        print(f"receipt seq {issued.receipt.payload['seq']} issued; post with receipt written to {post_path}")
        print(issued.receipt.receipt_line())
        return 0
    if arguments.command == "verify":
        try:
            verified = verify_post(arguments.post.read_text(encoding="utf-8"), keyring)
        except ReceiptRejected as error:
            print(f"REJECTED: {error}", file=sys.stderr)
            return 1
        payload = verified.receipt.payload
        if not load_log(LOG_PATH, keyring).contains(verified.receipt):
            print(f"REJECTED: signature valid, but receipt seq {payload['seq']} is not in the published log", file=sys.stderr)
            return 1
        print(f"VALID: checked {payload['issued_at']} for t/{payload['topic_id']} by {payload['checker']['model']} ({payload['checker']['backend']}); log seq {payload['seq']}")
        print("counts: " + ", ".join(f"{name} {value}" for name, value in payload["counts"].items()))
        return 0
    raise AssertionError(f"unhandled command {arguments.command!r}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
