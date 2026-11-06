#!/bin/bash
# The test gate. Every step must pass; a red step aborts the chain.
set -euo pipefail
cd "$(dirname "$0")/.."
# Integration tests invoke both binaries; build before running them in a fresh clone.
cargo build --locked --manifest-path server/Cargo.toml
cargo build --locked --release --manifest-path server/Cargo.toml
cargo clippy --locked --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path server/Cargo.toml
# Includes deterministic fixture assembly and all 11 accepted-result provenance checks.
node --test tests/*.test.mjs
