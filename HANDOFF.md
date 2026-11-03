# Handoff — resume state

Updated 2026-11-02 after transfer restoration (`D-89`).

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
- Node.js, Cargo and Fly CLI are absent from the current shell PATH. Application
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
