# Feature batch 002: accounts, personal reading state, and content updates

Prepared 2026-11-01 for the backend/application agent.

## Scope and authority

This file is the implementation handoff for the backend design discussion. Read
`AGENTS.md` and `CLAUDE.md` for repository working rules. Inspect the current code and
`HANDOFF.md` for implementation context; do not use the archived prototype's handoff.
This batch has its own file so the user can identify it unambiguously.

The user wants a minimal, reasonably secure backend for personal reading features and
an operator-run process to refresh forum content and AI analysis. This is a design
handoff, not a report that those features already exist. Distinguish the confirmed
requirements below from recommendations and unresolved choices. No backend code was
changed while preparing this file.

Batch 001, `agent-prompts/001-companion-audio-and-post-selection.md`, describes the
companion, listening and the three shared-selection actions. Preserve those contracts;
this batch supplies their account/persistence foundation. Do not create another selection
system or another source of truth for feedback and pet state.

## Confirmed user requirements

Users must be able to:

1. Bookmark individual posts.
2. Track their own Tamagotchi health/progress.
3. Choose their companion from **ten cute options**.
4. Select **Since last visit** for new-post filtering. The user explicitly chose visit
   rather than login as the reference.
5. **Manually mark a post read and mark it unread again.** Read posts are less prominent.
   Opening, scrolling past or listening to a post must not automatically mark it read.
6. Save reading filters, including minimum forum-account age in months/years.
7. Use minimal accounts without collecting emails or handling forgotten passwords.
   The chosen approach is **passkeys plus multiple downloadable recovery codes**.

For new-post filtering, the user explicitly chose **the forum post timestamp**, not
the time we imported or processed it. Show **when we last successfully pulled data
from the forum** for the content being displayed.

Operators must be able to:

1. Count post-level feedback, such as whether a rewrite helped emotionally or provided
   a new perspective. Real-world identities are not required. Internal account-level
   attribution is useful for deduplication, corrected answers and abuse investigation.
2. Run a command or reusable agent prompt that fetches recent forum content, performs
   all required AI processing and updates the application's database. It should support
   different agents/models so their outputs can be compared.

## Current implementation context

At preparation time, the repository has a Rust/Axum server with file-backed ratings and
feedback. Requests supply a browser-generated reader id; this is **not authentication**.
There are no account credentials or persistent account-owned bookmarks/read state yet.

The current reading framework is implemented: independent tone, assumptions/certainty,
argument support and contribution ratings; rubric flags; neutral renditions; original
text and diffs; separate analytical notes; and contention-based question cards. The site
format is `zforum-design-4`, with post content under `analysis`, not old maturity/clean
fields. Preserve this framework and its citations/coverage behavior.

All available posts currently have accepted recorded analyses. Jobs, prompts, rubric
and source views are hash-bound. The builder validates accepted outputs and produces a
static topic data file. Inputs still come from a configured archived forum snapshot.
The current feedback files are separated by a **whole-rendition-corpus hash**; older
feedback remains historical. The new backend needs finer per-rendition versioning.

Useful starting files:

- `server/src/main.rs`, `store.rs`, `feedback.rs`, `ratings.rs`.
- `site/js/app.js`, `logic.js`, `topic.js`, `post.js`, `vocab.js`, `rubric.js`.
- `site/js/selection.js`, `selection-controls.js`, `summary.js`.
- `tools/prepare.mjs`, `check-output.mjs`, `accept.mjs`, `build.mjs`.
- `tools/lib/topic.mjs`, `config.mjs`, `jobs.mjs`, `prompt.mjs`, validators.
- `model/marks.md`, `model/summary.md`, `model/results/`.
- `archive/research-prototype/zforum/crawl.py` as reference for the existing crawler.
- `scripts/check.sh`, `tests/browser.mjs`, and current unit tests.

Read current files before implementing; names and work state can change between agents.

## Recommended MVP architecture — not a settled hosting decision

Extend the existing Rust server. A single application instance with a local SQLite
database on durable storage is the initial recommendation. Use migrations, transactions,
foreign keys and tested backups/restoration. Hosting was asked about but not chosen.
Do not deploy assuming persistent local disk if the selected host does not provide it.
Multiple app instances or a managed deployment may justify PostgreSQL instead.

Separate persistent concepts, without inventing unnecessary services:

