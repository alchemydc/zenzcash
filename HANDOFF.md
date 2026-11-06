# Handoff — resume state

## Current: bounded full-history summaries verified (F-166/F-167)

- F-169 supersedes runner state below: session 63807 ended after all seven sections
  passed; synthesis's 1,530 cited originals exceed the 1,000,000-character guard.
  No synthesis invocation. Implement bounded intermediate merges while retaining all
  accepted sections, then resume with a new unique log label. No active runner.
- F-170: intermediate merges implemented and verified, 217 Node tests pass. All
  121 other candidates still validate; seven price sections are reusable. Two actual
  merge plans are 808,252 / 588,343 characters. Resume using label merges, preserving
  failed sections-pipeline log and all accepted artifacts. Final review generator now
  includes merge provenance and the updated test count.

- All 121 other topics validate unchanged. Price is the only remaining topic; its
  oversized CLI request failed before generation. Runner session 63807 is active:
  work/finish-retry-pull-20261106.sh sections, two-hour / 100-call analysis bound.
  Logs: work/pull-20261106-analysis-sections.log and sections-pipeline.log.
- Full-history sections implemented: seven requests cover all 7,441 price posts exactly
  once; 92 recent targets / 12 reply batches unchanged, maximum 20 context posts.
  214 Node / 60 Rust tests, Clippy/builds pass. Real planning under 256 MiB heap passes.
  Evidence: work/pull-20261106-summary-sections-{plan.json,gate.log,node.log}.
- Local code commit 337e657 reviewed: no new security concern; tools remain disabled,
  bounded input/source ownership/citation validation intact, section outputs scanned.
  Amendment succeeded: price source hash unchanged, failed attempt preserved, all
  121 other snapshots/candidate manifests unchanged. Evidence:
  work/pull-20261106-summary-sections-amendment.json. Then prepare, isolated staging and consolidated
  review. Do not publish, deploy or acknowledge human-only review.
- Earlier CURRENT runner statements below are historical: session 33023 ended at the
  CLI input limit. No prepared bundle/rehearsal exists yet.

## Revised algorithm verified; finishing pull authorized (D-144/D-145)

- CURRENT (F-164/F-165): 118 topics validated; strict parser rejected two malformed
  model outputs in technical-support analysis. Accepted checkpoints intact: 29/30
  reply batches saved, 18 model jobs remain overall. Runner session 33023 executes
  work/finish-retry-pull-20261106.sh json-retry2 with a
  two-hour / 100-call analysis bound, then bounded preview/export/rehearsal/review.
  Logs: work/pull-20261106-analysis-json-retry2.log and retry2-pipeline.log; final report
  generation uses review-final-generation.log. Earlier sessions 58591 and 38783 ended
  with failure and are NOT running, as did session 45077. No prepared bundle or rehearsal existed yet.
  Prior logs preserved. Parser/output validation unchanged; no malformed-output repair.
  Successful final report should be work/pull-20261106-review.{txt,json}.

### Earlier continuation checkpoints (superseded by the current runner above)

- Fetch is complete: 122 topics, 12,064 records / 12,053 visible, 7,968 dated originals,
  3,539 retained reply assessments, 86 retained summaries, initially 126 fresh jobs.
  Of 8,512 added records, 116 were created after the prior completed cutoff; 8,396 are
  historical backfill. Two existing posts changed and two became unavailable.
- F-162/F-163: first live summary misread “Analyze only target_post_ids” as excluding
  all summary sources. Validator rejected it; retry produced a substantive accepted
  summary. Commit 05a1bcc explicitly distinguishes summary/full-history scope from
  marks/target-only scope; all 209 Node tests pass. Request hashes retain exact
  provenance, cached valid results preserved. Interrupted marks attempt remains in audit.
- CURRENT runner: tool session 58591, work/finish-analysis-pull-20261106.sh. Analysis
  six-hour/1,000-attempt bound, then bounded preview/export/rehearsal. Logs:
  work/pull-20261106-analysis-resume.log and analysis-pipeline.log. Earlier session
  64063 and its inner analysis timeout were both stopped; do not restart old scripts.
  Code security review: instruction clarification leaves source ownership, hidden-source
  omission, tool prohibition and strict validators intact; no new concern found.
- Final report generator work/review-pull-20261106.mjs is prepared and syntax-checked.
  Bounded waiter work/finish-review-pull-20261106.sh waits for analysis pipeline PID
  121894, then requires the completed rehearsal/validated candidates before writing
  work/pull-20261106-review.{json,txt}. Seven-hour bound; generation log uses the same
  prefix with review-generation.log. Do not run it manually at the same time.
  Final request-context evidence: all summary citable sets equal full visible source;
  all new-topic individual targets meet cutoff. Price: 92 targets / 12 batches, maximum
  20 context posts and 27,238 request characters; 211,768 KiB RSS under 256 MiB heap.
  Three posts were captured after the discovery cutoff during later live thread fetches;
  next-poll advancement remains the earlier cutoff, and the final report identifies them.

- Full-source-preserving amendment completed successfully: eight already-downloaded
  new-topic snapshots gained the exact frozen reply cutoff; all source hashes match.
  Evidence: work/pull-20261106-reply-window-amendment.json. Remaining topics acquire
  it during normal fetch. Current code is local commit 0c92813 (security diff reviewed).
- Active bounded continuation: tool session 64063, work/finish-full-history-pull-20261106.sh
  under a nine-hour timeout. It runs fetch (two-hour cap), requires all 122 fetched and
  all 7,441 price posts, then analyze (six-hour cap / 1,000 global attempts), preview,
  prepared export and isolated staging rehearsal. Logs: work/pull-20261106-fetch-final.log,
  analysis.log, final-pipeline.log, rehearsal.log (same prefix). Inspect processes and
  artifacts before restarting; never run the obsolete trimming scripts. No publish
  against production, deployment, push or automated human acknowledgment in this flow.

- D-144 supersedes D-142: retain every source post, summarize the full history, and
  individually analyze only the preceding calendar year when importing a new topic.
  Older originals display “Not analyzed · dated post”; no invented assessment or
  rewrite. Existing accepted analyses remain. D-145 authorizes finishing the pull
  after verification, batching all findings/decisions for return review. No live publish.
- F-160: 208 Node / 60 Rust tests, Clippy/builds and actual Chrome warm-cache/UI pass;
  desktop/mobile screenshots inspected. Saved price history: 7,441 source/summary posts,
  92 individual targets / 12 batches, 7,349 dated originals. Exact one-year cutoff
  2025-11-06T03:51:56.235Z. Source data has not been truncated; no model calls yet.
- Use work/amend-pull-20261106-reply-window.mjs under work/import.lock to amend all
  fetched new-topic snapshots and frozen settings, preserving source hashes. Then
  resume the ordinary fetch against work/pull-20261106-draft.sqlite. Never run the
  obsolete D-142 amendment/continuation scripts. Rehearsal script remains valid for
  the full 122-topic prepared bundle; findings permit staging but require human-only
  acknowledgment before even local publication. New content needs current code deployed
  before production publication; deployment is not authorized in this task.

### Prior pause, superseded by D-145

- User says to hold while changing pull parameters. Stopped the waiting scoped
  continuation (timeout PID 113688 / shell 113689, tool session 67006) first, then
  the active fetch PID 112052 (session 15408). No analysis may start until the user
  supplies the new parameters and resumes. Preserve all downloaded snapshots/checkpoints.
- Local commit ff832e0 implements the D-142 fixed price-history setting; all 205 Node
  tests pass. Its scope amendment has NOT yet been applied to this frozen run: the
  full 7,441-post snapshot remains, with 94 posts available since Nov 6, 2025. Prepared
  amendment work/amend-pull-20261106-scope.mjs and continuation
  work/finish-scoped-pull-20261106.sh are not running; do not restart unchanged until
  the user's new parameters are known. No model calls or live content changes.

### Preparation history before pause (D-140/D-141)

- User authorizes fetch/analysis/preparation and explicitly requests all decisions and
  findings together at the end, with no blocking questions. Provisional inclusion of
  all 15 discovered new threads preserves coverage; four scope uncertainties are saved
  in work/pull-20261106-review-decisions.json. No human scan acknowledgment, production
  publication, deployment or push is authorized/performed.
- Fresh schema-11 backup work/pull-20261106-before.sqlite verified against remote SHA
  a793f4c229845c8118edb6cc567fae81541f844cb9c2e525c1b447c874811412; integrity/FKs pass,
  107 topics / 3,553 posts / six accounts. Separate draft work/pull-20261106-draft.sqlite.
  Baseline evidence work/pull-20261106-baseline.json. Remote /tmp transfer removed only
  after download and checksum verification. Existing Fly CLI login works; saved scoped
  preparation token was rejected. Use the normal Fly CLI with --no-container.
- Run 60edd441-5ac7-4069-b813-1d57a2c45573: 2026-11-05T00:29:11.447Z through
  2026-11-06T03:51:56.235Z. Two matching discovery passes, 122 topics after inclusion.
  Initial full fetch crashed at the default 2 GiB Node heap after saving thread-16488
  (7,441 visible posts). F-157/F-158 remove discarded per-batch full-history views;
  all 201 Node tests pass and the real snapshot plans at 182,776 KiB peak RSS. Resume
  from saved snapshot with a fresh two-hour bound; do not repeat discovery. Initial log:
  work/pull-20261106-fetch-resume.log. The first discovery log is
  work/pull-20261106-fetch.log. Subscription auth presence checked, no model calls yet.
- Preserve new-thread-review-original.json and provisional new-thread-review.json in
  work/imports/60edd441-5ac7-4069-b813-1d57a2c45573/. Discovery scan findings exist;
  collect them with final candidate findings, do not self-acknowledge or bypass gates.
  Next: finish fetch, inspect diff/estimated work, bounded analysis using frozen config,
  validate prepared bundle, rehearse staging, and deliver consolidated review packet.
  Local publication rehearsal may require human acknowledgment; preparation can finish
  without it. Do not rerun old hardcoded pull supervisors.
- Recovery commit **2ad53dc** is local only; reviewed diff retains metadata/source
  ownership, target selection and historical identity, with no new security concern.
  Fetch recovery running as PID 112052, tool session 15408, with log
  work/pull-20261106-fetch-recovery.log. It reused the saved price snapshot and advanced
  to subsequent topics. Bound: two hours from recovery launch.
- Bounded continuation (tool session 19532) runs work/finish-pull-20261106.sh under
  an eight-hour timeout: waits for the exact fetch process, requires all 122 fetched,
  analyzes with frozen config and 2,000 global attempt ceiling / six-hour timeout,
  then previews and prepares a bundle only on success. No publish/ack/deploy commands.
  Logs work/pull-20261106-{pipeline,analysis,preview}.log. Inspect before restarting;
  avoid duplicate runners. Largest topics are analyzed last by the normal importer.

## Cached-client catalog failure repaired and deployed (D-139)

- User reported `Invalid topic data in catalog` after the audit-fix deploy. Prior
  browser tests used fresh sessions and missed cached old JS with the new API. Live
  Cloudflare unversioned JS responses had max-age=14400/HIT; the exact error literal
  belongs to the prior catalog parser. This was a deployment coverage gap.
- Corrective code **a8f149d** deployed. Content-hashed JS/CSS URLs cover the entire
  module graph; entry HTML is no-store. Relative imports retain the release prefix.
  Runtime build writes generated assets then atomically publishes generated HTML.
  Unversioned JS/CSS routes removed; static/private-file isolation retained. No schema,
  forum-content, model or account changes. Already-open tabs need a normal reload.
- `scripts/fly-deploy` now runs the complete gate, including warm-cache/UI and passkey
  Chrome checks. **199 Node / 58 Rust tests**, Clippy, builds and runtime smoke pass.
  Real HTTP browser regression reproduces the user's exact error twice, proves old
  modules came from cache, then loads the new release without clearing that cache.
  Screenshot work/screenshots/cached-deployment-topics.png inspected. Logs:
  work/cached-client-{gate,browser,deploy}.log. User verification remains pending.
- Live verification through Cloudflare: no-store HTML matches generated entry;
  all **29 JS/CSS assets** match source and have immutable cache policy under
  `/assets/ba5ee2f0d163b523b82929a87291798dfac4edc50c2f87fb12a529cee254dba2/`.
  Health passes, 107 topics available, featured response byte-identical before/after.
  Evidence: work/cached-client-live-verification.json. Browser connector unavailable;
  live checks used HTTP bytes/headers, while actual browser regression ran locally.
- Image `registry.fly.io/zencash:deployment-01M6QF0PGK9PHYYXF1P72B73PV`, digest
  `sha256:89512f1905de8fdab805c4ab152f75036e691ee6163c6554a5774e58c8d2c8c0`.
  Same Machine/volume/performance CPU/2 GB. Startup backup passed at
  2026-11-06T03:42:05.854Z: schema 11, 107 topics, 3,553 posts, six accounts.
  Backup key `zforum/2026-11-06T03-41-29.476Z-943cbd42-a383-4a87-aa54-6fe4335adcfd.tar.gz`.
  Previous schema-11 image d7ce3005… can be used for code rollback if needed; its
  unversioned-cache defect remains. Do not restore an older DB for this code-only fix.

## Audit fixes deployed and pushed; reproducible tests pass

- D-136/D-137/D-138 fulfilled operationally. Application commit **7594326** deployed
  and pushed to GitHub main. User verification remains pending; audit issues are not
  closed. Live schema **11**, **107 topics / 3,553 posts / six accounts**.
- Deployed image `registry.fly.io/zencash:deployment-01M6QDW7B5FEJ3S8CNYQYX8W9S`, digest
  `sha256:d7ce30059332ce76da13ffd63a046fc95425d408cd028bd48eca8d8de464d0c3`.
  Same Machine e823213f175598, volume vol_vp2eyql6gdqxgjj4, sjc, performance CPU/2 GB.
  Live integrity/FKs pass; all **29 tables** match the fresh migration rehearsal by
  row hashes/counts. Featured-topic HTTP response byte-identical before/after, all
  107 topics available, 95,846-byte catalog, static assets match source, health passes.
  Evidence: work/fixes-live-{database-audit,http-verification}.json and deployment log.
- Fresh local rollback DB: work/fixes-live-before.sqlite (schema 7), SHA
  `326390d87c4a66584cfb781c09c6ef3e8755f3eca976e3fa080e5f437c18411b`.
  Fresh migration rehearsal: work/fixes-live-migration-rehearsal.json; every original
  table row retained, source unchanged, migration ~128 ms. Old image digest:
  `sha256:35e1dea4ad91f9b0be72d7bdff3843e8404cf3d48a19f27457b45c992cb6124e`.
  Schema-7 image requires matching DB on rollback; preserve later writes separately.
