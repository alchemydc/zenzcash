#!/bin/bash
# The test gate. Every step must pass; a red step aborts the chain.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/*.test.mjs
cargo clippy --quiet --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --quiet --manifest-path server/Cargo.toml
# Re-checks every accepted model result against the current prompts and posts.
node tools/build.mjs
