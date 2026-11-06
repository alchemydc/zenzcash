# zforum
calm, personalized zcash forum

A reading lens over forum.zcashcommunity.com, with independently updated discussion pages.
Design: `SPEC.md`. Decisions and rationale: `WORKLOG.md`. Resume: `HANDOFF.md`.
Working rules: `CLAUDE.md`.

```sh
scripts/serve.sh 8000       # open http://localhost:8000/
scripts/check.sh           # builds binaries; Rust/Node tests and committed-fixture rebuild
scripts/build-auth.sh      # requires registry access; builds the maintained WebAuthn verifier
scripts/zforum import      # fetch and preview; no AI calls or content publication
```

Server startup preserves the content and accounts in `work/zforum.sqlite`; a new database
starts empty. For the first import, supply a UTC timestamp as documented below. Back up
the database on durable storage and keep it outside `site/`.
Fly.io deployment is configured below; `HANDOFF.md` records provisioned resources and launch status.
`ZFORUM_ORIGIN` and `ZFORUM_RP_ID` must identify the chosen HTTPS
production origin/domain before real passkeys are enrolled. Local development uses **localhost**,
not the numeric loopback address, for passkeys.
If account creation reports an address mismatch, use the exact URL printed by the server.
The account panel also links to that URL when opened at another address.

Real registration/sign-in/recovery, device speech and NotebookLM import still need user
verification. See `HANDOFF.md` for the latest automated and browser test results.

## Fly.io deployment

The production app is **zencash**, in **sjc** (San Jose, USA), with canonical origin
**https://zenzcash.com** and passkey RP ID **zenzcash.com**. Fly's default hostname is
`zencash.fly.dev`. Use the custom domain for accounts; localhost passkeys cannot sign
in there. Existing account records and recovery codes are preserved by the seed.

`Dockerfile` builds both Rust binaries with locked dependencies, generates the reading
contract from tracked browser source, and runs an HTTP/passkey/restart smoke test inside
the image build. `.dockerignore` allows source only. SQLite, import jobs, AI credentials,
generated topic files and local compilation caches are excluded. Node is included for
operator tooling and backups; AI execution and subscription credentials stay here.
Run `scripts/check-deploy.sh` for the full application gate plus WebAuthn build,
runtime smoke, Chrome warm-cache/UI and passkey checks (requires local listening sockets
and `google-chrome-stable`). `scripts/fly-deploy` runs this gate before deploying.
Both gates build their required
binaries first and use committed test inputs; no forum fetch or model call is made.

`tools/build-runtime.mjs` generates `site/runtime/index.html` and a content-hashed
`/assets/<revision>/` namespace for the whole JS module tree and CSS. Relative module
imports keep that prefix. Entry HTML and operator curation/prompt responses use
`Cache-Control: no-store`; versioned assets are immutable. A normal reload selects the
current release without reusing old module URLs cached by browsers or Cloudflare.
Already-open tabs need reloading after an API-changing deployment. Generated runtime
files are ignored locally and rebuilt from tracked source in the Docker image.

Tests use `tests/fixtures/zcg-source.json`, the parsed public posts and profile dates
retained in the handoff's generated site. Its source digest and all 11 accepted analysis
input hashes are checked, then the normal acceptance validator and deterministic builder
run against the recorded results. Browser tests assemble this fixture in a disposable
directory. No test requires ignored `work/` inputs or generated `site/data/zcg.json`.
The fixture contains no Zenzcash account, passkey, recovery or session records.

`node tools/build.mjs` remains an explicit historical HTTP-crawl reconstruction command.
It requires the original untracked archive snapshot and account-date file, and fails if
they are missing. The test fixture is not a replacement crawl or proof that the original
HTTP responses can be reconstructed. Neither the test gate nor deployment rebuilds or
publishes production content.

Run exactly **one Machine** (shared CPU, 512 MB initially) and one encrypted **3 GB**
volume named `zforum_data`, mounted at `/data`. SQLite and its WAL/SHM are at
`/data/zforum.sqlite`; `/app/work` links to `/data/work` for import state/artifacts.
The entrypoint refuses a missing mount, sets private permissions, and runs the service
as UID 10001. Normal startup refuses a missing database. No deploy seeds automatically.
Autostop is disabled. Single-Machine deploys and host failures cause downtime; volumes
do not replicate. Do not scale above one or use blue/green/canary deployment.