- Accounts, passkey credentials, recovery-code sets and authenticated sessions.
- Posts and source revisions; thread/topic membership and successful-fetch metadata.
- Analysis runs, model outputs and the currently published content release.
- Per-account bookmarks, read state, reading preferences and visit state.
- Per-account companion appearance and authoritative progress inputs/state.
- Per-account feedback tied to the exact rendition evaluated.

Content refreshes must not replace user data. Stable forum identifiers connect bookmarks,
read state, feedback and analyses across refreshes. Recommended guest behavior: allow
browsing without an account; require authentication for account-backed persistence and
counted feedback. Do not trust old browser reader ids as evidence of account ownership.

## Authentication and recovery

Implement passkey registration/sign-in with a maintained WebAuthn library, not custom
cryptography. Use discoverable credentials for account selection without typing email.
A friendly account label may be generated; it is not a verified identity. Store an
opaque internal account id and credential public-key information. Require HTTPS in
production with an explicit relying-party domain/origin configuration. Choose a stable
production domain before enrolling real users because passkeys are domain-bound.

Use server-managed sessions with secure, HttpOnly cookies, appropriate SameSite behavior,
CSRF protection and server-side authorization on every account-owned operation. Take
account identity from the verified session, not a request-body/query reader id. Validate
short-lived, single-use challenges and user verification through the WebAuthn library.
Rate-limit registration, authentication, recovery and feedback operations. Avoid exposing
secrets or recovery codes in URLs, logs or analytics. Include session revocation/logout.

The user corrected the single-code proposal to **multiple recovery codes**. Ten codes
per set was suggested, but the exact number was not separately confirmed; ten is the
recommended initial default. Generate independent high-entropy codes with a secure
library/RNG and store only hashes. Let the user download the set at creation. Show the
remaining unused count; do not offer later retrieval of plaintext codes.

- Each code is single-use. Consumption must be atomic, including simultaneous attempts.
- Using one code consumes only that code. The other codes remain valid.
- Generating a replacement set requires appropriate recent authentication and invalidates
  all unused codes in the old set. It must not leave two active sets accidentally.
- Recovery should establish a new passkey and revoke pre-existing sessions. Recommended
  default: revoke old passkey credentials as part of completed recovery too, so a lost
  device cannot immediately regain access. Make this behavior clear in the flow.
- Do not automatically regenerate the entire recovery set after consuming a code; that
  would violate the agreed remaining-codes behavior.
- Allow another passkey to be added while authenticated. Credential changes require
  recent verification. Avoid removing the last usable authentication/recovery route
  without a clear account-loss consequence.
- Losing all passkeys and all remaining recovery codes means starting a new account;
  no email reset or manual identity-recovery process is planned.

Account deletion and sign-out of other devices are recommended small account controls.
If migrating browser-local preferences/bookmarks, make the import explicit. Never import
unauthenticated feedback as verified historical votes solely because a browser knows
its old reader id.

## Personal reading state

**Bookmarks:** one toggle per post and a Saved posts view. Folders/tags are out of MVP
scope. A bookmark persists through edits/analysis refreshes. If the source becomes
unavailable, retain a useful unavailable marker without exposing hidden forum content.

**Read/unread:** store the user's explicit choice. Use a quieter title/background and
Read label while retaining accessible text contrast. Keep this visually distinguishable
from filtering or poor-quality/tone indications. No automatic read detection, including
audio completion. Re-evaluating a post must not silently reset the user's explicit choice;
an Edited indicator can communicate source changes without rewriting read state.

**Saved filters:** recommended MVP is one automatically saved settings profile, synced
across authenticated devices. Named collections of presets were not requested. Store
actual threshold/unit choices (e.g. six months), not a frozen list of matching authors.
Preserve all current rubric settings, anonymity and version preferences. Unknown forum
account ages remain unknown and follow the current documented policy. Specify calendar
month/year semantics consistently rather than letting UI and backend disagree.

**Since last visit:** save visit state separately from login/session expiry and manual
read state. Capture the previous visit cutoff before recording the new visit and hold
it fixed for that browsing visit; requests/refreshes must not continually move it forward.
Define first-visit behavior explicitly, e.g. no previous cutoff with a clear label.

The exact visit boundary remains to be chosen. Suggested starting policy: a new active
visit after 30 minutes of inactivity, coordinated across tabs, with a site-wide previous
visit marker on the account. This is a recommendation, not a user-confirmed threshold or
scope; agree/document it before treating it as a contract. Separate simultaneous-device
visit contexts so one device cannot change another device's already displayed cutoff.