- Predeploy offsite backup and startup backup both succeeded. Latest pre-migration
  startup object: `zforum/2026-11-06T03-21-38.622Z-11d6f535-3a5d-43ec-88f2-c2a18b3ef6c4.tar.gz`,
  SHA `2338ce95ac871479d88aad7a0aea9d84ce1f6c1256ac094f46c7b4cae0f74039`.
  Found old import run 9c351205-9ad9-4307-a5c0-7b61d0874de8 owned root:root with private
  modes, preventing service-account backups. Checked 215 directories/3,751 files,
  no symlinks; changed ownership only on that run to UID/GID 10001. Private modes and
  content unchanged. Backup retry and startup backup passed. Future production artifact
  transfers must use the zforum account. Temporary remote DB transfer removed only after
  local checksum verification, preserving space for startup backup.

- D-137/D-138: user authorized replacing missing-input test dependencies and then
  explicitly approved two test-setup corrections. Production randomness is unchanged;
  the concurrency test fixes UUIDs only within its scope and restores the builtin.
  Its exact artifact assertion remains, with explicit out-of-order completion and
  exactly-once job checks. New corruption check edits parsed source text.
- `tests/fixtures/zcg-source.json` retains public source/profile dates from the
  handoff's generated corpus. Parsed-source digest matches exactly; all 11 accepted
  historical view hashes match. Rebuilding yields the same existing corpus object.
  Hidden source stays null. No Zenzcash account records or credentials are included.
  This is explicitly NOT the missing HTTP crawl/manifest. Legacy tools/build.mjs
  still fails if those original inputs are absent; it is separate from test gates.
- Both gates build required binaries before integration tests. Deployment gate includes
  the full application gate, helper checks and runtime smoke. Tests and browser checks
  no longer read ignored source/account files or generated site/data/zcg.json.
- Fresh source-only tree work/reproducible-clean-7livqt3m began with no work inputs,
  site/data, targets or archived crawl. Offline locked builds, Clippy, **198/198 Node
  tests**, **58/58 Rust tests**, runtime smoke, Chrome UI and real virtual-authenticator
  passkey checks all passed. Logs: work/reproducible-{clean-build,clean-gate,browser}.log.
  Deliberately removing result ordering in that disposable tree made the concurrency
  test fail; original file restored exactly. Log: work/reproducible-ordering-mutation.log.
- No forum/model calls, new import publication or production seed during this work.
  Production content and all existing analyses were preserved. Refresh old browser tabs
  for the coordinated server/browser API update. Earlier evidence and rollback guidance
  remain below; local-only/blocked statements in older sections are superseded here.

## Earlier missing-input investigation (resolved for testing, crawl still absent)

- D-135/D-136: merged the 12 commits through sister checkout **9fececf** into main
  at **6d2b188**, preserving history. Only WORKLOG integration authorization differed
  from the sister tree at merge. Both original working trees were clean. No source
  conflict; appended WORKLOG entries from both branches retained. No production contact,
  push, forum fetch or model analysis. GitHub fetch was read-only history investigation.
- User authorizes deployment/push only if tests have no issues, otherwise requires
  discussion. Asked about the two missing-input failures; user requests finding the
  file in Git history, explaining its disappearance and explaining those tests.
  No test waiver was granted; D-137/D-138 subsequently authorized reproducible fixtures.
- Fresh local results: **195/197 Node tests pass**, **58/58 Rust tests pass**, strict
  Clippy and debug/release/WebAuthn builds pass offline. Runtime smoke and Chrome
  browsing/pagination plus actual WebAuthn ceremonies with virtual authenticators pass.
  Recovery and pagination screenshots inspected. Logs: work/fixes-integration-*.log.
- Schema **7 → 11** rehearsal passed on a new COPY of existing local snapshot
  work/after-pull-20261104.sqlite. Result: **107 topics / 3,553 posts / six accounts**,
  all original table rows preserved on this data, 107 listing records match source
  cards/threads/statistics, reopen/integrity/FKs pass, source file SHA unchanged.
  Migration took about 81 ms locally; new listing HTTP response is 95,846 bytes.
  Rehearsal DB: work/rehearsals/fixes-qFR4Wr/zforum.sqlite; evidence
  work/fixes-integration-migration.json. No live-data verification is implied.
- The only two Node failures and the legacy corpus rebuild need
  archive/research-prototype/data/crawls/20261031T215141Z/manifest.json plus its crawl
  payloads. Absent in both checkouts and original handoff ZIP. Full non-shallow local
  history, fetched GitHub branches and reflog-reachable objects have no matching file
  or crawl payload under original or archived paths. Earliest ignore commit d952f72
  already ignores data/. Archived HANDOFF explicitly describes the 36 MB snapshot
  as gitignored/nonpersistent; transfer instructions package source, work/ and site/data/
  but omit that archive data. Commit **7560222** recorded this exact absence on Nov 2.
  Evidence supports omitted/untracked data, not deletion by current fixes; exact time
  the original environment lost its copy is unknown. Do not fabricate a replacement
  manifest or refetch changed forum text and call it the original snapshot.
- Failing tests cover (1) interrupted analysis resume/cache identity/tamper rejection
  and comparison without publishing, (2) maximum three workers and exact equality of
  serial versus out-of-order parallel output. Both fail while loading input before
  exercising those behaviors. They use recorded mock model outputs, not live AI calls.
  D-137/D-138 resolve the automated-test dependency with retained-source fixtures and
  unchanged assertions. Original HTTP-crawl reconstruction remains unavailable.

## Audit-01 medium fixes implemented locally — awaiting user verification (D-133/D-134)

User requested a high-level explanation before fixes; delivered before implementation.
Clarifications: alerts are owner instructions only; preserve existing analyses and keep
hidden-context reuse invalidation deferred. No production access, deployment or push.
The user asked for an estimate during work; 4–6 hours, potentially 8, was communicated.

Local implementation commits:
- c630f70: both Markdown recursion reports; bounded nesting and per-post error containment.
- 9203d30: async bounded WebAuthn helper, cancellation cleanup, post-await auth rechecks.
- 3546e7f: efficient progress query/index/cache and transactional invalidation, schema 8.
- eb76331: bounded reading storage/history pagination and browser integration, schema 9.
- ade4c10: materialized topic listings, on-demand browser content and bounded independent
  SQLite read workers; schema 10. Current-topic privacy checks remain applied.
- 88f98b5: structured canonical model requests, explicit targets, quote verification and
  structured retries. Historical serialization reconstructs old hashes only (D-134).
- 18d190e: source-labelled operator JSON, visible Unicode escapes, suspicious-content
  review and exact-candidate/report acknowledgment gate, including raw server CLI.
  Schema 11 adds auditable exclusion reversals; next import includes reinstated threads.
- b4ae685: measured concurrent progress cache-write race fixed without storing stale means.

README contains practical review/acknowledgment/reversal commands and owner-only alert
setup guidance with official sources. No account configuration, sandbox redesign,
behavioral model evaluation or analysis regeneration was performed. All 11 accepted
initial analyses match their historical source hashes using the existing built corpus.
No model/ source artifacts were changed. Audit issues remain open until user verification.

Validation: broad Node run 195/197 passing. Both failures require the absent archive
manifest at archive/research-prototype/data/crawls/20261031T215141Z/manifest.json; the
corpus rebuild fails for the same reason. No fixture was invented or assertion weakened
to hide this limitation. All 58 Rust tests and strict Clippy pass; debug/release binaries built.
Chrome UI and real WebAuthn flows pass, including saved pagination, topic navigation,
registration/login/add/recovery/revocation. Screenshots inspected. Bounded tests use
only disposable databases, helper processes and browser profiles. Current generated
site/data/zcg.json is present. Logs: /tmp/zforum-medium-final-node.log.

Review implications: internal topic/history API changes require server/browser deployment
as one release. Database startup migrates to schema 11. Raw publish/publish-import/merge
now require --review DIRECTORY. Existing staged candidates can be rescanned/reviewed
without rerunning models. Findings require human acknowledgment; never self-acknowledge
as an agent. Provider usage/access alert coverage is limited, especially stolen-token
use outside the local client and Fly organization access events; README explains this.

Remaining: user/expert verification, restore the real archived snapshot to finish the
legacy checks/rebuild, and separately authorize any deployment. Do not revisit the
explicitly deferred hidden-context reuse policy or configure provider accounts.
Issue directory: /home/zenzcash/zenzcash/audit-01/zenzcash-audit/audit-state/issues/plausible/medium
Ledger: D-133/D-134, F-142 onward. SPEC sections 27–33.

## Standard security audit — report ready for review (D-131/D-132)

- Pinned Cloudflare workflow, source ref **70188e0**; source/reference hashes verified.
  Reports: `/home/zenzcash/security-audit-zforum-20261105/run-2/REPORT.md`,
  `findings.json`, `coverage-ledger.json`, `dependencies.json` and metadata.
- **Zero confirmed vulnerabilities; zero retained needs-validation leads.**
  The prior bookmark-allocation claim was independently tested and rejected as a
  security finding: three made-up keys created three own-account rows, another
  account remained unchanged, and account deletion removed the rows. Meaningful
  shared-service harm was not established; correctness/hardening remains warranted.
