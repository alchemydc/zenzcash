"""Where the receipt issuer keeps its key and publishes its keyring, log and findings."""

from zforum.intel.jobs import REPO_ROOT

PRIVATE_KEY_PATH = REPO_ROOT / "data" / "keys" / "receipt-issuer.pem"
RECEIPTS_DIR = REPO_ROOT / "receipts"
KEYRING_PATH = RECEIPTS_DIR / "keyring.json"
LOG_PATH = RECEIPTS_DIR / "log.json"
FINDINGS_DIR = RECEIPTS_DIR / "findings"
EXAMPLES_PATH = RECEIPTS_DIR / "examples.json"