Fly terminates TLS and sends HTTP to `0.0.0.0:8080`. `/healthz` checks SQLite and the
verifier. Production rate limits use Fly's `Fly-Client-IP` header; direct/local runs
ignore proxy headers. Keep the backend private behind Fly Proxy and use DNS-only
records if your DNS provider offers an additional HTTP proxy.

Set up storage once, only if these resources do not already exist (check HANDOFF):

```sh
export PATH="$HOME/.fly/bin:$PATH"
fly apps list
fly volumes list
fly storage list
# Initial provisioning only:
fly apps create zencash --org personal
fly volumes create zforum_data --region sjc --size 3 --snapshot-retention 14 --yes
fly storage create --name zencash-backups --yes
```

Tigris creates a private bucket and stages `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`,
`AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` as Fly secrets. Its CLI output includes
credentials: do not commit it, paste it into chat or put it in `fly.toml`.

Initial database transfer (skip when HANDOFF confirms the volume is already seeded):

1. Run `flock -n work/import.lock node tools/prepare-fly-seed.mjs`. It makes a new
   consistent backup of **work/zforum.sqlite**, checks integrity/foreign keys, records
   counts/SHA-256 in `manifest.json`, and archives the frozen `work/imports/` artifacts.
   The printed directory is private and ignored by Git. Keep the seed and original ZIP.
2. Start a maintenance-only Machine with
   `fly deploy --remote-only --ha=false --env ZFORUM_BOOTSTRAP=1`. This explicitly
   serves 503 for readers and a maintenance health response; it never opens SQLite.
3. Use `fly ssh sftp put --user zforum` to upload that directory's `zforum.sqlite` to
   `/data/transfers/seed.sqlite` and `imports.tar.gz` to `/data/transfers/imports.tar.gz`.
4. Run the following, replacing `SHA256_FROM_MANIFEST` with the printed hash:

```sh
fly ssh console --user zforum --command 'node /app/tools/seed-database.mjs /data/transfers/seed.sqlite /data/zforum.sqlite SHA256_FROM_MANIFEST'
fly ssh console --user zforum --command 'tar -xzf /data/transfers/imports.tar.gz -C /data/work'
fly ssh console --user zforum --command '/app/server/target/release/zforum-server report --db /data/zforum.sqlite'
```

Seeding verifies the hash and SQLite integrity, preserves all tables, and atomically
creates the destination without overwriting a database or its WAL/SHM. Only extract
the trusted archive you just prepared, and only during the initial transfer. After
production begins, its database is authoritative; never replace it with a local copy.

The certificate request for `zenzcash.com` needs these DNS records at the domain provider:

| Type | Name | Value |
|---|---|---|
| A | `@` | `66.241.124.216` |
| AAAA | `@` | `2a09:8280:1::1e1:b05a:0` |

Check current values with `fly ips list` and certificate issuance with
`fly certs check zenzcash.com`. DNS changes are made at your domain provider.
The `www` hostname is not configured. Once storage, DNS and the certificate are ready,
the first normal launch is `fly deploy --remote-only --ha=false --strategy rolling`.
Committed `ZFORUM_BOOTSTRAP=0` enables the application and its startup backup. Verify
`https://zenzcash.com/healthz`, all 32 initial topics, and real passkey recovery/enrollment.

For subsequent code deployments, commit reviewed changes and run **`scripts/fly-deploy`**.
It checks that there is one existing Machine in sjc and disables Fly's spare Machine
creation. Code deployment preserves the mounted database and import artifacts. Migrations
run when the server opens SQLite, after a consistent off-volume startup backup; Fly
`release_command` is deliberately unused because its temporary Machine has no volume.
Do not deploy while an import operation holds the operator lock.

