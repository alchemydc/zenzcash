"""The receipt issuer's signing key and the published keyring of its public keys.

The private key lives outside the repository (data/ is gitignored), is created with mode
0600, and is refused if group or world can read it. Key material never appears in errors or
logs."""

import os
import stat
from pathlib import Path
from typing import Any

import jsonschema
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, load_pem_private_key

from zforum.attest.receipt import b64url_decode, b64url_encode, key_id, raw_public_key
from zforum.domain import UtcTimestamp
from zforum.fsio import load_json, write_json_atomic

KEYRING_FORMAT = "zforum-keyring-1"

_KEYRING_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["format", "keys"],
    "properties": {
        "format": {"const": KEYRING_FORMAT},
        "keys": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kid", "public_key", "created_at"],
                "properties": {"kid": {"type": "string"}, "public_key": {"type": "string"}, "created_at": {"type": "string"}},
            },
        },
    },
}


class KeyringError(ValueError):
    pass


def load_keyring(path: Path) -> dict[str, Ed25519PublicKey]:
    document = load_json(path)
    errors = list(jsonschema.Draft202012Validator(_KEYRING_SCHEMA).iter_errors(document))
    if errors:
        raise KeyringError(f"{path}: {errors[0].message}")
    assert isinstance(document, dict)
    keyring: dict[str, Ed25519PublicKey] = {}
    for entry in document["keys"]:
        raw = b64url_decode(entry["public_key"], f"{path}: public key {entry['kid']}")
        if len(raw) != 32:
            raise KeyringError(f"{path}: public key {entry['kid']} is {len(raw)} bytes; Ed25519 public keys are 32")
        public_key = Ed25519PublicKey.from_public_bytes(raw)
        if key_id(public_key) != entry["kid"]:
            raise KeyringError(f"{path}: kid {entry['kid']} does not match its public key ({key_id(public_key)})")
        if entry["kid"] in keyring:
            raise KeyringError(f"{path}: kid {entry['kid']} appears twice")
        keyring[entry["kid"]] = public_key
    return keyring


def generate_issuer_key(private_key_path: Path, keyring_path: Path, now: UtcTimestamp) -> str:
    """Creates a new issuer key and publishes its public half. Refuses to overwrite a key."""
    private_key = Ed25519PrivateKey.generate()
    pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    private_key_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(private_key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(pem)
        handle.flush()
        os.fsync(handle.fileno())
    existing: list[dict[str, str]] = []
    if keyring_path.exists():
        load_keyring(keyring_path)
        document = load_json(keyring_path)
        assert isinstance(document, dict)
        existing = list(document["keys"])
    kid = key_id(private_key.public_key())
    entry = {"kid": kid, "public_key": b64url_encode(raw_public_key(private_key.public_key())), "created_at": now.iso()}
    write_json_atomic(keyring_path, {"format": KEYRING_FORMAT, "keys": [*existing, entry]})
    return kid


def load_private_key(path: Path) -> Ed25519PrivateKey:
    mode = path.stat().st_mode
    if mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise KeyringError(f"{path}: private key is accessible to group or others (mode {stat.filemode(mode)}); chmod 600 it")
    key = load_pem_private_key(path.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise KeyringError(f"{path}: not an Ed25519 private key")
    return key
