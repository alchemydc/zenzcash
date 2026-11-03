#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node tests/deployment.test.mjs
node tests/import.test.mjs
cargo clippy --locked --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path server/Cargo.toml
cargo build --locked --release --manifest-path server/Cargo.toml
scripts/build-auth.sh
node tools/build-runtime.mjs
node tools/smoke-runtime.mjs