Compare forum `created_at` against that cutoff. Do not substitute first-seen/import time
or AI-processing time. An old post imported late remains old under this filter; do not
silently override the user's timestamp choice. Edited posts may be labelled separately;
the edit must not masquerade as a newly created post.

Display **Last updated from the forum: [date/time]** prominently for the relevant content,
with an unambiguous timezone or local-time presentation. Advance it only after a successful
pull for that scope. A failed/partial pull cannot claim all content is current. Fetch
freshness is distinct from analysis generation/publishing time; if those diverge, label
them truthfully rather than presenting a failed or pending analysis as current.

## Companion appearance and health

Persist a selected appearance id from a catalog of exactly ten options. Changing the
appearance should retain health and light-bulb progress; it must not create a new reward
balance. The visual catalog is a UI/assets task; account persistence should not require
generating images at runtime.

Preserve batch 001's two independent responses: emotional benefit affects cuteness/
emotional state; new-perspective feedback affects light bulbs. Derive progress from
authoritative feedback rather than accepting arbitrary score increments from the client.
Editing an answer replaces its contribution; clearing removes it; retries/reloads never
duplicate it. Re-rendering, listening and selecting/exporting posts grant no rewards.

**Still unresolved:** current 0–10 feedback scales mean no benefit through much benefit,
not harm through benefit. The user has not chosen signed sliders versus low-score
dimming. Do not reinterpret stored low scores as harm. Resolve scale semantics and the
health formula before implementing that dependent calculation; account/appearance and
feedback persistence can be built independently. Cumulative versus recent-state behavior,
decay and exact thresholds were not agreed. Do not invent absence penalties or pet death.

Also settle how repeated feedback on successive rewrites of one post affects progress;
a reasonable MVP cap is one contribution per account/post/dimension while retaining
version-specific answers for evaluation. Model comparisons must not become reward farming.
Rewarding positive feedback may bias helpfulness measurements; preserve useful negative
feedback and do not interpret pet-linked ratings as an unbiased model-quality benchmark.

## Feedback counts and abuse handling

Store one current answer per **account + rendition version + feedback dimension**.
Retain provenance to the exact source revision, rendition and producing analysis run.
Use stable rendition identity when unchanged text is reused, so unrelated post updates
do not invalidate every answer as a whole-corpus feedback hash does today.

Aggregate distinct respondent counts/distributions from these records. Changes and
clears adjust counts rather than adding another vote. Keep historical rewrite feedback
separate from current rewrite feedback. Existing mind-change ratings refer to posts;
keep their meaning distinct from feedback on a rendition.

Routine operator reports should show aggregates. Opaque internal account ids can support
deduplication and rate/abuse investigation without collecting real names or emails.
This is pseudonymous account-linked data, not anonymous data. Do not expose others'
individual answers in public APIs. Public display of aggregate rewrite feedback was not
requested; retain team reporting unless separately changed.

"Selections" here means feedback answers, not surveillance of checkbox selections used
for export or listening. No selection-history analytics are needed for this batch.
Passkeys do not prove one human per account; combine uniqueness constraints with modest
rate limits rather than claiming bot-proof voting. Define any security-log retention
deliberately instead of accumulating IP/device histories without a stated purpose.

## Operator-driven forum refresh and agent comparison

Implement a reproducible command plus concise reusable instructions usable from either
Codex or Claude Code. These example commands describe a proposed interface, not an
existing tool:

```text
zforum refresh --agent codex
zforum refresh --agent claude
```

Use one prompt/rubric/output contract and thin runner adapters. Preserve exact model and
agent/runtime provenance. Authentication/usage for those tools belongs to the operator;
do not assume unlimited subscription use or that an API-backed run is free.

Recommended stages:

1. **Fetch:** crawl configured threads/topics, discovering new posts and changes to older
   ones. Maintain a resumable cursor with overlap/reconciliation; a naive created-after
   query alone misses edits, deletions and delayed indexing. Follow existing read-only,
   anonymous, rate-limited forum rules, including backoff on 429 and hidden-post handling.
2. **Record:** persist source revisions and successful-fetch metadata. Do not overwrite
   user state. Source deletions/hiding must propagate to served originals, excerpts and
   derived material; failed AI work must not keep restricted content publicly visible.
3. **Prepare:** create immutable job inputs with needed surrounding/reply context. Reuse
   existing analyses only when source, relevant context, rubric, prompt and selected model
   policy permit it. Changed context can invalidate an unchanged post's analysis.
