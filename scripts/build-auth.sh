#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo clippy --manifest-path server/webauthn/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/webauthn/Cargo.toml
cargo build --release --manifest-path server/webauthn/Cargo.toml
