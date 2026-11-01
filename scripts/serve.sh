#!/bin/bash
# Serves the design prototype on http://127.0.0.1:8000/ (page, ratings and feedback API). Ctrl-C stops it.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --release --quiet --manifest-path server/Cargo.toml
feedback_file="$(node tools/lib/feedback-path.mjs)"
exec server/target/release/zforum-server --site site --ratings work/ratings.json --feedback "$feedback_file" --port "${1:?usage: scripts/serve.sh <port>}"