- Maintenance priorities: tested WebAuthn library update from the affected 0.5.4
  family (advisory's required subdomain setting is absent in reviewed source),
  no-op/update-only nonexistent bookmark clears, and invalidating stale saved speech.
  Previously public speech replay is local-copy behavior, not proven new disclosure.
- Standard workflow: 21 agent invocations, two hunting waves, both post-wave critics,
  distinct final coverage critic, independent candidate and final-record reviews.
  66 owned checks / 87 source paths; 20 covered units, one finally rejected candidate
  history unit, one out-of-scope live-deployment unit; zero blocked/deferred units.
- Offline isolated tests: **91 passing executions**, including one independent repeat.
  Catalog suite could not load absent generated `site/data/zcg.json`; retained as a
  limitation. Migration failure/reopen fixture preserved ownership and restrictions.
  Both Cloudflare validators pass; their success checks report consistency only.
- Dependency review: 209 unique Rust package/version pairs and 66 matching-package
  RustSec records. Native/OS/image inventory remains incomplete. No installer or
  new dependency downloads. Plain-language report explains evidence and limits.
- **No actual deployment contact of any kind**, including read-only cloud APIs or
  HTTP; deployment review read source definitions only. No production databases,
  credentials, source fixes, dependency updates or GitHub push. Only audit artifacts
  and documentation changed. User review/acceptance remains pending.

## Cloudflare source-only security audit — first pass (D-129/D-130)

- Direct pinned reference: `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`.
  No skills.sh/Vercel installer, npm dependencies or global skill registration.
- Workspace outside repo: `/home/zenzcash/security-audit-zforum-20261105`.
  Read `run-1/REPORT.md`, `findings.json`, `coverage-ledger.json` and metadata.
  Immutable reviewed source ref **a289384**; source/reference hash manifests verified.
- Quick partial pass: 4 reconnaissance + 5 hunters + 1 critic + 1 independent
  verifier; **31 source checks / 65 files**. Application code was not executed.
  Both Cloudflare report validators passed inside read-only, no-network bubblewrap
  with empty allowlisted environment and resource/time limits.
- **Zero confirmed vulnerabilities; one needs-validation lead:** nonexistent-post
  empty/bookmark-clear reading updates reach INSERT and can retain all-false own-account
  rows. Shared resource/security impact is unproven; no severity. Full source trace,
  existing controls and tiny dummy-router validation plan are in NEEDS-VALIDATION.md.
  Own-account false rows alone are correctness/hardening, not availability proof.
- Final critic identified three deferred areas under the quick-profile single-wave
  rule: speech-queue invalidation after visibility changes; topic merge publication;
  partial model-output repair/resume provenance. No comprehensive coverage claim.
- No application changes, production access, deployment, model calls or GitHub push.
  Local commits only record authorization/progress. User review remains pending.


## Current production: November 4 pull deployed (D-128)

- Run `9c351205-9ad9-4307-a5c0-7b61d0874de8` published atomically at
  **2026-11-05T04:01:53.287Z**. Live: **107 topics / 3,553 posts / six accounts**.
  Next cutoff **2026-11-05T00:34:11.447Z**, normal five-minute overlap applies.
- Exact reviewed prepared bundle SHA
  `9e105f438f3260760826ac561f6c94b21f04aa7dcac864dc7b35a146740e9b2c`
  verified remotely. Staging left catalog byte-identical; published catalog exactly
  matches all 107 localhost entries. No new models/fetch, image deploy or restart.
- Pre/post SQLite integrity/FKs pass; all 14 personal tables exactly identical,
  including six accounts. All prior 188 releases, 506 renditions, 3,280 source
  revisions and 186 source pulls preserved. Evidence:
  `work/pull-20261104-database-audit.json`, `work/{before,after}-pull-20261104.sqlite`.
- Offsite backup initially failed with disk full (3 GiB volume). Removed only this
  deployment's three redundant transfer files after verified local copies existed.
  Backup retry succeeded at 04:04:14.400Z, key
  `zforum/2026-11-05T04-03-42.960Z-1a9564ca-8b4d-41b1-be86-b372363f3300.tar.gz`.
  Logs `work/pull-20261104-{stage,publish,tigris,tigris-retry}.log`.
- Fly CLI SSH container detection panicked twice; `--no-container` works for this
  existing Machine. Health passes. Existing app code/CPU/volume unchanged.
  No GitHub push requested or performed. User verification of live site pending.


## Latest: completed pull available on localhost

- All 107 topics analyzed and prepared export validated at 2026-11-05T03:13:47Z.
  294 new-to-site posts, four edits, one unavailable; no remaining model jobs.
- D-127 preview running at http://localhost:8001/ for eight hours from launch.
  DB `work/rehearsals/optimized-pR7it9/zforum.sqlite`: 107 topics / 3,553 posts.
  All five localhost accounts and 14 personal tables preserved exactly.
- Rehearsal report `work/audited-pull-20261104-rehearsal.json`; server log
  `work/audited-pull-20261104-localhost.log`. HTTP homepage returns 200.
  Browser inspection unavailable because browser access host is unavailable.
- Production unchanged. Review and deployment authorization still pending.
  Earlier active-process notes below are historical; preparation has finished.


## Active local pull — 2026-11-05 00:34 UTC (D-126)

- User requests fetch + analysis and CSV/readable diff while away; review before
  any deployment. No production writes, deployment or GitHub push authorized.
- Run `9c351205-9ad9-4307-a5c0-7b61d0874de8`, local draft
  `work/audited-pull-20261104.sqlite`, copied using SQLite backup from verified
  `work/after-audited-release-53986a3.sqlite`. 107 topics (21 new threads).
  Interval 2026-11-03T23:52:05.284Z → 2026-11-05T00:34:11.447Z.
- Fetch currently running (PID 6190, tool session 71603), log
  `work/audited-pull-20261104-fetch.log`. Two matching discovery passes; all 21
  openings reviewed and included conservatively with reasons in run directory.
- Bounded background supervisor PID 6255 runs `work/finish-pull-20261104.sh`:
  waits for fetch process exit, checks complete fetched state, analyzes with 1,000
  global attempt ceiling and six-hour timeout, regenerates preview/audits, then
  prepares/validates `work/audited-pull-20261104-prepared.json`. Whole supervisor
  timeout eight hours. No publish command. Authentication presence checked.
- Logs: `work/audited-pull-20261104-{pipeline,analysis,preview}.log`.
  Review artifacts under `work/imports/9c351205-9ad9-4307-a5c0-7b61d0874de8/`:
  `preview.txt`, `preview.json`, `audit.csv`, `audit-topics.csv`, `audit.txt`.
  These update during work; do not claim complete until all topics are analyzed
  and prepared export succeeds. Inspect logs and resume accepted work if interrupted.
- Prior production notes below remain the baseline. Do not rerun the old runner:
  `work/run-audited-pull.mjs` is hardcoded to the previous draft.


Updated 2026-11-04 05:57 UTC: reviewed content is deployed; performance CPU active.

## Current production state — supersedes pending-deployment notes below

- D-124/D-125 authorized deployment, atomic publication, GitHub push and the CPU
  upgrade. Code at 53986a3 is live as image
  `sha256:35e1dea4ad91f9b0be72d7bdff3843e8404cf3d48a19f27457b45c992cb6124e`.
  Configuration commit 73d5ce7 sets **one performance CPU / 2 GiB**, applied to
  existing Machine **e823213f175598**, sjc, same volume **vol_vp2eyql6gdqxgjj4**.
- Run **ec5e8754-a8ba-486a-952d-be419bc7d522** completed atomically at
  **2026-11-04T05:48:01.009Z**. Next full-pull cutoff is
  **2026-11-03T23:57:05.284Z** (normal five-minute overlap applies). All **86 topics /
  3,260 posts** are live, zero unavailable or privacy-review topics. Featured title:
  “ZCG withdraws its taper; funding alternatives and adoption rules remain contested”.
  Browser checks verify restored filters, hidden-age opt-in, expanded highlights and
  sign-in explanation; screenshot inspected at work/screenshots/audited-release-featured.png.
- No new forum fetch or model calls during deployment. Exact reviewed bundle SHA
  **1617641640382cc3f89e357218f3cc8bc830414cae59980368fb4c58bf972684** was checked after
  transfer. Staged public catalog was byte-for-byte unchanged before atomic publication.
  Production preparation guards and future-pull savings are now live.
- Schema remains 7; all five production accounts preserved. Twelve personal tables
  are identical. Accounts/visits differ only in one matching visit timestamp update
  at 05:54:21 UTC; all non-activity fields are identical. All prior 102 releases,
  450 renditions, 2,923 source revisions and 100 source pulls preserved; ten hidden
  posts redacted. Evidence: work/audited-release-{database-audit,activity-review,http-audit,
  ui-verification,final-status}.json. Strict comparison correctly flagged the live visit;
  separate activity review verifies its exact transition without weakening that check.
- Consistent local snapshots: work/{before,after}-audited-release-53986a3.sqlite.
  Post-publication Tigris backup completed 05:54:17.880 UTC, key
  `zforum/2026-11-04T05-53-51.179Z-c9d709c0-f293-414e-983c-408381626882.tar.gz`.
  Both database integrity/foreign-key checks pass. Deployment gate and five CPU-config
  tests pass; final Fly health check passes.
- Shared CPU staging caused intermittent health-check failures. Lowering publication
  priority to 19 was too aggressive; changed to 5. After confirmed commit, terminated
  only report generation (exit 143), waited for lock release, upgraded the Machine,
  then regenerated completed-run reports successfully on performance CPU. Do not
  rerun publication or models. A single-Machine code/CPU restart still briefly stops
  service; atomic content publication does not make that topology highly available.
- GitHub main already contains application code through 53986a3; CPU configuration
  and these final verification notes are being pushed in the current authorized task.
  User verification of the restored live page remains pending.

## Earlier preparation history — superseded by current production state above

## Future-pull savings implemented locally (D-123)

- Future defaults now freeze `summaryReusePolicy: unchanged-source-v1` and
  `batchRepairPolicy: invalid-posts-v1`. Unchanged complete source plus matching
  summary prompt reuses the checked published summary with its original generation
  provenance. New/edited/hidden/deleted source or changed thread metadata regenerates
  the full summary. Profile-only changes refresh account data without a summary call.
- Marks instructions clarify claim types and complete claim-preservation accounting.
  Correctly identified batches retain independently validated replies and retry only
  invalid records. Private repair checkpoints survive call-limit interruption/resume;
  malformed envelopes retain no records. Final combined validation stays strict and
  each post records the request that actually generated it. No model pilot was run:
  reduced first-pass rejection rate remains to be measured on a future real pull.
- Validated profile creation-date/visibility results are cached per frozen run,
  including resume and concurrent duplicates; errors are not cached. Later runs start
  fresh. Audits expose retained summaries, profile-cache hits/misses, requested/accepted
  reply numbers and records salvaged from rejected batches. Estimates omit retained
  work and do not treat small partial repairs as full-batch duration samples.
- **63 focused Node tests pass**: work/future-pull-optimization-tests.log. The real
  SQLite transfer test initially exposed an incomplete fixture copy (stored summary
  omitted); tracing confirmed the cause, fixture now copies it, and strict baseline
  comparison remains intact. Trace: work/summary-baseline-diagnosis.log.
- All **86 existing prepared candidates revalidated** with their frozen prompts;
  prepared bundle SHA remains **1617641640382cc3f89e357218f3cc8bc830414cae59980368fb4c58bf972684**.
  Non-fetch CLI stages and the private audited runner use active frozen settings,
  allowing the already-prepared import to publish without adopting new policies or
  rerunning models. No schema change, live write, deployment or push in this task.
- User asked why this took so long. Explained that partial-batch retries expanded
  the implementation/testing and gave a five-minute estimate for final checks/commit.
  Work is ready for review; no additional optimization work should delay delivery.

## Production incident: user objects to unreviewed live changes

- D-121/F-134: local pull's custom runner wrote four production restrictions via
  Fly SSH. This changed zcg, thread-55267 and thread-58733 to Original discussion
  mode, replacing titles and removing filters despite unchanged release IDs.
  User explicitly objects; explained the mistake. No repair has been applied.
- **No further production writes without explicit authorization.** Do not invoke
  a new fetch for the already prepared run. The production restriction hook has
  now been removed from work/run-audited-pull.mjs; it has no Fly/token access.
  The prior privacy exception is not permission to mutate live during staging.
  Diagnose/prepare locally only. Do not remove restrictions to restore the UI:
  doing so would re-expose newly hidden source and derived material.
- Fresh read-only comparison: featured prior title was “ZCG withdraws its taper as
  debate continues over funding, control, and adoption”; current title is “Original
  discussion”. Restricted featured posts are 58611/53 and 58656/190. Public snapshot
  work/live-visibility-investigation.json. All three release IDs remain unchanged.

## Prevention implemented locally: pulls cannot use production storage

- D-122: preparation now refuses production runtime (`FLY_APP_NAME`, production
  `NODE_ENV`, or `ZFORUM_ORIGIN`) and `/data` or `/app` paths, including resolved
  symlinks and hard-linked file aliases. Guard runs before CLI database creation,
  preparation-state writes and model authentication. Shared source/analysis entry
  points also enforce the runtime boundary. No override exists.
- Removed source-fetch restriction callback and import/legacy-refresh fetch-time
  server writes. Pulls record hidden/deleted/unavailable observations privately.
  `scripts/production-import` rejects fetch/analysis; only explicit stage/publish
  operations may touch production. Staging records private checkpoints/source
  history but leaves public releases and restrictions unchanged.
- `publish-import` now records hidden/removed post restrictions inside its existing
  atomic transaction; failure rolls back restrictions with releases/checkpoints.
  Restrictions continue to block unsafe rollback after successful publication.
  No schema or prepared-bundle change. No accepted model work invalidated.
- **Local changes only, not deployed or pushed.** The currently deployed image still
  contains the old production command. Do not use it to fetch; the next approved
  deployment must include these guards and publication changes. This is workflow
  enforcement, not an OS sandbox against arbitrary operator commands.
- Validation: 45 focused Node tests plus two relevant legacy tests, all 44 Rust
  tests, Clippy and release build pass. Generated tests cover hidden/deleted/removed
  combinations, interrupted/resumed preparation, aliases, production runtime refusal,
  atomic rollback and post-publication rollback protection. Logs:
  **work/preparation-isolation-{tests,legacy-tests,rust}.log**.
- Full 512 MiB-heap rehearsal with the existing frozen bundle also passes, on a
  separate copy: **work/rehearsals/optimized-C9Nb2Q/zforum.sqlite**. 86 topics /
  3,260 posts / five accounts, all 14 personal tables preserved. Commands were
  86 source-history records and one atomic publication; zero restrictions calls,
  fetches or models. Report **work/preparation-isolation-rehearsal.json**. Existing
  localhost preview remains on its prior DB; no production repair was applied.

## Ready for review: audited pull; do not publish or rerun analysis

- D-118/D-119: latest content and per-category/topic/attempt usage audits prepared
  autonomously while the user is away. User review is pending. No deployment,
  GitHub push or production content publication requested for this new work.
- **Review http://localhost:8001/** (featured topic: `/#/topic/zcg`). Preview has
  **86 topics / 3,260 posts**, zero unavailable topics and no privacy-review mode.
  All five prior localhost accounts and all 14 personal tables are preserved.
  Rendered screenshot inspected: **work/screenshots/audited-pull-preview.png**.
- Preview DB **work/rehearsals/optimized-EsEVCz/zforum.sqlite** is a published COPY
  of **work/previews/import-review-39574692.sqlite**, which remains preserved.
  Bounded server session **24886**, started about 04:08 UTC Nov 4 for eight hours;
  log **work/audited-pull-preview-server.log**. If expired, restart from repo root:
  `timeout 8h server/target/release/zforum-server serve --site site --db work/rehearsals/optimized-EsEVCz/zforum.sqlite --port 8001 --host 127.0.0.1 --origin http://localhost:8001 --rp-id localhost --webauthn server/webauthn/target/release/zforum-webauthn`.
- Frozen run **ec5e8754-a8ba-486a-952d-be419bc7d522**, interval
  **2026-11-03T05:37:28.138Z → 2026-11-03T23:57:05.284Z** (five-minute overlap).
  Previous completed cutoff **2026-11-03T05:42:28.138Z**. Authoritative baseline
  **work/audited-pull-baseline-20261103.sqlite**; unpublished canonical draft
  **work/audited-pull-20261103.sqlite**. All 86 topics are analyzed/validated;
  draft run remains `running` because publication is pending, not because work is active.
- **Prepared bundle: work/audited-pull-prepared.json**, 122 MiB; SHA256
  **1617641640382cc3f89e357218f3cc8bc830414cae59980368fb4c58bf972684**.
  It carries content/artifacts only. Do not replace production SQLite or personal
  state. Do not refetch or rerun models to publish this frozen import.
- Content: **352 new-to-site posts / five edits / four unavailable observations**;
  **357 newly assessed replies / 2,893 unchanged assessments reused**. Twenty-one
  newly discovered threads were conservatively included as substantive/mixed, with
  reasons in **new-thread-review.json** for user review. Music 20456 remains excluded.
  Their histories account for 262 new assessments / 45 batches; existing topics
  account for the other 95 assessments / 24 batches.
- Audit: **175 application-level attempts**, **155 accepted** (86 summaries and
  69 reply batches), **19 rejected outputs subsequently corrected**, **one interrupted
  summary with unknown usage/time**. Known tokens: **3,494,329 input**, including
  **1,461,504 cached input**, and **814,079 output**. Summary category: 87 attempts,
  1,805,481 input / 718,080 cached / 245,211 output, 87.9 summed model minutes.
  Reply category: 88 attempts, 1,688,848 input / 743,424 cached / 568,868 output,
  196.0 summed model minutes. Summed model time overlaps concurrent work; it is
  not wall time. Operator chat/planning/code/manual review tokens are unavailable.
- Fetch took **19.0 minutes**, analysis observed wall time **222.8 minutes**.
  Initial analysis estimate was **138–426 minutes**; estimates are persisted before
  and during each pull. Initial process reached its 3h bound, then continuation
  finished at 04:00:21 UTC. No accepted work repeated. Historical interrupted
  attempt remains `running` in its old manifest but has no active process; aggregate
  audit reports it as incomplete/unknown. Initial stage timing includes startup
  and about 36 seconds of post-exit observation delay, explicitly labeled.
- Model is existing subscription-auth gpt-6.1-sol, maximum two parallel reply
  batches, up to eight replies per batch. Summaries remain fresh per topic/import.
  No prompt, cache identity, validation or summary-reuse policy changed this run.
- Canonical artifacts: **work/imports/ec5e8754-a8ba-486a-952d-be419bc7d522/**.
  Review **audit.txt**, **audit.json**, **audit.csv**, **audit-topics.csv**,
  **audit-events.json**, **preview.txt**, **preview.json**, **new-thread-review.json**
  and **optimization-findings.json**. Reports can regenerate without model calls.
- Measured next optimizations: 48 unchanged topics still received summaries,
  consuming 894,944 input / 131,744 output tokens and 47.3 sequential model minutes.
  Nineteen rejected outputs consumed 341,573 input / 167,668 output tokens and
  57.4 summed model minutes; mostly claim-accounting or invalid claim categories.
  Profiles made 751 requests for 400 unique URLs (351 repeats). All HTTP: 1,097
  requests, zero retries/429s. Consider unchanged-summary reuse, better structured
  output/targeted repair and per-pull profile caching after user review.
- Verification: all candidates validate, retained analyses/provenance/source/rendition
  versions match exactly, ten hidden posts are redacted, all prior 102 releases,
  450 renditions, 2,923 source revisions and 100 source pulls preserved. Five edits
  get new source versions. Schema remains 7; integrity/FKs pass. Evidence:
  **work/audited-pull-verification.json**, **work/audited-pull-history-audit.json**,
  **work/audited-pull-rehearsal.json**, **work/audited-pull-memory-rehearsal.json**,
  **work/audited-pull-http-audit.json**.
- **Deploy server precision fix e1e2cc8 before staging/publication on Fly.** A real
  rehearsal found one-ULP JSON timing drift; existing serde_json float_roundtrip
  feature fixes it without weakening equality, altering frozen artifacts, adding
  dependencies or changing schema. Fresh rehearsal passes with one atomic publication
  and all personal data unchanged. Failed diagnostic copy remains private.
- **D-120 / ad0d804 prepares 2 GiB Fly RAM and a 512 MiB Node heap; not applied live.**
  Full 512 MiB heap rehearsal passes: parent peak 782,272 KiB, publisher peak
  165,036 KiB; rendered site server uses 317,296 KiB. Current 1 GiB production lacks
  concurrent import/read headroom. Default heap rehearsal peaked at 1.24 GiB;
  384 MiB heap failed only in a disposable local test. No volume/schema change.
- Checks: **40 focused Node tests**, **43 Rust tests**, Clippy, release build,
  runtime smoke and full real-bundle publication rehearsals pass. Earlier broader
  refresh suite still has two baseline missing-archive-fixture failures for
  `archive/research-prototype/data/crawls/20261031T215141Z/manifest.json`.
  Logs **work/audited-pull-{final-node-tests,precision-tests,runtime-smoke}.log**.
- Production still serves **65 topics / 2,912 posts / zero unavailable**. Four newly
  unavailable source posts were immediately restricted during fetch (the old
  one-post checkpoint was partial). **thread-55267, thread-58733 and zcg** remain
  online in original-discussion/privacy-review mode until reviewed publication.
  No new content published, no live resize/deploy, no GitHub push this task.
- After user review: deploy current committed server/config (explicit 2 GiB target),
  transfer/stage the exact prepared bundle, verify current production personal-state
  backup, then publish the whole run atomically with the existing operator workflow.
  Preserve the live DB and volume. Scoped private preparation token expires no later
  than **2026-11-04T10:35:00Z**; never print it. Wrapper **work/fly-prepared.mjs**.
  Live code remains 67cc310; last pushed main was 4358d9b. Local commits await review.

## Latest: reviewed UI/account fixes deployed and pushed

- **Live at https://zenzcash.com**, verified 2026-11-03T22:50:45Z. Deployed code
  commit **67cc310**, image **registry.fly.io/zencash@sha256:4ed676d82680ab5e541bb67071a64f1e78976e154d6c5e2a95ad1ab3ffb7e23e**.
  Includes original-forum links, adjacent selection actions, Zenzcash metadata/name,
  alpha feedback notice, recovery-code visibility, explicit passkey dialogs,
  pending-login recovery fallback, and removal of manual browser-filter import.
- Same Machine **e823213f175598**, **sjc**, **1 GB**, same persistent volume
  **vol_vp2eyql6gdqxgjj4**. Schema remains **7**. No importer/model calls or data
  publication. Existing single-Machine deployment restarted for startup backup;
  final Fly health checks pass. All **65 topics / 2,912 posts** match the prior
  public catalog exactly; no unavailable topics. Reviewed live assets match repo
  bytes; auth RP/origin remains zenzcash.com, display name Zenzcash.
- Consistent pre/post snapshots prove **all 26 database tables identical**, including
  **four accounts / four credentials / 40 recovery codes**. Integrity/FKs pass.
  Private snapshots: **work/{before,after}-account-ui-67cc310.sqlite** and remote
  **/data/transfers/{before,after}-account-ui-67cc310.sqlite**. Audit:
  **work/account-ui-database-audit.json**; public audit **work/account-ui-live-audit.json**.
- Startup Tigris backup completed **2026-11-03T22:50:26.991Z**, key
  **zforum/2026-11-03T22-49-55.399Z-84d60bbf-d3ec-4a19-866c-7b8e3ecfde56.tar.gz**,
  SHA **b247768219d51e87fbebe9f488771bfe13af0f3e07caf337f6f56cd8664dedd8**.
- Deployment gate passes: 4 deployment + 21 importer tests, 41 Rust tests, Clippy,
  release builds and runtime smoke. UI/passkey browser suites passed before deploy.
  Logs: **work/account-ui-{deploy-gate,image-build,live-deploy,startup}.log**.
- Code pushed to **origin/main**, github.com/ml-sudocode/zforum. This deployment
  record is included in the final documentation push. Scoped token stays private in
  the existing ignored token file; conservative deadline **2026-11-04T10:35:00Z**,
  metadata **work/fly-account-ui-auth.json**. Never print or commit token contents.

## Historical preparation: passkey flow fixes before deployment

- **User confirmed the passkey/recovery fix works.** D-116 removes the unwanted
  manual browser-filter import button and its unused client handler. Normal
  signed-in filter saving/sync remains. These edits are local and not deployed.
- **D-114/D-115 follow-up:** user still saw no native prompt; recovery button was
  greyed out. Found the concrete cause missed by virtual-authenticator success:
  webauthn-rs emits `mediation: conditional`, for autofill, but this UI has no
  autofill field. Button login/re-verification now explicitly passes `required`.
  The pending-login recovery button is now **Cancel sign-in and recover**, aborting
  and awaiting the old request before beginning recovery. Final verification stays
  non-interruptible. Do not misattribute this report to the localhost RP distinction.
- 22 focused/deployment tests plus both bounded browser suites pass, including an
  assertion of actual native API mediation, pending-login→recovery with a real
  saved code, duplicate clicks, late cancellation and protected final verification.
  Logs **work/passkey-dialog-{tests,browser,regression}.log**. Browser access host
  is unavailable; the user subsequently confirmed the flow works (D-116).
- D-113/F-118: recovery codes now appear at the top immediately and remain available
  after profile-load failure. Download is above the codes. Passkey requests are
  serialized across rerenders, with explicit browser-prompt status, cancellation,
  two-minute start/prompt timeout and retry/recovery guidance. Navigating away
  cancels a pending prompt. Final server verification cannot be cancelled.
- User reports the problem on **localhost:8001**. Clean registration/login succeeded
  before changes with the real verifier; no backend cryptography or DB change was
  needed. Preview UI now explains that production passkeys cannot sign in locally.
  Use a localhost test account; the copied production accounts are separate.
- Eighteen focused/deployment tests and complete existing Chrome UI regression pass.
  **node tests/browser.mjs --passkeys** now exercises actual browser WebAuthn with
  a virtual authenticator and the real verifier, in a disposable DB: enrollment,
  returning login, second key, recovery, code replacement/reuse rejection, revoked
  key rejection, concurrent clicks/cancel/navigation, and slow/failed profile loads.
  Tests share the bounded browser harness. Physical device/password-manager behavior
  was subsequently confirmed working by the user (D-116).
- Screenshots inspected: **work/screenshots/passkey-waiting.png**,
  **passkey-recovery-desktop.png**, **passkey-recovery-mobile.png**. Logs:
  **work/passkey-unit-tests.log**, **work/passkey-browser.log**,
  **work/passkey-ui-regression.log**. Preview below serves the new files; healthz OK.
- These changes and the previous alpha presentation changes remain **not deployed**.
  No production account, database, import, or Fly resource was modified.

## Previous: Zenzcash alpha UI changes ready for review, not deployed

- D-111/D-112: labeled original-forum links on nonhidden posts; one group containing
  Listen / Export / Copy prompt / Copy links; Zenzcash branding throughout public
  text and passkey display name; exact requested social-sharing title; alpha notice
  with forum DM links to sudo_ml and earthrise. No import/database changes.
- Verified 24 focused tests, complete bounded desktop/mobile Chrome regression and
  runtime/passkey smoke. Screenshots **work/screenshots/zenzcash-alpha-home.png**,
  **zenzcash-actions-desktop.png**, **zenzcash-actions-mobile.png** inspected.
- Preview **http://localhost:8001/** uses **work/previews/import-review-39574692.sqlite**,
  separate from production and audit DBs, with a four-hour server bound (session 93830).
  Reload to see these edits. Preserve review-before-deployment workflow.
- Production remains the verified deployment below. A new image is required to deploy
  these UI/auth-display changes. No model calls or content republishing are needed.
  The prior bounded Fly token's conservative deadline has passed; check app access
  and refresh scoped credentials if required before the next deployment.

## Live: reviewed import deployed and published

- User reviewed the local preview and explicitly authorized deployment. **The new
  code and all 65 topics / 2,912 posts are live at https://zenzcash.com.** Import
  **39574692-e798-4ae6-a679-7e72019917b5** completed atomically; recorded publication
  time **2026-11-03T17:58:55.343Z**, cutoff **2026-11-03T05:42:28.138Z**. No active
  production import remains. Do not stage/publish the same prepared bundle again.
- Existing Machine **e823213f175598**, region **sjc**, now **1 GB RAM**, same mounted
  volume **vol_vp2eyql6gdqxgjj4** and live SQLite. Image digest
  **sha256:1f95cc1e1ab066abc854770fde0eff2033b8dc9fc27f30943f4db3af35951a68**.
  Startup migrated schema **5→7** after its normal backup. No database replacement.
- Verified public health 200, all **65 release IDs exactly match the reviewed
  rehearsal**, 2,912 posts, ten hidden posts with source/analysis excluded, no
  unavailable topics. During staging, the old 32 topics stayed available.
  **work/optimized-live-public-audit.json** records the public verification.
- Fresh before/after consistent production backups prove **all 14 personal tables
  byte-for-byte identical in their rows**, including three accounts/passkeys. All
  previous releases, renditions, source revisions and pulls preserved; integrity/FKs
  pass. **work/optimized-live-database-audit.json**. Remote snapshots:
  **/data/transfers/before-optimized-deploy-39574692.sqlite** and
  **/data/transfers/after-optimized-deploy-39574692.sqlite**; private local copies
  **work/before-optimized-live-deploy.sqlite**, **work/after-optimized-live-deploy.sqlite**.
- Deployment logs: **work/optimized-live-deploy.log**, **work/optimized-live-stage.log**,
  **work/optimized-live-publish.log**. Detailed stage/publish logs are in
  **/data/transfers/optimized-39574692-stage.log** and **optimized-39574692-publish.log**.
  No additional model calls or forum fetches were performed during deployment.
- Fresh **Tigris off-volume backup completed 2026-11-03T18:05:11.121Z**, containing
  schema 7 / 65 topics / 2,912 posts / three accounts. Object key
  **zforum/2026-11-03T18-01-45.182Z-12113f2a-06a1-40ca-b485-431bb50e1868.tar.gz**,
  SHA **73f6af36c69276246f6e31be95911deb41bc7da25f87953e441a9518868e2d17**.
  **work/optimized-live-off-volume-backup.log**. Normal hourly backups continue.
- Future imports start from production, preserve unchanged reply analyses, stage
  new-thread scope decisions before paid analysis, and publish complete updates in
  one transaction. Keep auth/clock preflight and the 1-GB memory requirement below.
  The local draft intentionally remains unpublished; production is authoritative.

## Historical checkpoint: preparation and successful rehearsal

- **Preparation is finished. No model jobs remain. No new code or full import has
  been deployed/published.** Continue from this section; older checkpoints are history.
  The featured topic remains online on its checked privacy-repair release.
- Prepared content **work/optimized-prepared.json**, 101,650,001 bytes, SHA-256
  **ce5b0a50d6b133a75a3e1bd822ceb109a30b3d8e7a3a45e6a9e8cbce3dd0b9f9**.
  Run **39574692-e798-4ae6-a679-7e72019917b5** is fully analyzed and unpublished in
  **work/optimized-import.sqlite**. Worker 62614 exited successfully; do not resume
  analysis or rerun accepted outputs. Review **work/imports/RUN/preview.json** and
  **preview.txt**, replacing RUN with that UUID.
- **65 topics / 2,912 posts / 2,902 visible**. Retained **2,183** accepted reply
  analyses with original provenance; analyzed **717 new replies + two edits** in
  **123 batches**, plus **65 fresh full-discussion summaries**. Music 20456 excluded;
  frivolous review applies to future new threads only, no paid classifier call.
- Final audit **work/optimized-audit-summary.json** passes all candidates, retained
  analyses/provenance, 14 personal tables and SQLite integrity/FKs. Main import:
  **211 recorded attempts (188 accepted, 23 rejected), plus three calls with unknown
  usage**; **4,341,439 input (1,798,272 cached)/1,272,841 output tokens**. Separate
  earlier privacy repair: one call, 111,382 input (8,448 cached)/7,977 output. Do not
  present clock-step-inflated elapsed fields as compute time; clock audit below.
- **Full rehearsal passed**, on a fresh production copy with **three accounts**:
  **work/optimized-rehearsal.json**, **work/optimized-rehearsal-800m.log**. Schema
  **5→7**, 65 topics/2,912 posts, all 14 personal tables preserved, exactly **one
  publish-import** and no per-topic publication; staging did not change releases or
  cutoff. **work/optimized-history-audit.json** preserves all old releases/renditions/
  source history, 2,183 source and rendition identities, two edited revisions and
  hidden-source exclusion. All tests used disposable DBs and no model/network calls.
- **fly.toml now specifies 1 GB**: no-swap 400-MB scope failed; an 800-MB scope and
  512-MB Node heap passed, with **604,492 KiB peak Node RSS**. Validated Fly config.
  Production remains 512 MB until deployment. No image rebuild needed for VM sizing.
- Built image **registry.fly.io/zencash:importer-0aab249**, immutable digest
  **sha256:1f95cc1e1ab066abc854770fde0eff2033b8dc9fc27f30943f4db3af35951a68**,
  251 MB, executable source **0aab249**. Later changes are docs and VM sizing only.
  **work/final-import-fly-alternate-build.log**; supported --depot=false succeeded.
- Gates: **21 importer tests**, **41 Rust tests/clippy**, deployment/runtime smoke and
  desktop/mobile browser regressions pass. Full Node: **146 pass, two pre-existing
  missing historical archive fixture failures**; no assertion weakening.
- Scoped Fly token is private at **work/fly-zencash-preparation.token** (0600), passed
  only by **node work/fly-prepared.mjs ARGS**. Never print/commit it. Clock corrected,
  status and SSH pass. Conservative token deadline **2026-11-03T21:18:35.239Z**;
  recheck status/SSH/expiry before deployment, renew upfront if insufficient.
- Next deployment (after review): verify one existing Machine/no import lock; deploy
  the immutable image with **--ha=false --strategy rolling** using current fly.toml
  (1 GB), then upload the JSON bundle as **/data/transfers/optimized-39574692.json**
  as zforum and verify its SHA. Use **NODE_OPTIONS=--max-old-space-size=512** with
  **/app/scripts/production-import stage FILE**, inspect **preview**, then **publish**
  for the single atomic content switch. Startup backup precedes schema migration.
  Preserve the live SQLite volume and all accounts; never upload/replace it with a
  draft DB. Single-Machine code rollout can restart the service; atomic imports keep
  the previous readable content until the complete new release commits.

## Historical checkpoint: clock correction and successful image build

- **Clock corrected by user:** `sudo chronyc makestep`, measured step
  **22,819.585794 seconds**, journal 2026-11-03T16:26:17Z. System UTC now agrees with
  HTTPS Date; Chrony reports zero offset. Scoped Fly status and SSH rechecked at
  16:27Z and work. Private **work/optimized-clock-audit.json** records the exact
  correction and affected Zkool summary's raw duration (22,969,349 ms; subtracting
  the step gives ~149,763 ms). Keep raw historical observations; do not present
  elapsed values spanning the step as actual compute time. Token usage is unaffected.
  Current model work: **61/65 topics**, Zkool summary accepted and reply batches
  running. Future-thread/NFT/moderation/ZCG reuse rules unchanged.
