# Handoff — resume state

Updated 2026-11-01, session 3.

## Where things stand
- **The design prototype is built**, revised after the users' first review (`D-46` to
  `D-52`), and waiting for their review again (`WORKLOG.md`, session 3). `SPEC.md` is the
  design; `D-35` to `D-52` are its rulings.
- The users will come back to the maturity and trait definitions (`D-52`).
- The first prototype is archived, still runnable, in `archive/research-prototype/`.
- Open: `Q-16` (should restatements keep allegations of interest?).

## Run it
```
scripts/serve.sh 8000              # builds the Rust server, serves http://127.0.0.1:8000/
scripts/check.sh                   # the gate: node tests, clippy, cargo test, build re-check
node tools/feedback-report.mjs     # what readers said about the restatements (team only)
```

## How the data is made
1. `node tools/prepare.mjs` reads the six ZCG threads from the archived snapshot and writes
   one job per model task under `work/jobs/` (job.json + view.md).
2. A Sonnet subagent does each job by following `model/marks.md` or `model/summary.md`, and
   runs `node tools/check-output.mjs <job-dir>` until it passes. At most 5 at a time
   (`D-27`), with job-specific scratch script names (`D-45`).
3. `node tools/accept.mjs <job-dir> --model claude-sonnet-5-5` stores the result with its
   prompt and input hashes in `model/results/`.
4. `node tools/fetch-accounts.mjs` fetches account creation dates (60 requests, 1 per
   second) into `work/accounts.json`.
5. `node tools/build.mjs` re-checks everything and writes `site/data/zcg.json`.

Changing a prompt or the posts makes the build refuse the affected results until those jobs
are re-run.

## What is not in git
`work/` (jobs, account dates, ratings, feedback), `site/data/` (built), `server/target/`,
and the archived snapshot under `archive/research-prototype/data/`. Without the snapshot,
nothing rebuilds; `A-5` (whether to commit it) is still open.
