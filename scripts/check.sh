#!/bin/bash
# The test gate. Every step must pass; a red step aborts the chain.
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/bin/mypy
.venv/bin/pytest
node --test site/tests/*.test.mjs