The audit-fix release upgrades SQLite from schema 7 through 11 and changes the topic
listing and account-history APIs. Deploy its browser assets and server together; an
already-open old browser tab may need refreshing. Before deployment, rehearse the
migrations on a consistent database copy and verify retained account/content rows.
Keep a fresh pre-migration backup and record the old image identity. The schema-7
server rejects schema 11, so an image-only rollback is insufficient. If rollback is
needed, stop writes, preserve the upgraded database for recovery, then restore the
matching pre-migration database and old image together. Account changes made after
that backup require separate recovery; do not silently discard them. This procedure
is preparation guidance, not permission to deploy or restore production.

The Machine uses one performance CPU and 2 GB RAM, with Node's heap capped at
512 MiB. Shared CPU quota caused slow publication and intermittent health-check
failures during the audited deployment; performance CPU provides sustained capacity.
The measured audited
staging/publication rehearsal peaked at about 764 MiB in the parent process, alongside
the publication child and live web server. The 1 GB configuration leaves insufficient
headroom for that operator workload.

Before starting a long import that will need Fly access, check the workstation clock
against a trusted time source, then verify `fly status --app zencash` and an SSH
command against the app. A working `fly auth whoami` alone does not prove app access.
Use an app-scoped deploy token with an explicit expiry long enough for preparation
(for example, `fly tokens create deploy --app zencash --expiry 12h`). Redirect the
token into a private, ignored file with mode 0600 and supply it as `FLY_API_TOKEN`
only to the Fly subprocesses; never paste it into commands, logs or the repository.
Record its expiry separately and check access again before deployment. If a build
reports that a certificate is not yet valid, correct the clock; keep TLS verification
enabled. Saved import artifacts let a failed build or expired credential resume
without repeating accepted model work.

### Backups and restore

The supervisor takes a verified SQLite backup before startup/migration, then hourly,
under the same lock as imports. Each archive contains the consistent database, a count
manifest and frozen import artifacts, and is uploaded to the private Tigris bucket.
Credentials are passed to curl's AWS signing implementation through stdin. Successful
uploads record object key, SHA-256 and time in `/data/backups/latest.json` and logs.
Startup fails if the backup fails; later failures emit `BACKUP FAILED` and are retried
at the next hourly interval. Monitor that log and the age of `latest.json`. Recovery
can lose writes since the last successful backup. Tigris archives accumulate until an
operator sets a reviewed retention/lifecycle policy; Fly snapshots retain 14 days.

```sh
fly ssh console --user zforum --command 'flock -w 60 /data/work/import.lock node /app/tools/backup.mjs'
fly ssh console --user zforum --command 'node /app/tools/verify-backup.mjs'
```

The second command downloads the latest archive from Tigris, verifies its SHA-256,
extracts to a disposable directory, and checks SQLite integrity, foreign keys and
manifest counts. It does not replace production. For disaster recovery, retrieve the
chosen archive from the private bucket (object key/hash are in the backup logs), verify
the hash, and restore its database and `imports/` into a **new** volume in maintenance
mode. Verify account/content state there before switching. Preserve the old volume;
do not copy over a running database. Keep the same HTTPS origin and RP ID.

### Reviewed production content updates

Fetch and analyze against a **separate local copy of a consistent production backup**.
Never point preparation at the live database. Production fetch is disabled; preparation
also refuses production runtime/storage, including symlink aliases and hard-linked files.
No Fly SSH/token hook belongs in a preparation runner. Content and visibility changes,
including hidden/deleted posts, wait for explicit publication after review.

```sh
# work/optimized-import.sqlite must be a separate local backup copy.
scripts/zforum import fetch --db work/optimized-import.sqlite
scripts/zforum import preview --db work/optimized-import.sqlite
# After reviewing the fetch preview (example allowance: 2):
scripts/zforum import analyze --max-calls 2 --db work/optimized-import.sqlite
# Review work/imports/RUN/preview.txt and preview.json; resume bounded analysis as needed.
```

Before each new transfer, remove only the prior scratch transfer file or choose a new
filename; SFTP may refuse overwrite. Receiving analysis rebuilds every candidate against
the production frozen source/model, rejects unsafe filenames and stale release baselines,
then marks analysis ready. It does not import a local run checkpoint or personal state.
Publication revalidates and commits every topic, summary and completion checkpoint in
one guarded transaction, including restrictions for newly hidden or removed posts.
A failed topic leaves the entire previous release available with restrictions unchanged.
No fetch, AI analysis or content update is scheduled automatically.

