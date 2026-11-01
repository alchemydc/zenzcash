# zforum
calm, personalized zcash forum

A reading lens over forum.zcashcommunity.com: claim digests, a Calm lens that folds without
deleting, per-thread summaries and self-quizzes, and signed receipts showing a post was
checked before it was posted. Design: `SPEC.md`. Decisions: `WORKLOG.md`. Resume: `HANDOFF.md`.

## Run the prototype
```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m zforum.site --snapshot data/crawls/20261031T215141Z --out site/data
.venv/bin/python -m http.server 8000 -d site --bind 127.0.0.1    # then open http://127.0.0.1:8000/
```
The committed model outputs are bound to that snapshot (see HANDOFF.md if it is missing).

## Pipeline
```
.venv/bin/python -m zforum.crawl --out data/crawls                       # last 30 days, anonymous, 1 req/s
.venv/bin/python -m zforum.intel prepare analyze_thread --snapshot S --topic N
.venv/bin/python -m zforum.intel run-api JOB_DIR                         # with ANTHROPIC_API_KEY, or:
.venv/bin/python -m zforum.intel accept JOB_DIR --subagent-model claude-sonnet-5-5   # after a subagent writes output.json
.venv/bin/python -m zforum.attest issue JOB_DIR                          # sign a check_draft receipt
scripts/check.sh                                                         # mypy --strict, pytest, node tests
```