- **Build blocker resolved using Fly's supported alternate builder**, with scoped
  authentication and TLS enabled. **registry.fly.io/zencash:importer-0aab249**,
  digest **sha256:1f95cc1e1ab066abc854770fde0eff2033b8dc9fc27f30943f4db3af35951a68**,
  251 MB. **work/final-import-fly-alternate-build.log**. No production deployment.
  Do not rebuild executable code unnecessarily; subsequent commits are docs only.
  Clock correction is still requested for host correctness, but image preparation
  is no longer blocked. The instructions below describe the first build failure.

- **Read this before older checkpoints.** Code/gates below are complete through
  **0aab249**; later commits document auth/clock preflight only. No new code or full
  content deployment yet. App-only 12-hour token exists privately, mode 0600, at
  **work/fly-zencash-preparation.token**. Never print it. Use
  **node work/fly-prepared.mjs ARGS** for Fly operations; it passes the token only in
  the subprocess environment. Status and SSH succeeded after the user's second login.
- **Host clock is wrong.** Chrony reports ~22,956 seconds slow of authenticated NTP;
  independent HTTPS Date headers agree. Remote build-only failed with certificate
  not-yet-valid, not an application build error. sudo needs an administrator password.
  Asked user asynchronously to run **sudo chronyc makestep** and reply done. Never
  disable TLS. Check chronyc tracking/date, recheck scoped access, then retry build-only:
  `node work/fly-prepared.mjs deploy --build-only --remote-only --push --ha=false --image-label importer-0aab249`.
  The first failed build log is **work/final-import-fly-build.log**. Original scoped
  token metadata **work/fly-preparation-auth.json** uses uncorrected host timestamps;
  its conservative expiry must be rechecked after clock correction. Login/expiry
  connection to skew is plausible, not proven.