While an import is prepared, readers keep the published content and pull timestamps.
Newly hidden/deleted posts are redacted in the draft. Pulls and bundle staging do not
change live restrictions, titles, summaries or filters. Emergency restrictions require
a separate explicit instruction; they are not part of preparation.

The default importer reuses a checked summary when the complete source and summary
prompt are unchanged. Changed topics get one fresh full-context summary.
It retains accepted analyses of unchanged replies, including their original provenance.
Only new or edited reply content needs a new analysis. Retries reuse completed work
within the frozen run; changing summary questions does not invalidate reply analyses.
New reply batches contain at most eight targets and selected discussion context.
If some records fail validation, only those records are requested again; valid replies
survive interruption/resume. Profile lookups are shared across topics and resumed fetches
within the same run; each later pull starts a fresh profile cache.

Each pull's `audit.txt`, `audit.json` and `audit-topics.csv` show calls/tokens/timing,
retained summaries, profile-cache hits and replies retained from rejected batches.
Estimates exclude retained work. Existing frozen imports keep their recorded policies
and prompts; these optimizations apply to future runs.

Future unseen threads first appear in `work/imports/RUN/new-thread-review.json`,
with only titles and short opening excerpts. The operator agent reviews that small
packet, suggests social-only/fun-only exclusions and asks you to confirm them.
It does not run a separate classifier or send the assessment rubric for this step.
After confirmation, fill each classification, include/exclude decision and reason:

```sh
scripts/zforum import fetch --db work/optimized-import.sqlite --review work/imports/RUN/new-thread-review.json
```

Source fields must stay intact. Exclusions are remembered on the persistent volume;
excluded threads receive no full-history fetch or AI analysis in later imports.
Existing tracked threads bypass this new-thread review. The music thread is explicitly
excluded from new discovery. Schema 7 adds the small decision table; startup migrates
existing databases after taking its backup.

### Review source warnings and reverse an exclusion

Review packets and terminal previews label forum text as untrusted JSON. Formatting
controls are visibly escaped without changing the underlying source values. Commands
inside titles, excerpts or findings are not operator instructions. Confirm the exact
thread IDs, decisions, reasons and excerpts before applying a new-thread review.

Discovery scans full opening text, and later scans cover fetched bodies/quotes and the
exact staged candidate. `source-scan.json` records coverage and completion internally.
Only findings create `suspicious-content-review.json`; a complete clean scan creates
no review file or acknowledgment task. Patterns are review cues, not proof of attack
or absence of injection. Benign security discussions can match.

`import preview` regenerates the final scan without model calls. If findings exist,
read the report and candidate, then run this yourself in an interactive terminal,
using the full digests printed by preview:

```sh
scripts/zforum review-content --directory work/imports/RUN \
  --candidate CANDIDATE_DIGEST --report REPORT_DIGEST \
  --operator 'Your name' --reason 'What I checked and why publication may proceed'
```

The command asks you to type the report digest explicitly. An agent must not perform
this acknowledgment for you. A changed candidate, detector or regenerated findings
report invalidates it. Acknowledgment is audited and permits publication; it neither
declares the content safe nor excludes a thread. Missing/incomplete/stale scans,
missing findings reports and missing acknowledgments block publication. On production,
use the same subcommand through `/app/scripts/production-import` in an interactive
terminal, with `/data/work/imports/RUN` as the directory. Staging regenerates its own
scan; a draft-machine acknowledgment does not authorize production publication.

For existing refresh candidates, `scripts/zforum review --run RUN --candidate NAME`
rescans without regenerating analysis; acknowledge in `work/refresh/RUN/candidates/NAME`.
The importer/refresher prepares exact-file review evidence automatically. Direct
`zforum-server publish`, `publish-import` and `merge` now require `--review DIRECTORY`.
For an existing single-topic or merge file, the manual sequence is:

```sh
node tools/review-publication.mjs scan FILE.json work/file-review
# Read the report and acknowledge above, only if findings exist.
node tools/review-publication.mjs authorize FILE.json work/file-review
# Then perform your separately authorized publish/merge with --review work/file-review.
```

Schema 11 adds an append-only decision history. After finishing any staged import,
reverse an untracked thread's exclusion with an explicit prior decision:

