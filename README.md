# zforum
calm, personalized zcash forum

A reading lens over forum.zcashcommunity.com, with independently updated discussion pages.
Design: `SPEC.md`. Decisions and rationale: `WORKLOG.md`. Resume: `HANDOFF.md`.
Working rules: `CLAUDE.md`.

```sh
scripts/serve.sh 8000       # open http://localhost:8000/
scripts/check.sh           # Node tests, Rust clippy/tests and deterministic data rebuild
scripts/build-auth.sh      # requires registry access; builds the maintained WebAuthn verifier
```

Restart the server for this backend upgrade, then refresh the page. The first start imports
the generated initial snapshot into `work/zforum.sqlite`; later starts preserve published
content and account data. Back up that database on durable storage. Keep it outside `site/`.
No deployment is configured. `ZFORUM_ORIGIN` and `ZFORUM_RP_ID` must identify the chosen HTTPS
production origin/domain before real passkeys are enrolled. Local development uses **localhost**,
not the numeric loopback address, for passkeys.
If account creation reports an address mismatch, use the exact URL printed by the server.
The account panel also links to that URL when opened at another address.

Real registration/sign-in/recovery, device speech and NotebookLM import still need user
verification. See `HANDOFF.md` for the latest automated and browser test results.

## Refresh forum content

The configured topics are `zcg` (six threads), `bug-bounties` (57058),
`zebra-disclosure` (58723), and `konclave` (57218). There is no scheduler or full-forum crawl.
Install Linux `bwrap` (bubblewrap), the chosen operator CLI (`codex` or `claude`), and authenticate
that CLI first. The adapter exposes its standard authentication file or provider API key to
that CLI only. It does not expose the application database to model jobs. Missing isolation
fails explicitly; subscription/API charges belong to the operator.

Build the application first (`scripts/serve.sh` also does this):

```sh
cargo build --release --manifest-path server/Cargo.toml
# Discover the past seven days, then fully reconcile only the three test topics.
# Previously tracked test topics stay in scope even when quiet this week.
scripts/zforum week --run dev-week-1 --candidate sol --agent codex --model gpt-6.1-sol --max-jobs 20 --timeout-seconds 600
# Review work/refresh/dev-week-1/run-report.json and the three candidates, then publish:
scripts/zforum publish --run dev-week-1-bug-bounties --candidate sol
scripts/zforum publish --run dev-week-1-zebra-disclosure --candidate sol
scripts/zforum publish --run dev-week-1-konclave --candidate sol
# Replay updates locally without network/model calls or database writes:
node tools/replay-updates.mjs dev-week-1
```

Use a **new run name** to fetch again; a same-name retry resumes its frozen snapshot.
Identical jobs reuse their results across runs. The replay omits recent posts from current
recorded sources as a simulated baseline; it does not reconstruct historical edits. Its
report covers new posts, a new thread, edits, hiding, deletion and an interrupted pull.
Discovery alone is `scripts/zforum discover --run NAME`; optional `--since` and `--until`
set the activity window. Individual topic operations and model comparisons:

```sh
# Choose a new run name. Fetching alone makes no model calls.
scripts/zforum fetch --run review-2026-11-01 --topic zcg
# Use an exact model identifier supported by your chosen CLI/account.
scripts/zforum analyze --run review-2026-11-01 --candidate codex-a --agent codex --model MODEL_ID --max-jobs 20 --timeout-seconds 600
scripts/zforum analyze --run review-2026-11-01 --candidate claude-b --agent claude --model MODEL_ID --max-jobs 20 --timeout-seconds 600 --budget-usd 5
scripts/zforum compare --run review-2026-11-01 --candidate codex-a --other claude-b
# After reviewing the artifacts and blinded samples, explicitly choose a candidate:
scripts/zforum publish --run review-2026-11-01 --candidate codex-a
```

`refresh` combines fetch and analyze with the same arguments; it still requires explicit
publication. All commands accept `--db PATH`; use the same database as the running application.
Run artifacts live under `work/refresh/RUN/`: frozen snapshot/prompts, fetch progress, candidate
outputs/manifests, checked `site.json`, run reports and comparison samples. No private account
data appears in those model inputs. Do not edit frozen files; make another run/candidate.

