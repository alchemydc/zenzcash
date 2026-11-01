# Handoff — resume state

> **Archived 2026-10-31 (`D-35` in the root `WORKLOG.md`).** This describes the first
> prototype as it was set aside. Run everything from this directory. `CLAUDE.md` and
> `WORKLOG.md` stay at the repo root.

Updated 2026-10-31, end of session 2. Everything needed to pick this back up.

## Read these, in order
1. `CLAUDE.md`: working rules, plus how they apply to zforum (git identity, languages,
   determinism boundary, promised surfaces).
2. `SPEC.md`: the design. §12 specifies the check-receipt format. §10 has the prototype
   status.
3. `WORKLOG.md`: every decision (`D-n`), finding (`F-n`) and open item (`Q-n`, `A-n`).
   Session 2 starts at "Session 2: static prototype".

## What exists
| Path | What |
|---|---|
| `zforum/crawl.py` | Anonymous crawler: the last 30 days, or `--topics`. Immutable snapshots under `data/crawls/` |
| `zforum/thread.py`, `quotes.py`, `signals.py` | Thread model, quote graph, deterministic signals |
| `zforum/intel/` | Model tasks as jobs: prompts in `intel/tasks/`, validator, subagent and Anthropic API backends |
| `intel/results/` | Accepted outputs with provenance: 12 analyses, 12 quizzes, 12 briefs, 1 digest, 1 issues set, 3 draft checks |
| `zforum/attest/` | Signed findings receipts and the hash-chained log. Public data in `receipts/` |
| `zforum/site.py`, `site/` | Static site data builder; vanilla-JS front end. `#/` is the 10-minute **catch-up** (main mode, SPEC §6.4); `#/research` and the thread pages are **research mode** |
| `tests/`, `site/tests/` | pytest (mypy --strict in the gate) and node tests; `scripts/check.sh` runs all |

## What survives a rebuild, and what does not
| Thing | Where | Survives? |
|---|---|---|
| Code, prompts, results, receipts | git | yes |
| Crawl snapshot `20261031T215141Z` (36 MB) | `data/` (gitignored) | **no**; see below |
| Receipt signing key | `data/keys/receipt-issuer.pem` (gitignored, 0600) | **no**; the public half is in `receipts/keyring.json` |
| Built site data | `site/data/` (gitignored) | no; rebuild with `python -m zforum.site` |
| venv | `.venv/` | no; `pip install -r requirements.txt` |

**If the snapshot is lost:** a new crawl contains newer posts, so every input hash changes
and `zforum.site` refuses the committed results by design (`D-28`). Re-run the 12 analyses,
then the quizzes, briefs, digest and checks, and last the issues (they depend on the briefs). With an API key, `run-api` per job does it;
without one, use subagents (at most 5 at a time, `D-27`). Whether to commit the snapshot is
open: A-5, which ties to the ToS question Q-5.

**If the signing key is lost:** run `python -m zforum.attest keygen`. It appends a new key to
the keyring. Old receipts still verify against the old public key.

## Git identity
Repo-local config: `sudo_ml <29868543+ml-sudocode@users.noreply.github.com>`. After a fresh
clone, re-apply it with `git config --local`. Never change the global identity.

## Next actions
A-5 (snapshot decision), A-6 (claim statement spans), A-3 (gold set), A-4 (ToS),
A-7 (API run). Details are in `WORKLOG.md`.
