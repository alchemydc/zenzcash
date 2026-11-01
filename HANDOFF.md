# Handoff — resume state

Updated 2026-11-01, session 4 with Codex (`D-53`).

## Session 4 additions
- The user chose **collapsed filtered posts, greyed when expanded** (`D-55`), then paused
  the framework work to add **Diff** and **Select posts / own-AI export** (`D-56`, `D-57`).
- Implemented: lazy expansion with reasons; diff tabs marking added/removed authored
  wording with quoted replies separate; checkboxes and a count preserved across thread
  tabs; a combined Markdown download containing `site/prompt.md`, selected raw posts and
  links; Copy links with a visible manual-copy fallback; direct post routes that open the
  original and expand filtered targets. Anonymous mode's export disclosure is visible.
- Internal site data is now `zforum-design-2`, with raw and authored text retained for
  faithful exports and diffs. Browser, builder and Rust server agree on the format.
- `scripts/check.sh` passes, including new diff/export/route property and example tests,
  19 Rust tests, clippy, and the accepted-output rebuild. Diffing all 77 existing
  renditions took ~23 ms total in Node, ~3 ms for the slowest post.
- **UI verification remains pending.** The sandbox rejects the test server's localhost
  bind (`Operation not permitted`), and offline headless Firefox crashes (exit 139).
  `tests/browser.mjs` is a bounded, isolated Firefox BiDi check for collapse/grey,
  cross-thread selection, the downloaded file, copy/clear, deep links and desktop/mobile
  screenshots. Run `cargo build --manifest-path server/Cargo.toml && node tests/browser.mjs`
  where localhost listeners and Firefox are allowed. Screenshots go in `work/screenshots/`.
- **The framework migration below is still outstanding.** No new ratings, renditions or
  contention summaries have been generated. Existing model prompts and outputs are intact.
  The user's edits are recorded; neither these features nor the broader task has received
  user verification. Do not report either as complete.

## Read first
- `CLAUDE.md`: the working rules. Despite the name, they apply to every agent working here,
  Codex included. The zforum section at the end pins down this project's stack and limits.
- `SPEC.md`: the design as it stands.
- `WORKLOG.md`: the append-only decision ledger (`D-`/`F-`/`Q-`/`A-` ids). Session 3
  (from `D-35`) covers the current prototype; everything before it is the archived one.

## Where things stand
- **The design prototype is built**: a home board and the ZCG topic page, demonstrated on six
  forum threads about Zcash Community Grants. It was revised after the users' first review
  (`D-46` to `D-51`); the users have not yet reviewed that revision.
- The first prototype is archived, still runnable, in `archive/research-prototype/`.
- `Q-16` is resolved by D-54: keep central allegations as attributed allegations. Its
  implementation is pending with the framework migration. `A-5` (whether to commit the
  snapshot) remains open.

## Next task: adopt the reading framework
The users want to replace how posts are rated, filtered, restated and summarised with a
framework ChatGPT produced from the user's own annotations of 12 forum posts.

**Inputs.**
1. The framework: `/home/firexware/ml/discourse-evaluation-agent-handoff.json`, outside the
   repo. It is the user's working file (it contains local paths and the user's comments), so
   it must not be committed; carry what is adopted into the repo's own prompts and spec.
   Its sections:
   - `scales`: four ratings, each 0–3 or null with a stated meaning for null: tone
     (higher is less antagonistic), premise transparency ("Assumptions and certainty"),
     reasoning ("Argument support") and contribution ("Contribution to understanding").
   - `cross_cutting_rules` (12), `flags` (16) and `flag_requirements`: evidence spans,
     target, severity, scope and confidence for every flag.
   - `workflow` (8 steps), `ui` (tone and support presets with thresholds, null handling,
     coverage reporting, extra controls).
   - `rewrite_contract`: what a "faithful neutral rendition" must preserve, may change and
     must not do, plus a separate editor-analysis layer and four worked examples.
   - `thread_summary_contract`: summaries organised by point of contention, with fields,
     rules, a worked example issue and five more issue seeds.
   - `output_record_contract`, `classifier_prompt`, `validation` (9 checks).
   - `calibration_cases` (12): proposed scores, the user's annotations (author `sudo`) and
     calibration notes. Their texts come from a document export with conversion artifacts;
     use the snapshot's raw post text instead. `ZAP #n` is post n of t/58656 (thread F on
     the page) and `End ZCG #n` is post n of t/58515 (thread A).
   The file calls itself "0.1 proposed calibration": not a validated scale.
2. ChatGPT's recommendation, as the user passed it on (verbatim):

   > Use the attached framework to implement post ratings, reading filters, neutral renditions, and summaries organized around points of contention. Treat its example ratings as provisional calibration examples.
   >
   > Generate analytical notes automatically; do not require me to review each one. Keep notes grounded in specific passages, distinguish the author’s explicit claims from your interpretation, and omit notes that require too much speculation.
   >
   > Label notes “AI-generated analysis” and make this disclosure readily visible:
   >
   > “These notes are generated by AI and have not been reviewed by a human. They may misinterpret a post or miss context. If you notice a significant error, you can report it to the maintainers. Reports may not receive a response or correction; active maintenance is not guaranteed.”
   >
   > Keep the original post easily accessible beside each rendition or note. Add a working report mechanism if one is available; otherwise omit the invitation to report until a contact route is configured. Disclaimers should accompany careful analysis, not substitute for it.

   No report mechanism or contact route exists today.