Retry the same analyze/refresh command to reuse completed unchanged jobs. The shared cache
also reuses validated results across runs with identical source/context, prompts and model.
A changed thread invalidates its topic's context; unrelated topics remain reusable.
Live marks jobs target at most eight posts, retaining full-thread context. Invalid outputs
get at most three model attempts with explicit validation feedback; every attempt is saved
and counted. `--max-jobs` bounds new calls per invocation (across all topics for `week`);
`--timeout-seconds` bounds each call. `--budget-usd` is Claude's per-call
cap, not a whole-run budget; Codex reports usage but has no asserted dollar cap. Null cost
means unavailable. A fetch interrupted before freezing reconciles all threads again. A failed
pull does not advance freshness; already observed visibility restrictions remain in force.
If a restricted post is still in the published release, the topic returns a clear unavailable
state until a safe release is published. Other topics remain available. There is no fallback
to cached static topic data. Publication and rollback affect one topic at a time.

A concise reusable instruction for either operator agent:

```text
Read AGENTS.md, SPEC.md sections 13–14 and WORKLOG.md. Use scripts/zforum with an explicit
run name, candidate name, agent and exact model. Freeze one source snapshot for comparisons.
Respect the job/time/budget limits and isolated runner; never give model jobs the application
DB or other account data. Resume matching completed jobs, validate exact inputs and outputs,
and report failures and actual/unavailable usage. Review the blinded samples for faithfulness,
missing arguments, invented claims and tone. Keep publication explicit; use the application
publish command for the chosen candidate, never replace the production database. Report
pending analysis and visibility restrictions honestly. Do not deploy or schedule a crawler.
```

## Database operations

```sh
server/target/release/zforum-server backup --db work/zforum.sqlite --to /SAFE/DURABLE/PATH/zforum-backup.sqlite
server/target/release/zforum-server report --db work/zforum.sqlite
server/target/release/zforum-server rollback --db work/zforum.sqlite --release RELEASE_ID
server/target/release/zforum-server import-history --db work/zforum.sqlite --file work/feedback.json
```

Backup destinations must not already exist. The consistent SQLite backup includes account
state and content. To restore, keep the original database intact, copy the backup to an unused
private path, then start the server with that copy using the full `serve` command below. Check
account/bookmark/feedback and release state before switching any production process. Never copy
a SQLite file over a running database. Automated tests reopen a backup and verify recovery
state, personal data and content; a real production restore drill remains an operator task.

```sh
server/target/release/zforum-server serve --db /PRIVATE/PATH/restored.sqlite --site site --port 8001 --origin http://localhost:8001 --rp-id localhost --webauthn server/webauthn/target/release/zforum-webauthn
```

Changing ports above is for local restoration checks; production must retain the enrolled
RP/domain and HTTPS origin. Rollback only changes content. Recovery/account data and immediate
source-visibility restrictions are not rolled back. `report` separates current ternary
feedback and mood counts from historical signed feedback; legacy import remains
unattributed history and never creates verified votes. Schema 4 preserves the original
signed rows without converting them to the new scale.
For old 0–10 files, use `node tools/feedback-report.mjs PATH`.

In this sandbox, cached application checks use `CARGO_HOME=/tmp/zforum-cargo`; that temporary
cache is an environment workaround, not a deployment requirement. Browser integration is
`cargo build --manifest-path server/Cargo.toml && node tests/browser.mjs` where localhost
sockets are allowed and Chrome (`google-chrome-stable`) is available. Tests use an isolated temporary database
and browser profile. Add `--catalog week-20261101 sol-small` to exercise the four recorded
topic candidates when those local artifacts are present. The browser test covers native
keyboard activation, authenticated reading/feedback, exports, reduced motion and mobile
layout. Physical passkey enrollment/recovery still requires a real authenticator.

The first prototype is archived in `archive/research-prototype/`.