- **Import remains active: session 41427/PID 62614**, same frozen run below, two workers.
  Latest validated audit: **59/65 topics**, **53 model jobs remaining**, 149 completed
  attempts (14 rejected), known **2,804,635 input (1,259,008 cached)/785,711 output**.
  Three additional timeout/interruption calls have unknown usage. Progress advances;
  use **node work/optimized-progress.mjs**. All 2,183 retained replies/provenance and
  14 personal tables checked; integrity/FKs pass. Do not rerun accepted model work.
- Fresh consistent production copy already downloaded:
  **work/optimized-final-production.sqlite**, schema 5, 32 topics/2,197 posts/**3 accounts**,
  repaired zcg release 335f1e45..., no active import, cutoff 2026-11-02T02:15:39.347Z.
  SHA **485b2c8b7bbda3c36e7a5f9a32616c991fdb936f09a097718d6f3d19268538ea**.
  Remote copy **/data/transfers/optimized-final-baseline-v1.sqlite**. All 65 baseline
  releases match. Rehearsal helper now already handles schema-7 migration, one atomic
  publish-import, and import_thread_reviews; older instructions to update it are stale.
- Remaining: finish model jobs, audit clock effects on timestamps/durations without
  inventing corrected historical times or invalidating accepted outputs; export bundle,
  run **work/rehearse-optimized-import.mjs BUNDLE work/optimized-final-production.sqlite**
  under a 400-MB user scope/256-MB Node heap if possible, audit preserved source/rendition
  history with **work/audit-optimized-history.mjs** against that same fresh baseline,
  finish build-only image, record bundle/image digest and reviewable deployment steps.
  Keep the existing conservative frozen cutoff unless a justified change is recorded;
  discovery included after-cutoff activity, so the next run's overlap safely revisits it.
  No production database replacement and no full-content publication during preparation.

## Historical checkpoint: code ready, import analyzing, featured topic restored

Historical details only; use the ready checkpoint above for current actions.

- Continue the authorized full import and prepare deployment; **do not publish new
  import content to production yet**. Full filesystem/network access; approval never;
  never pass sandbox_permissions. User dislikes repeated confirmation prompts. Only
  request missing external authentication when necessary. No subagents authorized.
- Active run **39574692-e798-4ae6-a679-7e72019917b5** in private
  **work/optimized-import.sqlite**, based on original consistent production backup
  **work/optimized-baseline.sqlite**. Window **2026-11-02T02:10:39.347Z →
  2026-11-03T05:42:28.138Z**. Never replace the production SQLite file with a local copy.
- Music thread **20456 is explicitly excluded** from this run and future discovery.
  No model analysis of it ran. Original fetch artifacts remain private. Revised plan:
  **65 topics, 2,912 posts/2,902 visible, 2,183 retained replies, 717 new replies/two
  edits (719 targets), 65 fresh summaries/123 reply batches = 188 initial model jobs**.
  The exclusion avoids 130 calls/1,024 reply analyses. Do not re-triage other current
  threads; user says apply frivolous-thread review only to future new threads.
- Actual analysis running in exec session **41427**, PID **62614**, 250-call allowance,
  two workers. **work/optimized-analysis.log**. Current checkpoint: **53/65 topics**,
  111 completed attempts (nine rejected/corrected), 1,856,165 input tokens including
  937,984 cached / 438,259 output. Large first-time histories still remain. User asks
  frequent ETA/cost questions; be candid, count actual replies/jobs rather than treating
  topics equally. Last estimate given: 2–3 hours overall at 08:12Z, code 30–45 minutes.
- Runner **work/run-optimized-import.mjs** supports fetch/preview/analyze on that draft.
  Resume only if stopped, under flock: `node work/run-optimized-import.mjs analyze N`.
  Keep accepted artifacts; never rerun unchanged accepted reply analyses. One model
  call timed out at 900s (retry succeeded), and two maintenance interruptions had
  unknown usage. The audit counts these separately. One reply batch can include up
  to eight targets; every per-post reuse log entry is NOT a model call.
- Featured **zcg is restored publicly**, release
  **335f1e45a23ecd3ac60a966f46d7feddd8bdcda5099c807afdbfd271cfa73f17**. Verified
  2026-11-03T07:16:04.555Z: health/topic 200, all 32 topics available; original zcg
  499 posts/488 visible, six newly hidden replies protected. Three live accounts
  preserved. Only a privacy repair of old published source was applied (D-101).
  Logs **work/featured-privacy-publish.log**, **work/featured-privacy-live-verification.json**.
  Backup on Fly **/data/transfers/featured-before-publish-20261103.sqlite**. Original
  live image remains the reading-fix image below, schema 5; no new code deployment yet.
- Full-run zcg baseline was amended BEFORE any zcg model work to match that repair,
  while fetched source hash stayed unchanged. **work/optimized-baseline-amendment.json**
  and **work/optimized-scope-amendment.json** document baseline/scope changes. Its
  current baseline comes from verified guarded rehearsal copy, same release hash as
  live. Do not rebase again. A fresh production copy is needed for final staging rehearsal.
- Implemented/tested source: **c776728** atomic all-topic/summary/completion transaction,
  **a0eab2e** original-only readable privacy projection + migration 6, **fe3d357**
  music exclusion/settings equality. Future-only new-thread review (D-104) is being
  committed now: schema 7 decision table; no classifier model call, only title/opening
  caps 180/600 chars, operator quick assessment then user-confirmed `fetch --review FILE`.
  Existing/current topics bypass it. New logs clearly label retained vs paid work.
- Gates: **21 importer tests**, **41 Rust tests/clippy**, full deployment/runtime smoke
  pass. Full Node **146 pass/two known historical refresh-fixture failures**. New
  original-only desktop/mobile browser regression passes and both screenshots were
  inspected. Logs **work/final-import-deploy-checks.log**, **work/final-import-node-gate.log**,
  **work/availability-browser.log**, **work/review-*.log**. No gate weakening.
- Old prepared images from aa6ee03 are **obsolete** (missing atomic/privacy/review
  changes). Build/push only a fresh image from final committed runtime source using
  `fly deploy --build-only --remote-only --push --ha=false`; do not deploy yet.
  Fly app authentication has intermittently returned unauthorized after identity checks
  succeed. User refreshed login once and repair worked. A later backup failed again;
  check **work/final-fly-access-check.log** before relying on app access. Do not print
  ~/.fly/config.yml or any token. No FLY_API_TOKEN override is set. CLI path ~/.fly/bin/fly.
- Remaining after analysis: audit actual source/provenance/usage with
  `node work/audit-optimized-import.mjs`; export via
  `node tools/import-transfer.mjs prepare work/optimized-prepared.json work/optimized-import.sqlite`.
  Obtain a fresh consistent production backup (three+ accounts, repaired zcg), then
  run `node --max-old-space-size=256 work/rehearse-optimized-import.mjs BUNDLE FRESH_DB`.
  Update that ignored rehearsal helper for **publish-import** (currently its expected
  command count still assumes per-topic publish) and include import_thread_reviews
  in mutable table allowlists. It must prove atomic local publication, all personal
  state retained, coverage/integrity and 512-MB Fly memory fit; never publish remotely.
  Then `node work/audit-optimized-history.mjs FRESH_DB` proves old history/source/
  rendition retention, two edited revisions and hidden-source exclusion. Record bundle
  SHA/image digest, final usage including repair's separate 111,382 input/7,977 output
  and three unknown-usage calls. Refresh handoff/deployment instructions and report ready.

## Historical checkpoint: featured repair before publication (resolved above)

- User asks why featured topic is offline. Six observed visibility restrictions
  triggered the existing whole-topic withholding policy, so zcg has been offline
  during preparation. Explained this and acknowledged the unintended availability
  impact. **D-101 authorizes a privacy repair of previously published content**;
  newly imported replies stay unpublished. Original optimized import continues.
- One checked fresh summary over the old published source with the six posts hidden
  is ready. All **488 remaining visible replies reuse their analyses**. Exactly the
  original **499 posts** remain; no newly fetched post or edit is published in this
  repair. Source timestamps remain original (no false new pull).
- Repair metadata **work/featured-privacy-repair.json**. Candidate
  **work/privacy-repairs/featured-MdiW12/candidate/site.json**. Expected original
  release **6d2b25859d541f19e3ed52637202a217f738ce5a3fe7b34fcdfe1e587dd66f44**;
  checked repaired release **335f1e45a23ecd3ac60a966f46d7feddd8bdcda5099c807afdbfd271cfa73f17**.
  Guarded candidate SHA is in **work/featured-privacy-guarded-rehearsal.json**.
- Both normal and guarded local publication rehearsals pass: 32 topics/2,197 posts/
  two accounts; protected 19 tables, import state and cutoff unchanged; integrity/FKs
  clean. Summary/source review completed. Model usage: **111,382 input (8,448 cached),
  7,977 output tokens**, one accepted call, 250 seconds. Count separately from main
  import usage; do not regenerate this accepted repair.
- **Fly currently rejects app operations with unauthorized.** Identity check works,
  but status/app list/backup fail. No FLY_API_TOKEN environment override exists.
  Config mtime 06:45:20Z; no credential contents were printed. Asked user asynchronously
  to run `/home/zenzcash/.fly/bin/fly auth login` for the account owning zencash, then
  reply. This is service authentication, not an agent approval prompt. User reply pending.
  Backup attempt **work/featured-backup.log** failed before file creation; source backup
  work/featured-before-repair.sqlite does not exist. Do not treat it as a valid backup.
- Apply when authentication works: upload candidate and **work/publish-featured-privacy.mjs**
  to unique files in /data/transfers as user zforum. Run under /data/work/import.lock:
  `node SCRIPT /data/zforum.sqlite CANDIDATE EXPECTED_RELEASE CANDIDATE_SHA /app/server/target/release/zforum-server UNIQUE_BACKUP_PATH`.
  The operator verifies exact checksum/release, no active production import and exact
  old post set/source (only the six restrictions change), backs up, then uses the real
  server publish. It was rehearsed on a separate baseline copy. No code deployment
  is required for this repair. Verify public zcg/catalog/health and hidden text exclusion.
- After restoration, amend ONLY the **unstarted zcg** candidate in the full draft run
  under its import lock: baseline_release and snapshot.analysisBaseline must match the
  repaired published release; previousSummary should use the repaired summary; recompute
  snapshot_sha256/jobs. Preserve source .threads, source_sha256, window and every other
  candidate. Assert no zcg candidate/model job exists before amending; record hashes.
  The main analyzer holds state in memory: stop it safely before changing that state,
  then resume using cached work. Otherwise stale in-memory saves overwrite amendments.
  Leave the immutable original production baseline file alone. Stage final full bundle
  against a fresh production copy reflecting the repaired release/personal state.

## Historical checkpoint: optimized import before music exclusion

- User authorized implementation/tests and the actual import since the completed
  production cutoff, with no further stage confirmations. Full host access is active;
  approval policy is never. Do not pass sandbox_permissions in tool calls.
- Runtime source **aa6ee03** implements reply-reuse-v1 and prepared-content staging.
  One fresh full-context summary per imported topic/run; retain unchanged replies and
  original provenance, analyze only new/edited content. Schema stays 5. Production
  remains on the deployed reading-fix image below; personal state is authoritative.
- Consistent production baseline **work/optimized-baseline.sqlite**: 32 topics,
  2,197 posts, 2,191 visible, two accounts, no unfinished import. Private draft is
  **work/optimized-import.sqlite**. Never upload either SQLite file over production.
- Actual run **39574692-e798-4ae6-a679-7e72019917b5**, window
  **2026-11-02T02:10:39.347Z → 2026-11-03T05:42:28.138Z** (five-minute overlap).
  Discovery found 47 active threads; all 66 registered topics are reconciled, including
  existing quiet topics. Some new threads have substantial first-import histories.
- Fetch completed: **3,936 posts / 3,926 visible**. Plan retains **2,183 replies**;
  analyzes **1,741 new replies and two edits**, plus **66 fresh summaries**. There
  are **318 initial model jobs** (252 reply batches). Planned source input is 5.5 M
  characters against 100.7 M with the legacy plan (94% less; not measured tokens).
- Final source review caught Rust-vs-Node JSON object key ordering falsely classifying
  310 unchanged replies as edits. aa6ee03 uses structural equality and generated
  permutation tests. All sources stay frozen; no model call preceded the correction.
- Actual analysis running in exec session **86135**, PID 51405, **500-call allowance**,
  two workers. Log **work/optimized-analysis.log**. Ignored runner
  **work/run-optimized-import.mjs** uses the standard pipeline on the separate draft.
  Resume under flock with `node work/run-optimized-import.mjs analyze MAX_CALLS` if
  interrupted. Preserve completed candidates and attempts; no confirmation is needed.
- Six newly unavailable posts were restricted immediately on production:
  **58656/99, 58656/179, 58656/182, 58656/74, 58656/112, 58656/132**. Its existing
  visibility policy withholds zcg until a revised release is published. No new source
  content or analysis has been published; all personal state remains authoritative.