```sh
scripts/zforum review-thread --db work/optimized-import.sqlite --thread THREAD_ID \
  --from exclude --to include --classification substantive \
  --operator 'Your name' --reason 'Why the earlier exclusion was mistaken'
```

This also requires interactive confirmation. It records prior/replacement decisions,
timestamp, operator and reason atomically. The next full import includes that thread
even if its activity predates the cutoff, then fetches its history and analyzes it
normally. Explicit configuration exclusions still apply. For an exclusion recorded in
production, make the deliberate correction there before preparing a fresh backup-based
draft; staging does not silently override a differing production decision. Existing
published/tracked topics require their normal content workflow, not this command.

### Account alerts: owner setup only

These are instructions for the account owner and expert. No provider accounts,
notification settings, tokens or monitoring services were changed by this remediation.
Alerts are detection, not a replacement for sandbox isolation. In particular, an
existing stolen session/token may be used without a new-login alert.

- **Codex / ChatGPT usage:** In Codex, use `/usage daily`, `/usage weekly` or
  `/usage cumulative` to inspect account token activity; record a baseline before
  leaving and compare on return. Official OpenAI documentation does not establish
  an automatic “usage while I am away” alert for this subscription workflow.
  [Usage commands](https://learn.chatgpt.com/docs/developer-commands).
  For local automatic detection, your expert can enable Codex OpenTelemetry export
  to a collector you control, keeping prompt logging disabled. Record explicit UTC
  work windows with expiry, including expected background imports. Alert on local
  model-request events outside those windows; route the alert through your chosen
  phone/email monitoring service. Test both an outside-window synthetic event and an
  allowed event. This observes instrumented clients only: it cannot see a stolen
  credential used elsewhere, and the importer audit omits ordinary coding sessions.
  `notify` is a turn-completion hook, not an account-wide misuse detector.
  [Telemetry and notifications](https://learn.chatgpt.com/docs/config-file/config-advanced).
- **GitHub:** Confirm that your account email reaches a mailbox with phone alerts.
  Configure two-factor authentication, then sign into GitHub Mobile and enable its
  push notifications to receive supported sign-in approval prompts. These prompts
  do not cover every password attempt or existing token use.
  [GitHub Mobile authentication setup](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication).
  In GitHub, open your profile → Settings → Archives → Security log. Review recent
  authentication/access events and export anything suspicious; the log covers 90 days.
  This is manual review, not a configured universal access alert.
  [Security log](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/reviewing-your-security-log).
- **Google:** Open Google Account → Security & sign-in. Check recent security activity,
  your devices, recovery email and recovery phone. Keep notifications enabled on a
  separately held signed-in phone and the recovery mailbox. Google sends security
  alerts for suspicious activity and may prompt signed-in Android devices about a
  new-device login; without Android, check the sign-in/recovery email. Review an
  unfamiliar event directly in Google Account and follow its account-recovery steps.
  These alerts are not a feed of every attempted request.
  [Security alerts](https://support.google.com/accounts/answer/2590353),
  [new-device notifications](https://support.google.com/accounts/answer/7305876).
- **Fly.io:** Its published security questionnaire says there is no customer-facing
  organization-activity or staff-access audit log. Ask Fly support which sign-in,
  failed-login, token-use and account-change notifications your account can receive
  and how to enable them. I cannot give a verified “alert on all access attempts”
  switch. Machine/deployment/resource-change monitoring can flag unexpected changes,
  but application logs do not establish who accessed the Fly account.
  [Fly security questionnaire](https://fly.io/legal/security-questionnaire/).

Have the expert verify delivery to a device outside this VM. Use the providers' own
account pages to investigate alerts; do not treat a notification or a clean local
usage log as proof that all account activity was observed.

For a run prepared against a consistent production backup, export a validated content
bundle from the separate draft database. Deploy the importer code first, then stage
the bundle against production. Never upload the draft SQLite database as a replacement.

```sh
flock -n work/import.lock node tools/import-transfer.mjs prepare work/prepared.json work/optimized-import.sqlite
fly ssh sftp put --user zforum work/prepared.json /data/transfers/prepared.json
fly ssh console --user zforum --command '/app/scripts/production-import stage /data/transfers/prepared.json'
fly ssh console --user zforum --command '/app/scripts/production-import preview'
# Publish only after reviewing that preview:
fly ssh console --user zforum --command '/app/scripts/production-import publish'
```

Staging checks the completed cutoff, published source/analysis baselines, membership,
frozen source hashes and every candidate before reconstructing production import
checkpoints. It performs no network fetch or model call, leaves personal state intact
and advances no coverage cutoff until explicit publication. It rejects an intervening
content update or another unfinished import; repeated staging of the same run is safe.

## Refresh forum content

Use the [MVP import command](#mvp-import-all-publicly-listed-active-threads) for ordinary
imports and updates. It separates fetching, AI analysis and publication for review.

The following older operator commands support controlled model comparisons and the bounded
test topics: `zcg` (six threads), `bug-bounties` (57058), `zebra-disclosure` (58723), and
`konclave` (57218). There is no scheduler.
Install Linux `bwrap` (bubblewrap), the chosen operator CLI (`codex` or `claude`), and authenticate
that CLI first. The adapter exposes its standard authentication file or provider API key to
that CLI only. It does not expose the application database to model jobs. Missing isolation
fails explicitly; subscription/API charges belong to the operator.

Build the application first (`scripts/serve.sh` also does this):

```sh
cargo build --release --manifest-path server/Cargo.toml
# Legacy bounded test: discover seven days and reconcile the three test topics.
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
pull does not advance freshness or apply production restrictions. Newly hidden/deleted
observations stay private until explicit publication. There is no fallback to cached static
topic data. Legacy single-topic publication and rollback affect one topic at a time.

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

### MVP import (all publicly listed active threads)

```sh
cargo build --release --manifest-path server/Cargo.toml
scripts/zforum import 2026-11-01T02:00:00Z
scripts/zforum import
# Review the printed preview and work/imports/RUN/preview.json, then:
scripts/zforum import analyze --max-calls 2
# Review candidate summaries/renditions and usage before publishing:
scripts/zforum import publish
```

For a first pull, provide a UTC timestamp. Later daily pulls use `scripts/zforum import`
with no date: the latest completed full-import cutoff minus five minutes. Earlier dates
extend coverage without duplicate source identities. **Import now defaults to fetch and
preview, not automatic analysis/publication (D-92).** Each stage resumes the unfinished run:

- `import` (or `import fetch`) freezes complete source histories and prints changes,
  links/excerpts, job counts, cache readiness and prompt character sizes. No model calls.
  Source/profile records and hidden/deleted observations update only in the local draft.
  Production content, restrictions and the completed cutoff do not change.
- `import preview` reprints the latest view of frozen inputs, cache/results and usage.
  It does not fetch, call models or change database state. Full details are in the run's
  `preview.json`; `preview.txt` is the quick scan. Source text is untrusted forum content.
- `import analyze --max-calls N` runs at most N model calls across all topics, including
  retries and concurrent jobs, in this invocation. It validates candidates but publishes
  nothing. The allowance resets only when you explicitly invoke analyze again. A small
  limit may stop partway through a topic; use preview and resume with another explicit
  allowance. Accepted outputs survive. A call limit is not an exact token budget.
- `import publish` validates all candidates, checks for intervening release changes,
  then publishes the whole import atomically. It makes no model or forum calls.
  Full coverage and visibility changes advance only with that transaction.

The preview distinguishes retained replies/summaries, cached outputs and pending work.
Legacy summary-dependent jobs remain marked pending until their summary exists. Prompt
sizes are characters, not token estimates. Before publication, preview includes candidate
overview/post summaries/renditions and actual recorded attempt usage (including rejected
outputs). Review semantic faithfulness as well as the mechanical validation results.

For a small trial on a separate database (the backup destination must not exist):

```sh
mkdir -p work/previews
server/target/release/zforum-server backup --db work/zforum.sqlite --to work/previews/trial.sqlite
scripts/zforum import fetch --thread 58723 --db work/previews/trial.sqlite
scripts/zforum import preview --db work/previews/trial.sqlite
# Only after reviewing the fetch preview:
scripts/zforum import analyze --max-calls 2 --db work/previews/trial.sqlite
# Only after reviewing the validated candidate:
scripts/zforum import publish --db work/previews/trial.sqlite
```

`--thread` fetches that thread's existing topic (including all threads if manually grouped)
without forum-wide discovery. A completed scoped run does not advance full-forum coverage.
Keep the same `--db` on every trial command; omitting it targets `work/zforum.sqlite`.
Finishing a trial does not publish to the live database. Do not copy a trial DB over live
state. A pending scoped run must be finished before a different run can start on that DB.

Sign into `codex login` using ChatGPT before **analyze**; fetch/preview need no model login.
Analysis refuses API-key authentication and does not forward API-key environment variables.
Plan usage limits still apply. Model/job settings
are committed in `tools/import-config.json`; prompts are `model/summary.md` and `model/marks.md`.

`newTopicReplyAnalysisPolicy: new-topics-one-year-v1` limits individual analysis when
a topic is first imported to the preceding twelve calendar months, ending at the frozen
import cutoff. All public posts remain in source snapshots, full-discussion summaries
and the reader. Older posts show “Not analyzed · dated post” and retain their original
text, quotes, citations, listening and personal controls, without invented scores or
rewrites. The initial boundary stays fixed on later pulls; existing accepted assessments
are preserved. Relevant older posts can still supply context for recent reply analysis.
Audit reports count dated posts separately from retained assessments and new model jobs.

`summarySectionPolicy: full-history-sections-v1` handles histories too large for one
model request. It summarizes every visible post in bounded sections, then combines
those summaries with their cited originals. Sections are cached and included in the
audit/provenance and final review scan. Full original text stays stored and readable.
Oversized individual posts or synthesis requests fail explicitly; nothing is truncated.

Activity is Discourse's public `bumped_at` listing, not a historical edit-event search.
Two matching discovery passes mitigate live pagination movement; activity after the run's
starting cutoff is included, then revisited next run. All tracked threads are reconciled
on updates, including quiet threads. Existing topic membership is retained; new threads
become `thread-ID` topics. Hidden/deleted sources become restricted at publication. Failed runs do not
advance the checkpoint; completed topic publications and AI jobs survive retries.

SQLite schema 7 owns runs, coverage windows, membership, current source snapshots,
global forum post identities and confirmed future-thread review decisions. The schema-6
availability view keeps unrestricted original posts readable during a privacy repair.
Private immutable job files, cache and per-run `report.json`
live in `work/imports/`. Keep these files alongside database backups for AI-job reuse.
Reports record fetch/analysis timings, changes, job attempts, usage and publication status.
If model capacity or malformed output stops a run, rerun the same stage to resume saved
work. Usage totals include recorded rejected outputs but exclude runner failures that did
not return metrics. Changing prompts or the model invalidates matching analysis cache keys;
completed runs retain their frozen prompts and provenance.
`scripts/zforum` takes a nonblocking process lock; exit 75 means another operation is active.

Server startup leaves an empty database empty. To deliberately clear imported content,
feedback, moods, bookmarks and reading state while retaining accounts/passkeys:

```sh
flock -n work/import.lock server/target/release/zforum-server reset-content --db work/zforum.sqlite --backup work/backups/before-reset.sqlite
```

The backup destination must not exist; a backup failure prevents the reset. The reset also
clears import checkpoints, so the next import requires a date. Do not use reset to extend
an import window. Historical offline fixtures remain available for deterministic tests.

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
RP/domain and HTTPS origin. Rollback only changes content. Recovery/account data and committed
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

### Explicitly grouping topics

Tell the work agent the topic title and exact forum thread IDs. The checked merge path is
`node tools/group-topics.mjs INPUT.json OUTPUT.json`, followed by a backup/rehearsal and
`flock -n work/import.lock ./server/target/release/zforum-server merge --db work/zforum.sqlite --file OUTPUT.json`.
See SPEC §19 and `agent-prompts/005-explicit-topic-grouping.md` for the input and preservation
contract. This operation is local maintenance, not a reader-facing API. It retains existing
post assessments and personal state; one new combined summary covers the group. Do not
restore a historical database to obtain missing threads, or run the whole importer merely
to add explicitly named threads. Default per-thread links continue to resolve after grouping.