4. **Analyze:** run bounded jobs using the chosen agent; persist outputs/checkpoints and
   refresh affected topic summaries. No model calls on ordinary page loads or user
   bookmarks/read/appearance changes.
5. **Validate:** enforce schemas, coverage, ids, verbatim evidence and provenance with
   existing deterministic checks. Validate against the exact job inputs. These checks
   establish structural properties, not complete factual accuracy or faithful reasoning.
6. **Publish:** import validated results through application code and atomically switch
   the published content release. Keep the previous usable release if processing fails,
   subject to immediate content-visibility restrictions. Report pending/stale analysis
   honestly. Support rollback without rolling back accounts or user actions.

Retries must not duplicate content or feedback, and completed unchanged jobs should be
reused after interruption. Bound concurrency and usage; make failures and partial work
visible in a final run report. Record provider-reported usage/cost when available and
clearly label estimates/unavailable values.

Models read untrusted forum text in restricted job workspaces. They should write analysis
artifacts, not execute unrestricted SQL against production or access private account data.
Keep production import authority in the operator/application layer. Prompts must treat
forum instructions as data; permissions must limit damage if that instruction fails.

For comparisons, freeze one source/context snapshot and use identical rubric/prompt
inputs for each candidate. Store both outputs rather than overwriting the last accepted
file by job name. Compare faithfulness, missing arguments, invented claims, tone changes,
schema/quote failures, time and usage. Use human-reviewed/blinded samples where feasible;
the provisional calibration examples are not validated ground truth. Only explicitly
publish the selected candidate; comparisons do not replace live output automatically.

## Choices to settle before dependent implementation

- Hosting, deployment/domain and database: one durable server/SQLite is recommended,
  but no hosting preference was supplied. No deployment is authorized by this handoff.
- Visit boundary and site-wide versus topic-specific scope; previous-cutoff behavior
  and forum timestamp semantics above are already agreed.
- Initial crawl scope: the configured ZCG threads, a chosen topic set, or discovery across
  more of the forum. Do not assume authority to crawl the entire forum or add schedules.
- Pet scale/health formula, as carried forward from batch 001.

Resolve routine implementation details with the simplest compatible design. Keep progress
on independent work; do not treat these questions as a reason to stop all backend work.
Do not re-ask the settled choices: multiple recovery codes, since last visit, explicit
read/unread, forum timestamps, visible last-successful-pull time, ten pet appearances.

## Acceptance and verification

- Passkey registration/sign-in and account ownership work across supported browsers;
  wrong-origin, expired/replayed challenges and cross-account requests are rejected.
- Recovery codes work independently, cannot be reused/raced, are stored hashed, and
  replacement invalidates unused old codes. Recovery/session-revocation behavior matches
  its UI and leaves the agreed remaining codes valid.
- Bookmarks, read/unread, appearance and settings persist across sign-in/devices. Merely
  opening/listening does not change read state. Appearance switches preserve progress.
- Since-last-visit boundaries remain stable across refreshes/tabs and handle first visits.
  Old posts imported late stay old; freshness labels reflect successful scoped pulls.
- Feedback edits/clears/retries and multiple rewrite versions yield exact expected counts;
  users cannot read/write another account's private state. Pet rewards do not duplicate.
- Refresh tests cover unchanged/new/edited/hidden/deleted posts, relevant-context changes,
  rate limiting, interruption/resume, validation failure, atomic publication and rollback.
  User state survives refresh and rollback. Test backup restoration as well as creation.
- Agent comparison preserves identical inputs and separate outputs/provenance. No
  comparison candidate is silently made live. No secrets enter model artifacts.
- Migrate existing data explicitly; keep unattributable old feedback historical rather
  than claiming it belongs to authenticated users. Preserve existing framework, export,
  source navigation and feedback functions.
- Run repository checks and real browser flows. Prior environments failed localhost
  binding/Firefox automation; report any continuing limitation accurately instead of
  claiming visual/authenticator verification from unit tests alone.
- Stage only owned changes, inspect commits for relevant security issues, and report
  remaining risks/verification limits. User review is still required.

## Design references checked in the discussion

- Passkeys and credential management:
  https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys
- Session/cookie protections:
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- SQLite deployment fit and limits:
  https://www.sqlite.org/whentouse.html
- Codex scripted execution:
  https://learn.chatgpt.com/docs/non-interactive-mode
- Claude Code scripted execution:
  https://code.claude.com/docs/en/headless

Verify chosen dependency APIs and runner flags at implementation time. The references
support feasibility and general practices, not a completed security review of this app.
