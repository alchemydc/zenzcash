#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo clippy --locked --manifest-path server/webauthn/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path server/webauthn/Cargo.toml
cargo build --locked --release --manifest-path server/webauthn/Cargo.toml