- Preview.txt/json and **optimized-audit.json** live in **work/imports/RUN/**. Ignored
  `node work/audit-optimized-import.mjs` rechecks candidates/original reply provenance,
  counts actual attempt tokens, compares all **14 non-content/import tables** and
  integrity/FKs, writing that audit. At the latest checkpoint: **28 topics validated,
  49 calls, three rejected attempts corrected on retry; 673,294 input tokens (409,728
  cached), 102,759 output tokens**. One later call (marks-58764-1-4) timed out after
  900 seconds with no result/usage. No provider cause was reported. Resumed the same
  frozen run; its accepted summary is cached. The audit counts this unknown-usage call
  separately; do not present known token totals as including it. Rerun after completion.
  Existing topics have 83 added replies/two edits; 34 first-import topics account for
  1,658 new replies. Large first-time histories are processed after the smaller topics.
- Seventeen importer tests and scripts/check-deploy.sh pass: deployment tests, Rust
  clippy/35 tests, verifier builds and runtime smoke. Full Node suite: **140 pass /
  two known missing historical refresh-fixture failures**. Logs optimized-*-checks,
  optimized-import-tests.log and optimized-node-gate.log. Security review of 5f009ba
  found no issue in path checks, argument-array subprocesses, candidate validation
  or separation from personal state. Git author/committer identity verified.
- Built/pushed aa6ee03 without deploying: **registry.fly.io/zencash:optimized-463-ready**,
  digest **sha256:fe220587ce5f04b5d8733592789d905166fb5c9907a7020a52894a38ec62f83b**,
  75 MB; runtime smoke passed in Docker. Build log **work/optimized-fly-build.log**.
- Remaining: finish/validate actual analysis, export prepared bundle with
  `node tools/import-transfer.mjs prepare work/optimized-prepared.json work/optimized-import.sqlite`.
  Rehearse with ignored `node --max-old-space-size=256 work/rehearse-optimized-import.mjs work/optimized-prepared.json`.
  It creates a new work/rehearsals/optimized-* database from production baseline,
  stages and locally publishes, audits all 14 non-content tables and coverage/integrity,
  and writes work/optimized-rehearsal.json with peak RSS. Check 512-MB Fly memory fit.
  Then run `node work/audit-optimized-history.mjs` to check append-only history,
  retained source/rendition versions, edited revisions and hidden text exclusion.
  For the strongest account-state proof, fetch a new consistent production backup and
  pass it as the rehearsal script's second argument (third process argv) and history
  audit's first argument. Neither script publishes to production. Prepare final deployment instructions and
  measured usage. D-100 does not authorize publishing content during preparation.
  Deploy supporting code before staging the bundle; stage checks cutoff, membership,
  frozen baselines and candidates, reconstructs checkpoints without network/models,
  and leaves publication/cutoff advancement to the explicit publish command.

## Current: three reading fixes live at https://zenzcash.com

- Refresh **https://zenzcash.com/**. Highlights and author identities no longer
  collapse. Hidden/unavailable profile ages are excluded unless **Include profiles
  with hidden age** is checked, even at Any account age. Guest actions explain
  sign-in before navigation and show the reason plus Back to reading on arrival.
- Preferences are now **version 7** with includeHiddenAge=false; supported older
  browser/account settings migrate. SQLite schema stays 5. Production frontend and
  server were deployed together from tested source 690e4d6.
- Local server was restarted in session **76068**, after creating
  work/backups/before-reading-v7.sqlite. No production data or import/model work.
- Verified: 23 logic / seven rendering / six account tests; Rust clippy and 35 tests;
  complete bounded Chrome regression including guest bookmark/pet sign-in context,
  return links, hidden-age control, account preference saves and scroll/focus.
  Desktop/mobile screenshots reading-* were visually inspected. Full Node gate is
  still 21 passing files / known missing historical refresh fixture failure.
- Browser harness now kills process groups and removes profiles asynchronously.
  Sidebar tooltip explanations overlay without shifting or blocking controls.
  User acceptance remains pending. Deployment used scripts/fly-deploy; the same
  Machine e823213f175598 and authoritative volume remain in service.
- Live Chrome verification passed: highlights are expanded; hidden-age opt-in
  increases the tested topic's matching count from 1,046 to 1,170; guest bookmark
  actions show the sign-in reason and Back to reading works. Live screenshot
  work/screenshots/reading-live.png was inspected. Evidence is in
  work/reading-live-verification.json and work/fly-reading-deploy.log.
- Database integrity/FKs pass with 32 topics, 2,197 posts and two accounts. Startup
  backup completed 2026-11-03T05:10:17.022Z; health is passing. Latest backup SHA-256:
  654181aa4e8a9064999aa17c28a4b2e58644ecf7b866f497b84209ce3ff0023e.

## Current: live at https://zenzcash.com

- App **zencash**, region **sjc** (USA), origin **https://zenzcash.com**, RP ID
  **zenzcash.com**. Fly's default hostname is zencash.fly.dev. CLI is installed and
  authenticated at `/home/zenzcash/.fly/bin/fly`; add that directory to PATH.
- Persistent encrypted volume **vol_vp2eyql6gdqxgjj4**, name **zforum_data**, 3 GB,
  14-day scheduled snapshots. It is **already seeded** at `/data/zforum.sqlite`:
  schema 5, **32 topics / 2,197 posts / 2 accounts**. `/data/work/imports` contains
  the frozen artifacts/cache. **Do not seed again or overwrite this database.**
- Private Tigris bucket **zencash-backups** exists. Credentials are Fly secrets;
  setup output is in private ignored `work/fly-storage-setup.log` (0600; do not print
  or commit it). A real backup was uploaded, downloaded, SHA-256 verified and restored
  to a disposable directory, with clean integrity/FKs and matching counts.
- Local seed: `work/backups/fly-seed-PNL4ty/`, including SQLite, imports.tar.gz,
  manifest and table audit. SHA-256:
  `63b60f9577f81c91e9b2070208def9d1d10fd13fce302949d2faf5899b13dfed`.
  All 25 local tables matched the seed at the final comparison. Original ZIP and
  local live database/server were preserved. No forum import or model call ran.
- Current image: **registry.fly.io/zencash:deployment-01M6FWWVEA327JE69QM1YYZXEF**
  (75 MB). Docker builds from source only, includes both Rust binaries, runtime
  contract and Node operator/backup tools, and runs the runtime smoke test during build.
  The production supervisor was also tested privately on the actual seeded volume:
  startup backup succeeded, health returned OK, bounded SIGINT shutdown exited 0.
- Temporary Machine **48e6396a5792e8** was used only for seeding/verification with no
  public services. It has been destroyed. Production now runs one Machine,
  **e823213f175598**, in sjc, attached to the seeded volume; its health check passes.
  Public launch is verified; real production passkey use and user acceptance remain
  pending. Existing localhost credentials cannot sign in on
  zenzcash.com; retained recovery codes can establish a production passkey.
- DNS requested: **A @ → 66.241.124.216**, **AAAA @ → 2a09:8280:1::1e1:b05a:0**.
  The final `fly certs check zenzcash.com` reports **Issued / verified and active**
  (Let's Encrypt). The www hostname is not configured.
- User authorized launch with “ok deploy it”. Deployed the reviewed image by digest
  `sha256:143f761fe1d55439133b3dfcfded82deb71afd0735dc9f8687f59281b39b7578`,
  with --ha=false and rolling strategy. Keep exactly one Machine; later code deploys
  use `scripts/fly-deploy`. **Production is now authoritative.**
- Public HTTPS home/health, all 32 topic endpoints and seed release identities pass.
  Public data contains 2,197 posts, with all six hidden posts exposing no source or
  analysis text. Private DB/contract/work paths return 404; HTTP redirects to HTTPS.
  `/api/me` reports the correct origin and available passkeys. A real production
  registration challenge returns RP zenzcash.com and a Secure/HttpOnly cookie; no
  account was created. SQLite integrity/FKs pass; counts remain 32/2,197/two accounts.
- Startup backup completed at **2026-11-03T04:44:42.825Z**, object
  `zforum/2026-11-03T04-44-27.841Z-162852c9-38dd-4f18-9e0d-7d0dee99c546.tar.gz`,
  SHA-256 `dfae9f01ad1f1a94852b7e2a564c7efb1dca2ec225327aaa0031e0911ad60c21`.
  Hourly backups are scheduled by the running supervisor. A first health failure
  during the startup backup resolved when the server started; final Fly check passes.
  Evidence: private `work/fly-launch.log` and `work/fly-launch-verification.json`.
- `scripts/check-deploy.sh` passes: four deployment tests, 13 import tests, all
  35 Rust tests, clippy, verifier build, and HTTP/passkey/restart smoke. The final
  transfer regression expands import coverage to 14 passing tests. Full Node
  gate remains **21 passing files / one pre-existing refresh failure**; historical
  data build still lacks the research manifest. Do not claim the full gate is green.
  Logs are in `work/fly-*-checks.log`, `work/fly-node-tests.log`, and build logs.
- README's Fly section documents seeding, backups/restores, and reviewed production
  updates: fetch on Fly, transfer public source artifacts, analyze locally with an
  explicit call allowance, receive/validate on Fly, then explicitly publish. Do not
  use the local DB as a later production replacement. Hourly backups are configured;
  there is no automatic content updater. Monitor backup failures and age of
  `/data/backups/latest.json`; Tigris retention is manual until a policy is chosen.

## Current: fetch/preview trial ready for review

- `scripts/zforum import` now **fetches and previews only**. Follow with explicit
  `import analyze --max-calls N`, review its candidate preview, then `import publish`.
  `import preview` reprints the frozen run using a read-only DB connection. No
  automatic analysis/publication or scheduler. README and SPEC §14 document the change.
- Real scoped trial: Zebra thread 58723, copied DB
  `work/previews/zebra-20261102.sqlite`, run `dd282490-7f7e-4a65-a157-7152f6acb0e4`.
  Fetch completed after the outer sandbox's DNS restriction was lifted. Two visible
  posts, one new reply (“Fully support this! 👍”), zero edits/unavailable posts.
  Two planned jobs: summary cache miss (17,956 prompt characters); marks cache and
  final size depend on the accepted summary. Zero model calls and no publication.
- Review `work/imports/dd282490-7f7e-4a65-a157-7152f6acb0e4/preview.txt` (quick scan)
  or `preview.json` (full details). Reprint with
  `scripts/zforum import preview --db work/previews/zebra-20261102.sqlite`.
  The next optional trial stage is
  `scripts/zforum import analyze --max-calls 2 --db work/previews/zebra-20261102.sqlite`.
  Keep `--db` on every trial command. Stop for user review before analysis/push.
- All nine audited live content/checkpoint tables match their pre-trial hashes;
  copied DB integrity/FK checks pass. Scoped completion cannot advance full coverage.
  Analysis allowances cover all topics, retries and concurrent calls per invocation.
  Publication validates all remaining candidates first and rejects intervening release
  changes while permitting recovery after an already-published matching candidate.
- Twelve import tests pass, including stage separation, cache/prompt preview accuracy,
  call limits, scope/coverage, retry preservation, tampering and stale publications.
  Rust clippy and all 34 Rust tests pass. Full Node gate: 20 passing files and the
  previously known refresh fixture failure; missing historical rebuild data remains.
  The application server remains running; no restart was needed. User review pending.

## Current: sun/moon theme control

- Refresh http://localhost:8000/ to load the header icon. Moon switches to dark,
  sun to light. It follows the system until a choice is made, then remembers the
  choice locally. No server restart, database change or forum import is required.
- Eight focused theme tests pass, including both system preferences, both saved
  choices, repeated toggles, accessible action labels, invalid storage and storage
  failures. Chrome assertions pass for keyboard activation, actual palette colors,
  persistence across reloads, scroll/focus and desktop/mobile hit targets. All four
  theme screenshots were visually inspected. Browser cleanup initially hit an
  ENOTEMPTY race; with bounded removal retries the complete browser run exits 0.
- Full Node run: 20 passing test files and the existing refresh.test.mjs failure.
  Direct diagnosis confirms two refresh cases need the missing research manifest.
  The historical fixture issue below still prevents a green full gate.
- User also asked how to refresh before Fly deployment and about daily manual
  updates. The existing command is `scripts/zforum import` (no timestamp); it
  resumes or updates from the completed cutoff, currently 2026-11-02T02:15:39.347Z,
  with five minutes overlap. Node, release binary, flock, bubblewrap and ChatGPT
  subscription authentication are present. The isolated CLI version check passes
  outside the outer tool sandbox (codex-cli 0.166.0). No pull or schedule was started.
  When deploying, run updates against the authoritative production database;
  do not overwrite it with a local copy after readers begin using it.

## Running here: http://localhost:8000/

- The restored application is running for user review in exec session **42981**.
  Node is v22.22.1; Rust/Cargo are 1.99.1 installed through rustup. Cargo downloads
  are cached in `work/cargo-cache` (`CARGO_HOME` for these builds).
- Application release build and `scripts/build-auth.sh` succeeded, including
  verifier clippy and its test target (zero tests). HTTP checks passed for the
  homepage, the 32-topic catalog and funding topic; `/api/me` reports passkeys
  available. Physical authenticator behavior and user acceptance remain unverified.
- Backup before startup: `work/backups/before-local-start-20261102.sqlite`, with
  successful integrity/foreign-key checks. No source import or model call ran.
- The transfer lacks `archive/research-prototype/data/crawls/20261031T215141Z/manifest.json`.
  `node tools/build.mjs` fails on that missing historical fixture; the Node run
  reports 19 passing test files and one failing file (`refresh.test.mjs`). The
  full gate is not green. Do not weaken tests or regenerate content to hide this.
- Started the built server directly using the transferred generated site data:
  `server/target/release/zforum-server serve --site site --db work/zforum.sqlite --port 8000 --origin http://localhost:8000 --rp-id localhost --webauthn server/webauthn/target/release/zforum-webauthn`.
  `scripts/serve.sh` still requires the missing historical fixture for its rebuild.

## Current environment: Linux checkout restored; Fly.io selected

- Continue development in `/home/zenzcash/zforum`. Fly.io is the chosen future
  deployment target; no deployment configuration or public launch exists yet.
- Extracted the complete ZIP to `work/transfer-20261102/zforum/`. Its `TRANSFER.txt`
  supplements the archived handoff: the source server was stopped before packaging.
  All running-server/session statements below refer to the previous environment.
- All 1,804 manifest-listed payloads passed SHA-256 and size checks. The manifest
  does not hash itself or `TRANSFER.txt`. All 260 existing source files matched the
  archive before documentation updates. Restored missing `work/` and `site/data/`
  without replacing existing files; the original ZIP and extraction remain private,
  ignored local artifacts.
- `work/zforum.sqlite` is authoritative here: 32 topics, 2,197 posts, one account,
  and one completed import. SQLite integrity is OK, foreign-key checks are clean,
  and database bytes match the archive. Database permissions are 0600.
  Preserve accounts, import cache/checkpoints and grouping artifacts. No import ran.
- At restoration, Node.js, Cargo and Fly CLI were absent from the shell PATH. Application
  tests/builds have not been rerun here; historical gate results below are not
  validation of this machine. No development server has been started here.
- Next: provision Node with `node:sqlite` support and Rust, run the application gate
  and build the WebAuthn verifier, then verify local browsing. Prepare Fly packaging,
  network binding (currently hardcoded localhost), durable SQLite storage/backups,
  and the production HTTPS origin/RP domain. Existing localhost passkeys cannot
  authenticate against a different RP ID. Keep one authoritative database when
  production begins; do not replace production state with later local copies.

## Current: filter and Topics return scroll fixed (D-88)

- Refresh **http://localhost:8000/** to load the updated JS. The existing server is
  still running; no restart, import or database change was needed.
- Same-page redraws retain the reading panel's scroll, document scroll and focus.
  All topics, header Topics and browser Back restore the directory position and
  focused card within the current loaded app session. Existing deep links still work.
- Chrome reproduced the original failures on live data: sidebar 655 → 0 pixels and
  directory 4,142 → 0. After the fix both retain their exact previous offsets.
- Extended `tests/browser.mjs` checks both directions of all five highlight toggles
  with real mouse events, exact window/panel/control positions, focus and disclosure
  state; desktop/mobile returns through all three navigation paths. Single-topic and
  four-topic runs pass, as do 116 Node tests, 34 Rust tests, clippy and data build.
  Screenshots in `work/screenshots/batch006-*` inspected. User acceptance pending.
- Mind-change ratings follow-up answered: enable Reading filters → Highlights and
  author identities → Show mind-change ratings. Signed-in readers see the controls
  and counts above each post summary; guests currently see only a sign-in message.
  No change to ratings behavior in this batch.
- Prompt: `agent-prompts/006-preserve-reading-and-directory-position.md`; SPEC §20.

## Previous: six funding threads grouped, with two explicitly imported (D-86–D-87)

- Review **http://localhost:8000/#/topic/zcg**. Suggested working title is **The future of
  Zcash funding**. It contains 58515, 58566, 58571, 58610, 58611 and 58656: **499 regular
  posts, 494 visible**. The existing Featured Topics configuration now displays it.
- Only missing threads **58571 (21 posts)** and **58610 (24 posts)** were fetched. Their
  source text/metadata matches the backup exactly, allowing assessment reuse. The four
  newer imported histories were preserved. No general importer or wider date-window run.
- Live catalog is **32 topics / 2,197 regular posts**. All 31 unrelated topics and existing
  post/re-write/import identities are intact. Original assessment question context stays
  per-thread; a new checked summary covers the combined topic. One summary call used
  111,535 input tokens (8,448 cached), 9,590 output tokens. No API-key billing was used.
- Source pull times are retained individually. What's new uses the earliest included
  pull until a full group refresh; a disclosure explains this. Grouping does not claim
  that the four existing threads were fetched again. Future imports retain this explicit
  membership. Old `thread-ID` topic/post links resolve into the combined topic.
- Backed up to `work/backups/zforum-before-six-thread-group-20261102.sqlite`, rehearsed
  and atomically published. Release:
  `6d2b25859d541f19e3ed52637202a217f738ce5a3fe7b34fcdfe1e587dd66f44`.
  Private frozen sources, summary and merge inputs plus rehearsal/live/checkpoint audits
  are in `work/groups/zcg-six/`. Initial publication preserved all 17 unaffected tables;
  subsequent visit activity advanced only accounts.last_visit and visits.active, which
  were retained. Other personal columns, credentials/recovery, bookmarks and feedback match.
- **116 Node tests**, **34 Rust tests** (full 33-test gate plus the added focused test),
  clippy and deterministic build pass. Live Chrome checked all six source links, both
  imported originals, old deep links, the single featured card and desktop/mobile layouts.
  Screenshots were visually inspected. Integrity/FK checks pass; stored source hashing
  remains consistent through exact JSON checkpoint preservation. User acceptance pending.
- See `agent-prompts/005-explicit-topic-grouping.md`, SPEC §19 and the local `merge`
  command. No server restart was needed; existing server session **34610** remains running.
  Never restore the old database to change membership or redo the completed import.

## Previous: initial 24-hour import published; user review pending

Review at **http://localhost:8000/#/topics**. Server session **34610** remains running.
The importer finished successfully; do not run it again without a new update request.
No one-week expansion or public deployment occurred. The user asked about dropping
incomplete threads; none remained by then, so completed content was retained.

- Window: **2026-11-01T02:15:39Z through 2026-11-02T02:15:39.347Z**. Full histories of
  **35 active threads**, each its own topic: **2,152 regular posts, 2,146 visible and six
  hidden**. NFT's 1,170 visible posts are included. All 334 analysis jobs passed.
- Wall time: **7 hours 8 minutes**, from 02:15:39.347Z to 09:23:39.615Z on November 2.
  Recorded completed fetch work was 621 seconds. This includes analysis, retries,
  interruptions and implementation pauses; it is not a clean throughput benchmark.
- Run `998f6966-b52b-4cce-887b-448d0472e773` has complete status/checkpoint. Private
  `report.json`, `final-audit.json`, reproducible `audit.mjs`, frozen inputs and outputs
  live in `work/imports/998f6966-b52b-4cce-887b-448d0472e773/`.
- 466 recorded attempts include 132 rejected structured outputs. Recorded usage:
  32,779,871 input tokens (4,218,624 cached), 2,953,042 output tokens. Totals exclude
  unavailable metrics from five service-capacity interruptions and one malformed response.
  ChatGPT subscription auth was used; no API key or dollar charge is reported.
- Concurrency is **two**, reduced from the approved maximum of three after capacity errors.
  This did not eliminate them. Resumes reused accepted jobs; validation was never bypassed.
  The summary prompt now names `interests` explicitly to avoid metadata-key corrections.
  This changes future cache identity; completed artifacts retain their original prompt.
- Final checks: **113 Node tests, 31 Rust tests, clippy and deterministic build pass**.
  All candidates revalidated against frozen inputs; all 35 live endpoints match the catalog.
  Original text, metadata, visibility and identities match all source records, with no
  duplicates. SQLite integrity/FK checks pass. Final desktop/mobile catalog, Adoption Pool
  and NFT screenshots were inspected; earlier four-topic browser regression also passed.
  Structural validation does not establish every AI interpretation's faithfulness.
- Account identity, passkey and ten recovery codes remain intact. Active session tokens,
  appearance and visit state changed during use and were not restored from an old backup.
  Reset-time preservation: `work/backups/import-reset-audit.json`. Backups:
  `work/backups/zforum-before-mvp-reset-20261102.sqlite` and
  `work/backups/zforum-after-24h-import-20261102.sqlite`.
- Operator command: **`scripts/zforum import [UTC timestamp]`**. No timestamp resumes
  unfinished work or updates from the completed cutoff with a five-minute overlap.
  Earlier dates extend coverage without duplicate source identities. See README/SPEC §14.

## Previous: batch 004 implemented and checked (D-81–D-82)

The process/session, schema and content counts below describe the pre-import state.

- Review at **http://localhost:8000/** after refreshing. The development server was
  rebuilt and restarted with the existing database, origin, RP and verifier arguments;
  current exec session **34660** is intentionally running. All four topics are available.
- Use **`agent-prompts/004-topic-navigation-and-filter-polish.md`** for this batch;
  `SPEC.md` §18 is authoritative where it supersedes §17. Do not reapply earlier age-band
  or last-visit window instructions. Preferences are v6; database schema remains 4.
- Implemented header logout; monthly minimum-account-age slider; persistent Highlights
  and new-points disclosures; hover/click/keyboard filter explanations; expand/collapse
  all including later loads; bookmark icons; − / 0 / + re-write reactions; pull-anchored
  1/3/7-day windows with visible pull time/range; working primary interests; title search;
  latest-post/post-count sorting; and manually ordered Featured Topics.
- **ZCG only** is featured per the user's answer. To change up to three featured ids:
  `node tools/curate-topics.mjs feature zcg [second-topic] [third-topic]`.
  Configuration and reviewed primary tags live in `site/topic-curation.json`. The file is
  publicly readable; only local maintainers can change it. Refresh after editing.
- Duplicate re-write audit operations now appear once with all distinct quotations.
  Accepted analysis/results and original posts were not regenerated. Future summary
  instructions request 1–2 primary interests; historical result validation is preserved.
- Verification: **107 Node tests, 30 Rust tests, clippy and deterministic build** pass.
  Chrome exercises all four topics, title search/sort/interests, featured configuration,
  calendar-month filtering, persistent disclosures, actual hover and native Escape,
  bulk expansion across pagination, feedback order, bookmark/read state, authenticated
  preference saves/logout, exact export bytes, keyboard activation and mobile overflow.
  Desktop/mobile screenshots under `work/screenshots/batch004-*` were visually inspected.
- Before restart, created `work/backups/zforum-batch004-20261102T015825Z.sqlite`.
  `work/backups/batch004-restart-audit.json` confirms all **21 tables unchanged**, SQLite
  integrity OK and no foreign-key violations. Both files are private mode 0600. No source
  import, AI processing or public deployment occurred in this batch.
- Browser automation uses a synthetic account in a disposable database. Live passkey
  verification remains available, but physical passkey enrollment/recovery and user
  acceptance are not claimed. Keep the user's untracked transcript untouched.

## Previous: batch 003 implemented and reviewed mechanically (D-78–D-80)

The following batch-003 process/session and preference numbers are historical.

- Review at **http://localhost:8000/**; refresh the browser. The development server was
  restarted with its existing origin, RP, verifier and database arguments. Its current
  exec session is **73351**; keep it running. All four topics and passkey availability
  were verified after restart. This was not a public deployment.
- Use **`agent-prompts/003-reading-experience-and-simple-feedback.md`** for this batch.
  It supersedes the old filter/feedback/three-export-flow descriptions in batches 001–002.
  `SPEC.md` §17 is the current implemented behavior; earlier handoff sections are history.
- Implemented header navigation and information pages; compact account/profile/saved-post
  placement; multiselect reading filters with compact exclusions; merged/newest-first
  posts; local/relative timestamps; reversible author reveal; consolidated post actions;
  concise Why this rating?; emoji mood plus ternary Heart/Head feedback; ten illustrated
  reactive pets with stars; and one selected-post export/prompt for chat AI or NotebookLM.
  Public impact statistics remain hidden as requested.
- Database schema **4**, reading preferences **5**, and feedback scale
  **`ternary-benefit-v2`** are intentional changes. Historical signed feedback is retained
  in separate tables and is not converted. Existing browser/account filters migrate.
- Pre-migration backup: `work/backups/zforum-batch003-20261102T010650Z.sqlite`.
  Preservation/integrity audit: `work/backups/batch003-restart-audit.json`. All existing
  personal and content table fingerprints matched (old feedback compared under its new
  historical table names); SQLite integrity is OK. No source import or AI rerun occurred.
- Verification: **103 Node tests, 30 Rust tests, clippy, deterministic rebuild**, and
  **Chrome browser tests across four topics** pass. Browser coverage includes exact export
  bytes, multi-post selection/window stability, mood/Heart/Head persistence, bookmarks/read,
  hidden-author reversal, native Enter activation, keyboard-focus tooltips, reduced motion,
  and desktop/mobile layout. Screenshots were inspected under `work/screenshots/batch003-*`.
- Firefox automation continued to report no document focus despite active-element/OS focus;
  the browser harness now uses installed Chrome/CDP. Do not claim Firefox focus behavior
  was fixed. Physical passkey enrollment/recovery and user acceptance remain unverified.
- The untracked `Oct-31-07-26-PM-zforum-spec-a1d3ae28-24b4.md` belongs to the user and was
  not edited or committed. No new work should silently reopen old superseded prompts.

## Latest design decision: one thread per topic by default (D-77)

Each imported forum thread starts as a separate zforum topic. The maintainers decide
when threads are merged; discovery and AI analysis must not group them automatically.
Keep the existing six-thread ZCG grouping. Current configuration supports explicit
membership, but a dedicated merge operation for already-published topics remains to be
implemented. This turn records the policy; it does not merge, split or import content.

## Published: production-style three-topic update test (D-74–D-76; user review pending)

- **Refresh http://localhost:8000/.** The upgraded development server is running, with
  its existing origin, RP, verifier and database arguments preserved. It was intentionally
  left running in exec session 60434. Live catalog and individual topic endpoints pass;
  passkey verification is available. Real registration/recovery still needs user verification.
- Published full histories: bug bounties (57058, 34 posts), Zebra disclosure grant
  (58723, one post), and Konclave (57218, 34 posts). ZCG remains independently published.
  Accounts, credentials, sessions, recovery codes, visits, bookmarks, reading state,
  ratings and feedback match the immediate pre-publication fingerprints exactly.
- The latest consistent pre-upgrade backup is
  `work/backups/zforum-prepublish-20261101T231748Z.sqlite`; its audit is
  `work/backups/prepublish-audit.json`. An earlier backup was used to rehearse schema-2
  migration, publication, rollback and restriction behavior without changing the live DB.
- First discovery found 122 active threads across six pages; the second found 123.
  Only the three allowlisted histories were fetched. All 69 posts were unchanged on the
  second live fetch, and all 14 analysis artifacts were reused with zero new model calls.
  Published candidates are `week-repeat-20261101-TOPIC/candidates/sol-small`, using
  `gpt-6.1-sol`. Assistant source review is not human or independent technical verification.
- Reports under `work/refresh/week-20261101/`: `review-report.json`, `replay-report.json`,
  `migration-report.json`, `publication-report.json`, and `server-report.json`.
  The replay detected twelve recent posts including the new Zebra thread, and exercised
  synthetic edits, hiding, deletion and interrupted fetch. It is not historical reconstruction.
- Gate: 98 Node tests in 17 files, 26 Rust tests, clippy and deterministic rebuild pass.
  `node tests/browser.mjs --catalog week-20261101 sol-small` passes four-topic navigation,
  collapsed defaults, question counts, citations, deep links and mobile layout. Screenshots
  were inspected under `work/screenshots/`. The separate default browser suite still fails
  native keyboard activation, reproduced on plain HTML outside the app; do not claim that
  check passed. No app keyboard workaround was added.
- Two small-batch attempts failed claim-audit coverage and passed after model correction.
  Their rejected outputs and usage remain recorded. The earlier unsupported `gpt6` trial
  and failed 34-post `sol` trial remain unpublished; full usage for early failed attempts
  is unavailable. Historical ZCG prompt bytes remain in `model/initial`.
- Next operator update: use `scripts/zforum week` with a **new run name**, then review and
  explicitly publish the three candidates (README commands). No scheduler or full-forum
  crawl was started. A next-day update has not been performed or scheduled. User review of
  the new pages and analysis is still pending; do not close the task on the user's behalf.

## Current implementation: batches 001 and 002 (D-65–D-69)

The user authorized autonomous choices with a rationale ledger instead of clarification
pauses. `WORKLOG.md` records those choices; `SPEC.md` sections 13–14 and `README.md` contain
the current contract and operating commands. Earlier sections below describe prior stages.

- Shared bulk selection now has exactly Ask your AI, Export for NotebookLM and Listen to
  selected posts as primary actions. Source documents share exact originals/metadata but
  have different wrappers; podcast customization is separate. Selection changes do not
  cancel actions already started. One browser speech player supports overview/post/selection,
  original/rendition choices, bounded passages, transport/speed and snapshot-bound local resume.
  Exports above a 2 MiB soft target offer numbered parts with original posts intact; normal
  selections remain one file. NotebookLM instructions open after its download action.
- The Zamagotchi offers ten appearances and responds independently to signed emotional/perspective feedback.
  New authenticated answers use −10…10; historical 0…10 files are not converted. Progress
  caps contribution to the latest answered rendition per post/dimension; clears remove it.
- SQLite owns accounts, hashed recovery codes, sessions, bookmarks/manual read state,
  preferences, device visits, versioned feedback and releases. New sessions derive identity
  only from verified passkeys. Browser reader ids have no authority. Save/read do not happen
  implicitly. Calendar-month filters and explicit local-filter import are available.
- **Verifier build now passes:** dependencies were downloaded by the user; the enum-size
  lint error is fixed. Registration/sign-in challenge smoke checks pass. Real passkey
  registration/login/recovery still need browser verification; no authentication bypass exists.
- `scripts/zforum` supports fetch/refresh/analyze/compare/publish, fixed six-thread crawling,
  complete old-post reconciliation, bounded isolated Codex/Claude adapters, immutable frozen
  inputs/candidates, restart checkpoints and explicit publication. Successful pull metadata
  is distinct from analysis age. Observed visibility changes restrict content immediately;
  affected topics are withheld until a safe release is published. Rollback keeps restrictions
  and personal state. Source pulls and per-post producing-run provenance are stored.
- Application gate: 15 Node test files, 24 Rust tests, clippy and deterministic rebuild.
  Tests cover mocked refresh failures/resume/comparisons and actual in-process HTTP routing,
  transactional recovery races, release rollback and backup restoration. No paid model job
  or live publication was performed. Both installed CLIs successfully reported their version
  inside the bubblewrap filesystem boundary. Real provider output/auth integration remains
  unverified.
- Browser attempt: Firefox did not start its automation endpoint; server bind returned
  `Operation not permitted`. No server is running and no new screenshots were obtained.
  Speech quality/mobile overlap/background behavior and NotebookLM import are unverified.
  Restart the server for this backend upgrade, then refresh. Passkey development origin is
  `http://localhost:PORT`. Cached application checks here use `CARGO_HOME=/tmp/zforum-cargo`.
- Preserve the user's untracked `Oct-31-07-26-PM-zforum-spec-a1d3ae28-24b4.md`. Every commit
  continues to use `sudo_ml <29868543+ml-sudocode@users.noreply.github.com>` for both identities.
  User review and verification remain pending; no task/issue has been closed on their behalf.

## Prior UX follow-up: selected-post export (D-64; superseded above)
- The visible “Summarize posts with your AI” entry point explains selecting across threads.
  Selection mode reveals separate chat AI and NotebookLM cards with destination-labelled
  buttons. Chat copies the complete prompt plus posts or downloads one file. NotebookLM
  downloads that same file as a source, then copies the shared summary request into chat.
- Links-only copying is secondary and explicitly excludes prompt/text. Copy output remains
  visible and selectable on clipboard failure. Prompt-load errors and changed selections
  fail explicitly. No backend change; refresh the page to load these controls.
- Gate passed: 12 Node files, 19 Rust tests, clippy and rebuild. Browser run blocked by
  local socket permission; no new screenshots. Visual/user verification remains pending.

## Latest implementation: reading framework and direct post access (D-60–D-63)
- What’s new owns its time controls, including when off. The debate summary is optional
  and initially collapsed. All visible posts start collapsed with a neutral AI summary
  of at most 160 characters; Collapse all applies across threads. Expanded filtered posts
  remain grey. Citations/deep links expand the original; forum-hidden content stays hidden.
- The old maturity/traits model is removed. All 350 visible posts have fresh evaluations:
  tone, assumptions/certainty, argument support and contribution, each 0–3 or null with
  evidence, rationale and confidence. Tone peaks retain isolated harsh passages. Passage
  flags, claim records, rendition audits, context limitations and grounded analytical notes
  are inspectable. `site/js/rubric.js` is the authoritative provisional rubric; its content
  is included in the marks prompt hash.
- Reading settings offer independent tone/support presets, explicit unassessed handling,
  contribution kinds, passage flags, original/rendition preference and the requested
  assumption/reframing/new-point controls. Coverage counts show matching sources per issue;
  every summarized argument remains accessible, including those with no matching sources.
- Neutral renditions preserve allegations as attributed allegations and keep the original,
  diff and separate AI-generated analysis adjacent. This is not external fact verification.
  The six question cards and twenty summary arguments remain in the existing schema.
- Internal site data is `zforum-design-4`, with one `analysis` record per visible post and
  null analysis for hidden posts. Reading preferences use storage version 3; there is no
  numerical conversion from old maturity settings. All per-post results use gpt-6;
  the final 58515 batch records mixed primary-agent/subagent provenance because the primary
  agent authored posts 121–143. Other per-post batches record subagent provenance.
- The launch script and feedback report share a rendition-corpus hash to select the current
  feedback file. Earlier `work/feedback.json` remains intact; its one response relates to
  the old rendition. Pass an old file explicitly to the report tool when inspecting it.
- `scripts/check.sh` passes, including all eleven Node test files, nineteen Rust tests,
  clippy and the complete rebuild. The actual renderer was also exercised nonvisually for
  all 350 posts, and all 108 diffs reconstruct both texts. The current browser attempt
  again failed at localhost binding (`Operation not permitted`) and Firefox startup.
  No new screenshots were obtained and no server is running. Details are in WORKLOG.md.
- User verification remains pending: review default collapsed reading, independent filters,
  expanded grey posts, original/diff fidelity and whether summaries support understanding.

## Website agent handoff: make the debate summary approachable

**User request and accepted direction (D-58).** The user finds the 20-argument summary
too demanding to read and asked about major categories and cards with a sense of
completion. After discussing the proposal below, they said: "ok i like the suggestions.
can u prepare a handoff for my agent handling the website?" This handoff records the
accepted direction; it does not claim the design has been implemented or tested.

### Outcome

A reader should quickly understand what is at stake, choose a question that interests
them, and come away understanding that disagreement. They should get value without
reading every argument. Preserve access to the full argument coverage and original
posts, including dissent and arguments from filtered posts.

### The presentation problem this handoff addressed

- The previous `site/js/topic.js` rendered all 20 points in `whySection()`, then repeated their full
  text under six group headings. Remove this duplicate presentation.
- Points follow first appearance, which separates related objections and replies.
- Many single-sentence points contain several claims. Putting the same paragraphs in
  20 separate cards would leave the underlying reading burden.
- Existing groups largely describe positions (e.g. ending versus defending ZCG).
  The new top level should group questions, not people into camps.

### Proposed first prototype

1. **Short orientation:** two or three plain sentences explaining what might change,
   why people disagree, and what remains undecided. It must stand on its own for a
   reader who opens nothing. Keep citations available and explain necessary acronyms.
2. **Five or six expandable question cards:** show every question heading and a
   one-sentence description of its disagreement in the initial view. Start with the
   six candidate questions below. All cards remain directly accessible; avoid a
   compulsory sequence or a horizontal carousel hiding the other questions.
3. **A compact explanation inside each card:** show the central concern, relevant
   counterconcern(s) or alternative positions, and the unresolved question. Aim for
   roughly 60–100 words before optional detail; this is a starting design target,
   not a reason to omit a material position or qualification. Support more than two
   perspectives when the source requires them. Do not invent symmetry or consensus.
4. **Detail on demand:** "Explore the arguments" reveals the individual cited
   arguments; source links open the relevant original posts using the existing
   citation navigation. Keep the full discussion accessible independently.
5. **Optional guided reading:** a "Next question" button can open the next card.
   Readers can jump freely, go back, and stop. Do not auto-advance. If adding progress
   and resume state, use a quiet "3 of 6 explored" and browser-local storage keyed to
   the topic/summary version. Define explored as an interaction, not proof of reading,
   comprehension or agreement. Progress/resume is secondary to making the cards clear.

### Candidate question structure for ZCG

These are proposed editorial headings, not a verified classification. Read the
original posts when producing the actual summaries. Points can span questions;
cross-reference shared arguments without repeating full paragraphs in the overview.

| Question | Coverage to preserve |
|---|---|
| Who should control the funding? | Committee accountability, coinholder voting, capture |
| Is ZCG funding useful work? | Track record, disputed grants, interpretation of the ZSA poll |
| How much funding should continue? | Treasury size, ending/tapering streams, alternative funding, whether both streams should be treated alike |
| Where should the money go? | NSM, development reserves, restructuring and compromise proposals, objections to those proposals |
| What should adoption grants support? | ZAP, lasting adoption, contested spending, treatment of recipients and the distinction between spending criticism and identity attacks |
| How should a change be decided? | Authority over existing funds, consultation, polling and timing |

### Illustrative card copy

This example is paraphrased from the existing summary to demonstrate the format.
Verify and attach citations before shipping; it is not a new factual finding.

> **Who should control the funding?**
>
> The disagreement is over what makes funding decisions accountable.
>
> **One concern:** Coinholders pay through dilution but do not directly choose ZCG's
> committee.
>
> **A counterconcern:** Coin-weighted voting gives large holders more influence, and
> low turnout raises questions about representation.
>
> **The unresolved question:** What decision process would adequately represent
> those affected?
>
> Explore the arguments · Read source posts

### Content and implementation constraints

- Treat this as the presentation direction for D-54's summaries by point of contention.
  Coordinate with the agent handling that migration so there is one summary schema,
  prompt and renderer. The broader ratings/renditions migration is still outstanding;
  this handoff does not replace it or require the website agent to take it over.
- Current entry points: `site/js/summary.js` (`orientation`, `questionCards`), `site/style.css`,
  `model/summary.md`, `tools/lib/validate.mjs` (`validateSummary`), `tools/build.mjs`,
  and `model/results/summary/summary-zcg.json`. Existing tests are under `tests/`.
- Change the content model if needed to store the concise explanations and their
  citations explicitly. Do not generate unsupported editorial copy in the renderer
  or recompute model output during builds. Prompt changes require regenerated,
  validated and accepted results under the existing hash checks.
- Preserve the distinction between allegations, explicit claims and AI interpretation.
  Preserve minority positions in the details and signal material disagreement in the
  short view. Grouping must not erase an argument because it fits awkwardly.
- Preserve reading settings, anonymous mode, what's new, thread tabs, post deep links,
  collapsed filters, diff tabs, selection/export, ratings and rendition feedback.
  Keep stable argument identities/first-appearance metadata for what's new.
- Use accessible disclosure controls with clear expanded state, keyboard operation
  and visible focus. Next must move focus meaningfully; closing or revisiting cards
  must not lose the reader's place. Check desktop and narrow mobile layouts.
- The design intent is a satisfying piece of understanding. There is no evidence here
  that clicking a card causes a dopamine reward. Do not introduce scores for agreement,
  streaks, quizzes or forced completion as part of this change.

### Acceptance and evaluation

- The initial summary shows a brief orientation and a scannable set of questions,
  rather than 20 full arguments or duplicate grouped text.
- Every question can be reached directly. Each expanded card explains a coherent
  disagreement and exposes its relevant detailed arguments and original sources.
- Check coverage against all 20 existing points and the D-54 summary contract; record
  deliberate merges/splits and ensure no material dissent disappears.
- If progress ships, revisiting a card does not double-count it, a new summary does
  not inherit misleading completion, and progress never implies agreement/mastery.
- Run relevant tests and the repository gate. Inspect actual desktop/mobile output
  and citation navigation. Prior browser limitations are documented below; do not
  claim visual verification without performing it.
- Ask readers to explain the main disagreements in two cards they explored. Evaluate
  whether the presentation helped them understand and find evidence, not merely how
  many cards they clicked. User verification remains pending.

### Why these patterns were suggested

NN/g is Nielsen Norman Group, a UX research and consulting company. Its guidance
supports showing essentials before detail and preserving direct access to content:
[progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/),
[mobile carousels and sequential access](https://www.nngroup.com/articles/mobile-carousels/).
These are general design references, not evidence that this particular six-card
design works for zforum. The specific structure above is a hypothesis to prototype
and evaluate with readers.

## Earlier session 4 additions (superseded where noted above)
- The user chose **collapsed filtered posts, greyed when expanded** (`D-55`), then paused
  the framework work to add **Diff** and **Select posts / own-AI export** (`D-56`, `D-57`).
- Implemented: lazy expansion with reasons; diff tabs marking added/removed authored
  wording with quoted replies separate; checkboxes and a count preserved across thread
  tabs; a combined Markdown download containing `site/prompt.md`, selected raw posts and
  links; Copy links with a visible manual-copy fallback; direct post routes that open the
  original and expand filtered targets. Anonymous mode's export disclosure is visible.
- That addition introduced `zforum-design-2`, with raw and authored text retained for
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
- The per-post framework was subsequently implemented as described at the top. The user’s
  verification remains pending for the combined reading experience.

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
- `Q-16` is resolved by D-54: keep central allegations as attributed allegations. This is
  implemented in the regenerated renditions and their claim audits. `A-5` (whether to commit the
  snapshot) remains open.

## Adopted framework reference
D-54 and D-61 implement the provisional framework described below. Its calibration examples
remain preference evidence, not an objective gold standard. Further calibration and user
verification are still needed.

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

**Current entry points.**

| Area | Where |
|---|---|
| Rubric and per-post schema | `site/js/rubric.js`, `model/marks.md`, `tools/lib/validate-marks.mjs` |
| Filtering and coverage | `site/js/logic.js`, `site/js/topic.js` |
| Collapsed summaries and versions | `site/js/post.js` |
| Evidence, claims and AI notes | `site/js/post-analysis.js` |
| Question cards and citations | `site/js/summary.js`, `site/js/citations.js` |
| Provenance and deterministic build | `tools/lib/prompt.mjs`, `tools/accept.mjs`, `tools/build.mjs` |
| Feedback corpus isolation | `tools/lib/feedback-path.mjs`, `scripts/serve.sh`, `tools/feedback-report.mjs` |
| Current decisions and audit | `WORKLOG.md`, D-54 and D-60–D-63 |

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
   until it passes. Per-post jobs were regenerated by gpt-6 agents under the new rubric; the revised
   question summary was done by the primary Codex agent. Jobs are backend-independent.
3. `node tools/accept.mjs <job-dir> --model <model-id> --backend primary-agent|subagent|primary-agent+subagent`
   stores the result in `model/results/` with its prompt/view hashes and explicit
   provenance, which the build shows on the page.
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
`work/` (jobs, account dates, ratings, versioned feedback), `site/data/` (built), `server/target/`,
and the archived snapshot under `archive/research-prototype/data/`. Without the snapshot,
nothing rebuilds; `A-5` (whether to commit it) is still open.
