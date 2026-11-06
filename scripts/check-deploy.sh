#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/check.sh
scripts/build-auth.sh
node tools/build-runtime.mjs
node tools/smoke-runtime.mjs