**What in the current prototype this touches.**

| Area | Today | Where |
|---|---|---|
| Per-post marks | maturity 1–10 with a reason; 7 traits, each with a reason and a verbatim quote | `model/marks.md`, `tools/lib/validate.mjs` (`validateMarks`), `site/js/vocab.js` (`TRAITS`, `maturityBand`) |
| Restatement | first person, tone only, `null` when already calm | `model/marks.md` (`clean`), `validateMarks` (keeps links and numbers, length cap) |
| Filters | grey below a minimum maturity, grey chosen traits, grey accounts newer than a minimum; nothing is hidden | `site/js/logic.js` (`greyReasons`, `DEFAULT_SETTINGS`, `parseSettings`), `site/js/topic.js` (`settingsPanel`) |
| Post display | marks with "Why?"; tabs for the calm restatement and the original | `site/js/post.js` (`marks`, `versions`) |
| Summary | headline, overview sentences with citations, "Why do people think this?" points and groupings | `model/summary.md`, `validateSummary`, `site/js/topic.js` (`overview`, `whySection`) |
| Site data | `zforum-design-2`, built from accepted results, with raw and authored text | `tools/build.mjs`, `site/data/zcg.json` |

Recorded decisions it touches: `D-36` (restatements change tone only), `D-37` (maturity
score plus traits; greyed posts stay readable, nothing hidden), `D-38` (the 7 traits),
`Q-16`, and `D-52` (the users would come back to scoring). New rulings go into
`WORKLOG.md`, committed, before they are built (`CLAUDE.md`).

Unaffected unless the users say otherwise: the home board, what's new, anonymous mode, the
time-on-forum badge and filter, thread tabs, mind-change ratings, and the restatement
feedback sliders.

## Working agreements
- **The users design the features.** The first prototype was archived because too many of
  its features were invented by the AI (`D-35`). Summarise your understanding of a request
  back to the users and wait for their corrections before building; when a gap needs a
  choice, pick the plainest option and list it as an assumption they can correct.
- **Never mark work complete** without the users' verification. Verify visual work by
  looking at it (screenshots), not by assuming.
- **At most 5 agents at a time** (`D-27`), with job-specific scratch file names (`D-45`).
- **Git:** commits are authored and committed as
  `sudo_ml <29868543+ml-sudocode@users.noreply.github.com>` (already set with
  `git config --local`; never change the global identity). Stage explicit paths, never
  `git add -A`. Never commit the user's files: the design transcript
  `Oct-31-07-26-PM-zforum-spec-a1d3ae28-24b4.md` in the repo root (untracked), and anything
  in `/home/firexware/ml/` outside the repo. After each commit, review the diff for security
  issues and report what you find.
- **The forum is only read:** anonymously, no API key here (`D-20`), at most 1 request per
  second, a User-Agent without an email (`D-23`), back off on HTTP 429. Hidden posts stay
  hidden.

## Run it
```
scripts/serve.sh 8000              # builds the Rust server, serves http://127.0.0.1:8000/
scripts/check.sh                   # the gate: node tests, clippy, cargo test, build re-check
node tools/feedback-report.mjs     # what readers said about the restatements (team only)
```
Needs Node 24.2 or later (the tools use `import.meta.main`; developed on 26.7) and Rust
1.93. Screenshots so far were taken with headless Firefox over WebDriver BiDi; that script is
not in the repo.

## How the data is made
1. `node tools/prepare.mjs` reads the six ZCG threads from the archived snapshot
   (`archive/research-prototype/data/crawls/20261031T215141Z`) and writes one job per model
   task under `work/jobs/`: a `job.json` naming exactly the posts to cover, and a `view.md`
   of the thread. The six threads hold 354 posts (350 visible) by 60 authors, split into
   10 per-post jobs (views of 13k–121k characters) plus one summary job (292k characters).
2. A model does each job by following `model/marks.md` or `model/summary.md`, writes
   `output.json` in the job directory, and runs `node tools/check-output.mjs <job-dir>`
   until it passes. So far each job was done by a Claude Sonnet 5.5 subagent. Nothing in a
   job is specific to that backend.
3. `node tools/accept.mjs <job-dir> --model <model-id>` stores the result in
   `model/results/` with the hashes of its prompt and view. It records the backend as
   `"subagent"` (hard-coded), which the build shows on the page.
4. `node tools/fetch-accounts.mjs` fetches account creation dates (60 requests, 1 per
   second) into `work/accounts.json`.
5. `node tools/build.mjs` re-checks every accepted result and writes `site/data/zcg.json`.

Changing a prompt or the posts makes the build refuse the affected results until those jobs
are re-run. Model outputs are recorded artifacts, never computed inside the build.

## Known limitations
- Ratings and feedback have no logins: anyone can submit them under made-up reader ids, and
  a malicious web page could send them to the local server (DNS rebinding). Acceptable for a
  design prototype, not for launch.
- Anonymous mode cannot mask a name written in plain text inside a post.

## What is not in git
`work/` (jobs, account dates, ratings, feedback), `site/data/` (built), `server/target/`,
and the archived snapshot under `archive/research-prototype/data/`. Without the snapshot,
nothing rebuilds; `A-5` (whether to commit it) is still open.
