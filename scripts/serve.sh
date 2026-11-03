#!/bin/bash
# Guest reading works without the verifier; accounts require scripts/build-auth.sh first.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
cargo build --release --quiet --manifest-path server/Cargo.toml
node tools/build-runtime.mjs
zforum_port="${1:?usage: scripts/serve.sh <port>}"
exec server/target/release/zforum-server serve --site site --db work/zforum.sqlite --port "$zforum_port" --origin "${ZFORUM_ORIGIN:-http://localhost:$zforum_port}" --rp-id "${ZFORUM_RP_ID:-localhost}" --webauthn server/webauthn/target/release/zforum-webauthn
