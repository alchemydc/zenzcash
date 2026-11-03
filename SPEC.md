# zforum — design

Source: the design conversation recorded 2026-10-31 19:26 and the user's corrections to our
summary of it (`WORKLOG.md`, `D-35` to `D-44`). The first prototype, which this replaces,
is in `archive/research-prototype/`.

## 1. Goal
**As a reader, I want to understand what is being argued on the forum so I can take a
position**, then post it on the forum, vote with it, or discuss it with people.

The deeper motivation is tone. Emotional, provocative arguing on the forum makes people
avoid it altogether. So the main feature is a **desaturation of the emotional tenor**. The
reader can follow the debate without contempt, poorly thought-out or one-sided reasoning,
repetition, or claims made without proof. Success means readers find zforum calmer and
more positive than the forum, and come back.

zforum is read-only. It never posts to the forum.

The header exposes an icon-only light/dark button for all readers (`D-91`). A moon
offers dark mode; a sun offers light mode, with an accessible action name and
tooltip. Until the first explicit choice, the theme follows system changes. A
choice is saved in this browser, independent of sign-in and reading preferences.
Switching changes colors without rebuilding the page or moving reading focus/scroll.
Storage failures are reported beside the control; the choice still applies for the
current session. Invalid saved values are reported and the system preference is used.

## 2. Home page
- A **board of cards**, one per topic. Each imported forum thread becomes its own topic
  by default (1:1). Only an explicit maintainer decision merges threads into a shared
  topic; discovery and AI analysis do not group them automatically (`D-77`).
- Each card shows a short title, a one-line description, keywords, and statistics: posts,
  threads, participants, and how long the participants have been on the forum.
- The AI picks the topics to suggest from activity; suggestions do not change thread membership.
- An **interest filter**: governance, protocol, grants, developer work.
- **No sides on cards.** Splitting a debate into sides is premature.

## 3. Topic page
1. **A compact headline and optional debate summary** (`D-60`). The summary starts
   collapsed so a reader can proceed directly to individual posts. Opening it reveals a
   short cited orientation and the question cards below. The orientation explains what
   could change, why people disagree and what is undecided, including necessary acronyms.
2. **Reading settings next to the discussion** expose independent tone and argument-support
   presets, explicit handling of unassessed replies, passage-flag and account-age filters,
   anonymous mode, preferred text version and mind-change ratings. Settings also control
   disputed-assumption flags, constructive-reframing highlights and new-post highlighting.
3. **Six expandable question cards** (`D-58`, `D-59`) replace the duplicate full list and
   grouped arguments. Every heading and one-sentence description is visible when the optional summary is open.
   Opening a card shows the decision at stake, relevant positions and an unresolved
   question (currently 64–71 words before optional detail). **Explore the arguments**
   reveals the cited individual arguments and evidence, limits, values, objections and
   questions that could clarify the dispute. More than two positions are included where
   needed. Each detailed argument has one home; related-question links cross-reference
   shared concerns. **Next question** opens and focuses the next heading without closing
   earlier cards or advancing automatically. Disclosure state survives settings and thread
   changes for the page session; there is no persistent progress or completion score.
   A visible AI-generated-analysis disclosure states that the notes are unreviewed and
   may misinterpret posts. There is no report invitation without a configured contact.
4. **Citations** name the thread and post (A#12) and are coloured by the cited post's
   tone only (0–1 red, 2 amber, 3 green, null unassessed), not argument quality. Clicking
   one expands that post in its thread's tab with its original text
   showing.
5. **What's new** owns its time controls directly beside the heading: 6, 12 or 24 hours,
   a custom number of hours, last visit, or off. The controls remain present when off.
   In the chosen window, new posts are marked, each thread tab counts its new
   posts, and points first made in that window are listed. A visit begins after 30 minutes
   of inactivity. Its previous cutoff stays fixed for that device visit; authenticated
   accounts have site-wide history, and guests keep browser-local history. Newness uses
   forum creation timestamps, never import time, edits, login or playback completion.
6. **The discussion is one tab per thread** (`D-48`), drawn like the forum itself: the thread
   title, letter avatars, bold usernames, the date at the right, thin dividers. It is headed
   as a read-only copy of forum.zcashcommunity.com, with a link to the thread; it uses no
   forum logo and no copied stylesheet. zforum's own additions inside it (the account-age
   badge, marks, ratings, feedback) keep zforum's style, so they stand out. Posts load 20 at
   a time as the reader scrolls, like the forum, and a click inside a post changes only that
   post (`D-51`).
7. **Every visible post starts collapsed**, showing its author, account-age badge and a
   succinct AI summary of at most 160 characters. **Collapse all posts** closes every
   expanded post across threads. Expanding exposes **Neutral rendition, Original and Diff**
   tabs where a rendition exists, then separate AI assessments and analytical notes.
   Readers choose the default version; citations and deep links always open the original.
   A post without a useful rendition shows the original. Diff marks removed/added authored
   wording; quoted replies remain separate and unchanged. Filtered content is greyed when
   expanded. The forum's hidden posts expose no text or selection/expansion controls.
8. **Anonymous mode** hides authors so arguments are read on their merits. Authors become
   consistent pseudonyms ("Participant 7", with a "P7" avatar), and account age is hidden
   too. The reader can reveal the author of a single post, or switch the mode off.
9. **Mind-change ratings** (§6), behind a toggle.
10. **Restatement feedback** (§7) on every post that has a restatement.

## 4. Faithful neutral renditions and separate analysis
D-54 and D-61 replace the former tone-only contract. A rendition preserves the author's
claims, support, stance and strength, uncertainty, conditions, counterexamples, relevant
experience, attribution, links, material figures and unresolved disagreement. Central
allegations remain attributed allegations. Removing ridicule must not invent evidence,
add a conciliatory motive, erase dissent or turn a hypothetical into an event. A pure taunt
may have no useful rendition; its summary describes the reaction without inventing an argument.

The **AI-generated analysis** layer is separate from the rendition and original. Notes cite
exact authored passages and distinguish explicit claims from AI interpretation, with
confidence. They are generated without requiring individual approval. The disclosure says:
“These notes are generated by AI and have not been reviewed by a human. They may
misinterpret a post or miss context. Active maintenance is not guaranteed.” There is no
invitation to report without a working contact route. Original and Diff remain adjacent;
claims and rendition changes have a separate inspectable audit.

## 5. Independent post assessments and reading filters
The authoritative provisional rubric and closed vocabularies live in `site/js/rubric.js`.
Every visible post has independent 0–3 or null dimensions: **Tone**, **Assumptions and
certainty**, **Argument support**, and **Contribution to understanding**. There is no
composite maturity or credibility score. All assessments describe the original. Each has
a specific rationale, confidence and authored evidence spans; null requires an explicit
not-applicable or insufficient-context reason. Short questions and preferences need not
have an argument-support score. Tone also records the harshest supported passage, with
severity and scope, so a long restrained passage does not cancel an isolated attack.
Quoted attacks are not attributed to an author who rejects them.

Passage flags carry exact evidence, explanation, target, severity, scope and confidence.
They include both concerns and constructive behavior. Expanded assessment details expose
all flags and scale meanings, the context used and missing context, extracted claims,
verification status, rendition audit and any suggested human review. No independent
factual verification is claimed.

| Reading control | Choices |
|---|---|
| Tone | All tones; restrained and pointed (≥2); restrained only (3) |
| Argument support | All contributions; reasoned arguments (≥2); well-supported arguments (3) |
| Unassessed replies | Keep unassessed contributions (default); assessed arguments only |
| Contribution kinds | Independently include arguments, questions, proposals, corrections, preferences, experiences, social replies and mixed posts |
| Passage flags | Grey posts containing any selected flag |
| Minimum time on forum | Any; 1, 3 or 6 calendar months; 1 or 2 years; custom months |

Defaults include all tones and support levels. Tone filtering also accounts for material
or severe peak passages below the chosen threshold. Unassessed arguments stay visible
unless the reader explicitly chooses assessed arguments only. Unknown account ages are
included. Filters give reasons, never delete post rows, and grey their content when opened.
Summary arguments and dissent remain available regardless of filters. Settings show each
issue's matching/total source counts, including issues without any matching sources.

## 6. Mind-change ratings
Readers rate how a post moved them (`D-42`):

| Rating | Value | Meaning |
|---|---|---|
| Dug me in | −1 | inflammatory; made me hold my old view harder |
| No change | 0 | didn't move me |
| New light | +1 | made me see something differently |
| Changed my mind | +2 | flipped my position |

A signed-in reader can clear their rating. The API exposes aggregate counts and the reader's
own answer. Ownership comes from a server session, never a browser-provided reader id.
Passkeys do not establish one human per account. Old browser-id files remain unattributed
history, separate from authenticated ratings.

## 7. Restatement feedback
Two sliders on every post that has a restatement, alongside the mind-change ratings
(`D-50`). They tell the zforum team whether restatements work:

| Slider | Question |
|---|---|
| Emotions | How did this restatement affect your feelings? |
| Head | How did this restatement affect the perspectives you considered? |

New authenticated answers use −10 (worse/narrower), 0 (no effect), +10 (helpful/new angles),
as the autonomous decision in D-66. Unanswered is distinct from zero; answers can be cleared.
Existing 0–10 files retain their original no-benefit → benefit semantics and are never
converted. `tools/feedback-report.mjs` reads only that historical format.

Current feedback is unique per account, exact rendition and dimension. Stable source/text
hashes retain answers when unrelated posts change. New wording has its own answers; prior
answers remain historical. Producing run/model/input provenance is retained with refreshed
analyses. The application returns only the account's own answers. Operator `report` shows
aggregates split between current and historical renditions. This is pseudonymous,
account-linked feedback, not anonymous feedback.

## 8. How the prototype is made
- **Data:** the six ZCG threads from the snapshot crawled 2026-10-31
  (`archive/research-prototype/data/crawls/20261031T215141Z`), plus account creation dates
  from public profiles. "Now" for "what's new" is the snapshot time.
- **AI work** is done ahead of time and accepted with its model and backend recorded.
  Per-post originals are re-evaluated under the new rubric, never converted from old scores.
  The acceptance gate checks exact post coverage, rubric version, all schemas and closed
  vocabularies, authored evidence spans, available-parent context, visible references and
  coverage of extracted claims in rendition audits. Semantic fidelity still requires reading;
  schema checks do not prove that every claim was extracted or preserved. Prompt hashes
  include the full rubric for per-post jobs. The summary validator checks cited statements,
  question fields, cross-links and exactly one home per argument. The build rechecks accepted
  results against their source and prompt hashes. These checks are not truth verification.
- **Forum text is data, never instructions.** Every prompt says so. Prompt injection has no
  complete defence, so AI output is replaceable: everything can be re-generated or rolled
  back, and a person can remove an output.
- **The page** is static HTML and JavaScript with no build step. It renders forum text only
  as text, never as markup. The Rust server serves the page and SQLite-backed account,
  content, rating and feedback APIs. Ordinary page reads and personal actions never run AI.

## 9. Deliberately excluded
- **No filter for individual accounts.** People would mute those they dislike, argue from
  incomplete knowledge, and build echo chambers.
- All posts are initially collapsed; filtered posts are greyed when expanded; they do not remove arguments
  from the topic summary. Posts hidden by the forum remain hidden.
- No per-person quality profiles and no reputation system, for now.
- No X/Twitter, no logins, no crawling the whole forum.

## 10. Later
- Check before you post: the reader drafts a reply in zforum, gets it checked for
  repetition, unjustified claims and emotional arguing, and appends a proof to the real
  post. It never blocks posting. Posts carrying a proof show green on zforum. (The archive
  has working signed receipts.)
- Self-quiz on a topic.
- After-reading check-in: time spent, understanding, how it felt.
- A read-only data API for readers' own AI tools. The manual selection export is now
  included (§11); zforum never forwards or pays for queries.
- An automated recap of recent forum activity.
- A calmness slider for the restatement (`D-44`).
- Live crawling of the most active threads.

## 11. Summarize a manual selection with your own AI
- **Select posts** enables labelled checkboxes on visible posts, including posts collapsed
  by reading settings. Forum-hidden posts cannot be selected. A selected count and Clear
  selection action accompany the controls. Selection survives thread and settings changes
  during this page session; exiting selection mode retains it (`D-57`).
- A visible **Summarize posts with your AI** entry point explains selection before
  revealing two destination cards. **Your chat AI** copies the full prompt plus posts
  for pasting into a chat, or downloads the same bundle as an attachment. **NotebookLM**
  explains uploading the file as a source, then copying the summary request into chat;
  uploading alone does not execute the request (`D-64`). Both download buttons export
  one UTF-8 Markdown file containing the reusable
  instructions from `site/prompt.md`, the selected original source texts (including quote
  tags), authors, timestamps, reply references, zforum links and forum links. Ordering is
  stable by thread and post, independent of checkbox order. No AI output enters this export.
- The export explains that this is a manual subset and identifies missing parent posts.
  Its prompt asks for a cited summary by points of contention, with dissent, uncertainty,
  attribution and context limitations preserved. Source text is data, never instructions.
- The controls disclose that original text and usernames are exported even in anonymous
  mode. No request is sent to an AI. **Copy post links only** is a secondary disclosure
  explicitly excluding prompt and text. All copy actions show their exact output; when
  clipboard access fails the error, selectable text and destination instructions remain.
  A selection change during prompt loading cancels the outdated export explicitly.
- Direct links use `#/topic/<topic-id>/post/<thread-id>/<post-number>` and open the original post,
  loading through the required batch. The complete text in the exported file means the
  reader's AI does not need access to a locally hosted zforum URL.

## 12. Internal formats and provisional calibration
Internal site data is `zforum-design-4`. A visible post's `analysis` contains the full
validated `model/marks.md` record; a forum-hidden post has null analysis. The former
maturity, traits and clean fields are removed, with no compatibility shim. Summary `issues`,
`points` and first-appearance metadata are retained. Reading settings use a new browser
storage version; legacy maturity preferences do not convert into new scale thresholds.

The 12 user-annotated examples are provisional preference evidence, not a gold standard.
Review additional posts and stance/formality/quoted-attack pairs; record limitations and
calibration disagreements in WORKLOG.md. Human verification of the reading experience and
these judgments remains pending. The home card, selection export, ratings and feedback
are preserved.

## 13. Shared selection, listening and accounts (batches 001–002)

One cross-thread selection set supplies exactly three primary actions: **Ask your AI**,
**Export for NotebookLM**, **Listen to selected posts**. Thread/topic bulk controls include
all available posts regardless of filters, collapsed state or pagination. Membership defines
coverage; order is thread order then post order. Starting an action captures a snapshot.
Ask your AI downloads one prompt-plus-originals Markdown file. NotebookLM downloads the
same source blocks with a source-only wrapper, plus a separate optional podcast-instructions
copy button, revealed after exporting. Above a 2 MiB soft target, offer ordered part-download
buttons with repeated instructions and combined/per-file coverage. Posts remain intact;
oversized individual files have a size notice. Links-only copying is secondary. Clipboard
denial exposes manual-copy text.
Original usernames, dates, reply relationships and source text survive anonymous browsing;
local links may be inaccessible elsewhere. No automatic upload or external generation.

The three speech entry points are overview, one post and selection. One browser speech
player owns cancellation, pause/resume, next/previous/restart and 1/1.25/1.5/2x rates. It
reads existing originals or renditions, preserves quoted attribution and labels original
fallbacks. Passages prefer sentence boundaries. Local voices are preferred; remote voices
are disclosed, and an unavailable explicit voice stops playback with a message. Replacement
speech waits for cancellation to finish, with a visible timeout. Pause cancels the engine
and resumes from the current bounded passage. Restoring local position never autoplays;
changed snapshot/rendition corpus or attribution mode invalidates the queue. Device speech,
mobile placement, background/screen-lock behavior and NotebookLM import require real checks.

The **Zamagotchi** offers ten appearances sharing one account's authoritative feedback-derived progress.
Emotional state uses the mean of the latest answered rendition per post/dimension: below −2
is quiet, above +2 happy, otherwise neutral. Perspective illumination uses 0–5 bulbs:
`ceil((mean + 10) / 4)`, bounded to 0–5. Empty dimensions have mean zero. Editing replaces;
clearing removes a post's contribution rather than reviving an earlier rendition. Dimensions
are independent. No rewards for playback/export, absence penalties, death or decay. Appearance
changes retain progress. The user approved these defaults and the Zamagotchi name (D-71);
pet-linked answers are not an unbiased model-quality benchmark.

The Rust application uses one local durable SQLite database, WAL, foreign keys, schema
migrations and transactional publication/recovery. Backup uses SQLite's consistent backup
API, with a new mode-0600 destination. Restore by starting against a verified backup copy on
an unused path, never replacing a running database. Fly.io is the selected hosting target
(`D-89`); deployment and durable-storage behavior are specified in §21.

Passkeys use webauthn-rs through a bounded private verifier executable. Its serialized state
stays server-side. Discoverable credentials, required user verification, single-use five-minute
challenges, exact RP/origin validation, HttpOnly SameSite-Strict sessions, Origin/CSRF checks
and per-IP in-memory limits protect account routes. Sessions last 30 days; sensitive controls
require verification within five minutes. Limit buckets expire after a minute and are capped
at 10,000; IPs are not persisted. Reverse proxies currently share a backend IP bucket; no
untrusted forwarded header bypass is used. Production needs an explicitly chosen HTTPS origin.
The verifier builds successfully and passes challenge-generation smoke checks. Real
authenticator registration, sign-in and recovery remain unverified. Missing or failing
verification never grants account access.

Enrollment yields ten independent random 256-bit recovery codes, displayed/downloadable once;
only hashes persist. Recovery consumes one code atomically, replaces old passkeys, revokes old
sessions and preserves the other codes. A new set invalidates every unused old code. Losing
all passkeys and codes means a new account. Account deletion removes account-owned data.

Bookmarks and manual read/unread survive content revisions; unavailable bookmarks retain a
marker without source text. Read styling is independent from filters. One reading profile
syncs across authenticated devices, with explicit browser-filter import. Calendar months
subtract in UTC with end-of-month clamping; a year is twelve months; unknown ages remain
included. Browser preferences are version 4; old version-3 values remain untouched and show
a migration notice rather than silently interpreting day thresholds as calendar months.

## 14. Operator refresh and comparisons

**MVP import supersedes the bounded scope below (D-83).** `scripts/zforum import [UTC]`
discovers all anonymously listed active threads and fetches their full histories. Activity
is the forum's bumped_at value. Two matching listing passes mitigate pagination movement;
this is a live pull, not a point-in-time reconstruction or a guarantee of unlisted content.
All tracked threads are reconciled even when quiet. A first import requires a strict UTC
timestamp; later imports use the last completed upper cutoff with five-minute overlap.
Only full success advances that cutoff; interrupted runs freeze their settings and resume.
An explicit earlier timestamp extends coverage. Source thread IDs determine default topic
IDs (`thread-ID`); SQLite uniqueness on global post IDs and thread/post numbers prevents
overlapping-import duplication. Existing explicit topic membership wins over defaults.
Post moves are explicit errors rather than silently reassigning identity.

Schema 5 adds import runs, topic membership, source snapshots and post identity tracking.
**D-92 supersedes automatic publication.** `import` / `import fetch` fetch and preview
only; `import preview` reprints the frozen run without network/model calls or DB writes;
`import analyze --max-calls N` analyzes with a global per-invocation attempt allowance;
`import publish` publishes previously validated candidates. Analysis cannot publish, and
publication cannot fetch or call models. There is no implicit transition between stages.
Fetch still records source observations and immediately enforces visibility restrictions.
Reviewable private `preview.json` and `preview.txt` show changed post links/excerpts,
job counts, validated cache hits/misses and character counts. Marks identity/prompt size
depends on the accepted summary; pending values remain explicitly unknown. These counts
are not a token budget. After analysis, include candidate overview/post summaries and
renditions plus actual recorded attempt usage, including rejected results.

Code runs committed prompts through subscription-authenticated Codex, rejects API-key
auth and omits API-key environment variables. Fetch/preview require no model authentication.
Validated matching results are cached. The global call allowance includes concurrent calls
and validation retries across topics, and resets on each explicit analyze invocation.
All remaining candidates and baseline releases are checked before publication begins;
retries after a successful publication accept the same enriched release content. Publication
is atomic per topic. A failed publication can have completed topics but cannot claim full
coverage. Full report and frozen artifacts remain private. Fetch retries retain the original
source comparison even when a previous source-recording operation succeeded before failure.

`--db` selects a rehearsal database; default remains `work/zforum.sqlite`. Fetch-only
`--thread ID` scopes the run to the existing topic containing that thread (including its
explicit group), or a new single-thread topic. It skips listing discovery and never advances
the full-forum cutoff; complete historical unscoped runs retain their cutoff semantics.
The scope is frozen on resume. First imports still require a UTC timestamp. An unfinished
pre-staging run is rejected with an explicit migration requirement; completed history remains
readable. Tests cover call bounds, independent stages, resumability and scoped coverage.
There is no scheduler. Startup no longer seeds ZCG. A separate backed-up reset clears
content/import state and content-dependent test feedback while preserving login data.

The following commands remain available for operator comparisons and the old bounded test.

`README.md` contains exact commands. Fetch reconciles one configured topic's full threads,
including old posts and complete post-id membership, using anonymous one-request-per-second
forum access with bounded 429 backoff. It records incremental progress, immutable completed
source pulls and public profile dates. An interrupted fetch safely starts a new full
reconciliation on retry; it does not trust a partial cursor as a complete snapshot. Completed
analysis jobs resume by exact hash. Unavailable profiles remain unknown. Weekly discovery
reads recent-activity listing metadata, bounded to twenty pages, and selects only the three
explicit test topics (bug bounties, Zebra disclosure, Konclave). Tracked test topics remain
in scope when quiet. ZCG remains a separate six-thread topic. There is no full-forum import
or scheduler. The source replay omits recent posts from current snapshots; it is not a
historical reconstruction. Synthetic changes never enter the application database.

Topic membership follows `D-77`: one imported thread per topic by default, with manual
merges decided by the maintainers. Updates retain those explicit groupings; finding a
related thread does not add it to an existing topic. The existing six-thread ZCG grouping
is retained. Configuration currently declares membership; a dedicated operation for
merging already-published topics is not implemented. This policy does not expand the
bounded import allowlist or authorize a full-forum import.

Every observed hidden/deleted post is immediately restricted in SQLite. If a published topic
still contains one, the entire topic is temporarily withheld (including summaries and exports)
until a safe checked release exists. Restrictions survive rollback. A successful pull advances
freshness only after all configured scopes/profiles finish; the displayed snapshot and pending
analysis status remain distinct. Partial failure cannot claim complete freshness.

A run freezes source/context, prompt and rubric inputs. Each named candidate keeps its own
explicit agent/model, runtime, prompt/view/context hashes, results and usage metrics. Null cost
means unavailable, not free. A topic's context changes conservatively invalidate its jobs;
independent topics and identical fresh runs reuse validated cached artifacts. Live summaries
have one to six questions and can show one position, without manufacturing debate. Marks
jobs use the generated question catalog and target at most eight posts with full thread
context. Historical initial prompts remain byte-preserved under `model/initial`.
Sequential jobs have per-invocation call limits and per-call timeouts. Validation failures
get at most three attempts with explicit feedback; rejected outputs, actual request hashes
and usage are retained. Claude also accepts a per-call dollar
cap. Codex has no asserted dollar cap. Failed/partial runs keep checkpoints and a failure report.

Codex and Claude adapters launch through Linux bubblewrap with only public job data, system
runtime files and the selected provider credential file. Private application DB/home/project
files are not mounted. Claude tools/MCP and Codex shell/web, apps, plugins, subagents and image
generation are disabled. No shell command
strings are constructed from source text. Missing isolation or authentication is an explicit
failure. Live Codex requests are recorded with measured usage; dollars remain null when
the provider does not report them.

Candidate validation uses existing schemas, ids, quote/coverage checks and exact frozen inputs.
Publication is an explicit command and atomically imports one topic through the application; accounts,
feedback and reading state remain intact. Comparisons require identical frozen inputs, preserve
both outputs, produce aggregate run metrics and a twelve-post blinded A/B packet with human
faithfulness/missing-argument/invention/tone fields. Structural validation is not a semantic
quality judgment. Rollback selects an old content release without reverting personal state or
visibility restrictions. Database schema 3 stores one published release per topic. The
catalog omits all text from temporarily withheld topics, and their ratings/feedback are
excluded from current-content responses. Bookmarks remain as unavailable markers.
Every analysis retains its producing job, recorded model/backend,
prompt/view hashes and artifact fingerprint. Initial legacy artifacts have null runtime and
full-context input hash because those were not recorded; new runner analyses include both.

## 17. Reading experience, batch 003 (D-78–D-79)

This section supersedes older interface/filter/feedback descriptions above. The scoped
implementation prompt is `agent-prompts/003-reading-experience-and-simple-feedback.md`.

Navigation separates Home, Topics and How to use from Profile and Saved Posts. Guests
see Sign in. Home explains the purpose and Zcon 7 workshop origin; public impact stats
remain deferred. Topic pages name their included forum threads immediately below the
headline, report the last forum pull, put What's new first, and show the Topic summary
without requiring expansion. Individual questions and expert tools start collapsed.

Reading preferences are version 5. Tone, support, account age and re-write availability
are multi-select unions within each field and intersections across fields. Tone bands
map 0–1 to Bad, 2 to Moderate and 3 to Good; material/severe tone peaks participate.
Support maps 0–1 to Low, 2 to Medium and 3 to High. Null assessments and unknown ages are
included. Age bands partition calendar ages into under 6 months, 6–12 months, 1–3 years
and 3+ years; Custom uses inclusive minimum/exclusive maximum calendar months. Any
selects all standard bands. Nonmatching posts become compact reason rows with Show.
Removed contribution/flag/unassessed filters cannot remain active through stored settings.
Legacy version-4 browser/account preferences migrate explicitly to this contract.

Read Neutral Re-writes is one display preference: Show me the re-write first (default)
or Show me original text first. Original and Changes remain accessible. Posts start
collapsed; expanding does not mark read. All threads together and Newest first are the
defaults, with By thread and Oldest first available. Reply/citation navigation opens
original text even outside the selected filters. Ordering does not change selections.
Timestamps use the system locale/time zone and include a relative age. Author reveal is
reversible. Mind-change controls and mood reactions sit near the post header; explanation
and evidence live under Why this rating? No single combined quality score is introduced.

The new mood API is authenticated and CSRF/origin protected:
`PUT /api/account/mood/{thread}/{post}` with `{ "score": -1 | 0 | 1 | null }`.
Re-write feedback retains rendition-version identity but accepts only -1, 0, +1 or null
for Heart (`emotions`) and Head. Null means unanswered/cleared; zero is an answer.
Database schema 4 preserves old signed rows in `feedback_signed_v1` and its clear table;
no old score is converted into a ternary answer. Reports label the new scale
`ternary-benefit-v2` and keep historical counts separate. Deleting an account cascades
through both current and historical personal feedback.

Pet emotion is the mean of the latest active mood or Heart contribution for each post.
Head is the mean of the latest answered Head contribution per post. Repeated identical
answers do not advance sequence or grant rewards. Clearing removes that channel; another
remaining channel can supply the post's emotion. New nonzero changes animate unless the
system requests reduced motion. Expressions indicate positive, neutral or negative mean;
positive Head means light up ceil(5 × mean) stars, with zero stars for nonpositive/no data.
Ten CSS-illustrated species share expressive faces. The pet occupies reserved top-right
space, including in the compact mobile header. Health does not decay with absence.

Expert tools provide Listen to selected posts and Export selected posts. One shared
prompt plus original-source bundle serves chat AIs and NotebookLM. Selection shortcuts
include individual posts, all available posts in a thread/topic, and the explicit What's
new window. Windows compare forum creation timestamps against the topic snapshot, and
changing the window does not change the selection. Collapsed/not-yet-rendered posts are
included, forum-hidden posts are excluded. Exports capture their selection/data before
asynchronous template loading, retain source links and usernames, and split large files
between posts. The site does not upload sources to third-party AI services.

## 18. Topic navigation and filter polish, batch 004 (D-81–D-82)

This section supersedes §17's age choices and time windows. The execution prompt is
`agent-prompts/004-topic-navigation-and-filter-polish.md`. Public impact stats remain
hidden. Authenticated header navigation includes Log out on topic and other pages.

Preferences are version 6. `minAccountMonths` replaces age bands/custom ranges: an
inclusive minimum in integer calendar months, 0–1200, measured at the content snapshot;
0 means Any and unknown profile ages remain included. The slider steps one month over
0–120 by default, extending to a saved higher value; the exact-month field permits the
full range. Nonmatches remain compact rows with Show. V5 migration takes the lowest
selected band/custom minimum (no selections -> 0), discarding upper bounds and gaps.
V4 minimums migrate directly. Tone/support/re-write availability remain multiselect.

`since` is exactly `{kind:"pull-days",days:1|3|7}`. Default is 1 day. The exclusive lower
bound is last successful pull minus N × 24 hours; the inclusive upper bound is the pull.
Use `last_pulled_at`, or the source snapshot timestamp for the initial imported release
which has no separate pull record. Forum creation times determine new posts; checked
point `first_at` metadata determines new points. Hidden posts and points with no visible
citation do not contribute; timestamps after the pull do not count. Counts can match
across windows. New pulled content awaiting analysis gets an explicit warning: counts
cover checked data only. No model call occurs when changing the window. Prior hour
choices migrate to 1 (≤24), 3 (≤72), or 7 days; Off/last-visit migrate to 1 day. Stored
visit tracking is retained but no longer drives What's new. The pull time and exact range
sit beside the three controls. Window changes do not modify selected posts.

Highlights/author identities and new-points disclosures retain state across filter
redraws, including zero-point windows. Every reading/time/view filter has an info button:
hover/focus previews, click pins, Escape dismisses. Pinned explanations survive redraws.
Expand all marks every available post in the current combined/thread stream expanded,
including later pagination; exclusions remain compact and hidden forum posts unavailable.
Collapse all clears expansion. Save uses an outline/filled bookmark. Re-write reactions
appear − / 0 / +. Repeated audit operations render once with distinct source quotations;
the accepted model artifacts are unchanged.

Topics directory interests match any selected primary subject, combined with title-only,
case-insensitive keyword search (all whitespace-separated words must occur in the title).
No search of body, byline or keyword chips. Sorting is by latest forum post (default) or
post count, descending, with topic-id ties. Search/sort are temporary page state. Featured
cards follow maintainer order and obey the same filters, appearing only once. Up to three
ids are permitted; D-82 selects ZCG only for now. Unavailable/unpublished topics do not
render even when configured as featured.

`site/topic-curation.json` contains `featured` and primary `interests` overrides (1–2
valid tags each). Existing broad AI tags are retained in source data. Future summary
instructions request only 1–2 primary tags; historical validation remains compatible.
Maintain featured ids with `node tools/curate-topics.mjs feature zcg [second] [third]`.
The command validates configured ids and writes atomically; empty ids clear the list.
Edit primary overrides in the same reviewed file. Refresh the page after changing it.
Only this exact configuration file is added to the server's public static allowlist;
there is no reader-facing global editing endpoint. Account/database schema stays 4.

## 19. Explicit topic grouping (D-86–D-87)

An operator may combine checked source topics without rewriting their posts. Build a
request using `node tools/group-topics.mjs INPUT.json OUTPUT.json`, then publish with
`zforum-server merge --db DATABASE --file OUTPUT.json` under the existing import lock.
The input names `id`, `title`, a frozen `snapshot`, current `sources` (data/snapshot
pairs), any `recovered` checked releases and a validated combined `summary` artifact.
Source equality includes text, segmentation, author, creation time, reply and visibility;
JSON object property order is immaterial. Changed/new source requires new checked
assessment instead of silently reusing the old one. Forum post IDs remain stable.

The combined summary is newly generated and independently validated. Original assessments
and their provenance stay intact. Each thread records its original assessment topic,
release and question labels in `assessment_context`, so old `issue_ids` are not silently
reinterpreted as the combined summary's question ids. New summary provenance is separate.

Publication is one SQLite transaction: compare expected source release IDs, refuse active
imports or conflicting owners, remove superseded listings, publish the combined topic and
update import membership/snapshot/summary. Store the exact checked snapshot JSON bytes
(verified against its parsed values) so field ordering does not change source hashes.
Reject partial topic coverage and changes to
already-published posts. Failure rolls back all writes. Other topics and personal state
remain untouched. Retained releases are audit history; ordinary per-topic rollback is not
a group-splitting command. A later split requires another explicit membership operation.
Default `thread-ID` links resolve to their containing merged topic; unrelated post IDs do
not resolve through such an alias.

Separately fetched threads retain their actual per-thread pull timestamps. Until the next
full group refresh, What's new conservatively ends at the earliest included pull, with
an explanatory disclosure listing all six times. Grouping is not presented as a new pull
of already-imported threads. Future imports reconcile the recorded six-thread group.

The first grouping is `zcg`, suggested title "The future of Zcash funding", containing
58515, 58566, 58571, 58610, 58611 and 58656. Only the missing 58571/58610 histories were
fetched; no general importer was run. Featured Topics already names `zcg`.

## 20. Reading context during redraws and navigation (D-88)

Same-page redraws preserve document scroll, the reading panel's internal scroll,
focused control and search selection. This includes Highlights and author identities
toggles and asynchronous account/content redraws. Disclosure state remains controlled
by the existing open-state model.

Within the loaded app session, leaving Topics records its scroll position and focused
topic card. Returning through All topics, header Topics or browser history restores
that position and card focus. Search, sort and interest choices retain their existing
state. Initial directory entry starts at the top. Ordinary topic entry starts at the
top; post deep links still reveal and scroll to their target. The router owns scroll
restoration (`history.scrollRestoration = "manual"`). Return positions are transient;
they do not add browser storage, account data or cross-refresh persistence.

## 21. Fly.io runtime and operations (D-93–D-95)

App `zencash` runs in `sjc` behind HTTPS at `https://zenzcash.com`, with RP ID
`zenzcash.com`. The generated `zencash.fly.dev` hostname is not an alternate passkey
origin. One shared-CPU Machine starts with 512 MB RAM, always running, and mounts one
encrypted 3 GB volume at `/data`. This topology accepts downtime during deployments
and host failures; there is no replication, automatic failover or horizontal scaling.

The image is built from repo source and locked Rust dependencies with pinned base
image digests. It contains the server, maintained WebAuthn verifier, browser assets
and Node operator/backup tools. The reading contract is generated without historical
forum/model fixtures. Builds do not fetch forum data or call models. Private data,
credentials, generated topics and local build caches are excluded from build context.
The image build tests HTTP, health, real verifier challenge generation, denied private
paths and persistence across a process restart using disposable synthetic data.

The mounted volume owns `/data/zforum.sqlite`, WAL/SHM, and `/data/work/imports`.
`/app/work` is a symlink to `/data/work`; the image/root filesystem holds no durable
application state. The entrypoint requires a mount, fixes private directory ownership,
and drops to UID 10001. The server supports an explicit IP bind address and proxy mode;
local default is loopback/direct, Fly is `0.0.0.0:8080` with Fly-Client-IP rate buckets.
Proxy headers are trusted only in explicitly selected Fly mode on the private backend.
Health requires a readable published table and an available verifier.

Initial seeding uses a consistent backup of the restored local database, including all
accounts/personal data and import checkpoints; existing frozen import artifacts are
transferred separately. The seed verifies SHA-256, integrity, foreign keys and schema,
then exclusively creates the destination. Existing databases or WAL/SHM are refused.
An explicit bootstrap mode serves maintenance responses without opening SQLite. Normal
mode refuses an absent database; code deployments never seed or replace production state.
Production becomes authoritative at launch. Local passkeys cannot authenticate against
the new RP ID; retained recovery codes support establishing a production credential.

Before migration/startup and hourly thereafter, take a consistent read-only SQLite
backup under the import lock and archive it with frozen import files. Upload to private
Tigris storage using curl's AWS signing, with credentials on stdin and no credential
arguments or files. Record key, SHA-256, counts and completion time. Startup backup
failure prevents startup; hourly failure is logged and the next hourly interval retries.
An operator monitors backup age/failures. Object archives remain until an explicit
retention policy is selected; supplemental Fly snapshots retain 14 days. Verify restore
by downloading and hashing the archive, extracting into a disposable directory, and
checking database integrity/foreign keys/counts. Disaster recovery uses a new volume;
no restore overwrites a running database. Image rollback is not database rollback.

Production fetch, preview and publication use its mounted database and one import lock.
Fetch observations immediately restrict unavailable source posts. Export only the frozen
run metadata, forum snapshots and candidate artifacts. Bounded local analysis shares the
existing analysis implementation and cache, retains attempts, and cannot publish. Return
only candidate artifacts with frozen run identity. Receiving revalidates all candidates
against production snapshots, model and release baselines before marking analysis ready;
it never imports a local database or replaces production run checkpoints. Explicit publish
then revalidates and commits the complete import through the atomic publication path.
No source or AI scheduler is introduced. See README for operator commands.

## 22. Reading controls and guest account explanations (D-97)

The Highlights and author identities section inside Reading filters is permanently
expanded, with its controls directly visible instead of an additional disclosure.
Sidebar explanation overlays do not change layout or intercept pointer events over
controls. Filter changes retain reading position, sidebar scroll and focus.

Reading preferences are version 7. `includeHiddenAge` is a required boolean, false
by default. When false, profiles with hidden or unavailable creation dates fail the
account-age filter at every minimum, including zero/Any; they render as the existing
compact excluded rows with an explicit reason. When true, unknown ages pass this
one filter; all other filters still apply. Known ages retain the calendar-month rule.
Version-6, version-5 and earlier supported saved settings migrate with this new option
false while preserving other choices. SQLite schema stays 5; existing account
preferences migrate in the browser and are saved as version 7 on the next update.

Guest post actions explain that bookmarks, read/unread state, mood reactions and pet
selection require sign-in. Bookmark/read controls and the pet identify sign-in in
their accessible labels. Opening the account page through such an action shows why
sign-in is needed and a link back to the reading route. Browsing remains available
without signing in, and the action does not enroll an account automatically.

## 23. Daily imports with durable reply analysis (D-99–D-100)

The default import policy is `reply-reuse-v1`; frozen comparison runs without this
policy retain their recorded legacy plan. Each new import produces one full-context
summary per included topic. Its cache identity includes the import run ID; retries
reuse the accepted summary within that frozen run. Earlier point IDs are continuity
hints only, with no obligation to add immaterial replies or retain obsolete prominence.

Fetch freezes the previously published visible replies, their accepted analyses and
original provenance alongside the new source. Compare raw text, authored text, segments
and reply parent to detect substantive edits. Author/profile/timestamp metadata alone
does not require a new assessment. Unchanged replies reuse their original accepted
analysis and analysis_run, regardless of new summary questions, model or prompt changes.
New and edited replies are analyzed in batches of at most eight, with the opening post,
three preceding posts, reply ancestors and available quoted originals from that thread.
Context limitations are explicit; references outside supplied context fail validation.

New reply jobs have no dependency on summary question IDs; the currently unused issue_ids
field is empty for new analyses. Existing IDs remain historical metadata of the original
assessment. Removed/hidden referenced context is excluded from displayed reference lists,
with an explicit retained-assessment limitation; scores/renditions are not regenerated.
Baseline outputs are revalidated and reuse records must match the frozen accepted data
and provenance exactly. No new runner usage is attributed to retained replies. Original
records remain auditable; edited source/rendition versions use existing database behavior.

Reply reuse uses the existing schema-5 content fields. Accepted analyses in published release JSON seed reuse
without an archive-wide model rerun. Reuse artifacts and frozen sources stay in the private
import directories and existing backup/transfer paths. Preparation uses a production
backup in a separate database; deployment never replaces production personal state.

A `zforum-prepared-import-1` bundle contains the completed full-import cutoff and a
validated `zforum-import-source-1` envelope with fully analyzed candidates. Staging
requires the same production cutoff, public release baselines and topic membership.
It checks every candidate and source hash before registering the run, then reconstructs
source/checkpoint records from the frozen snapshots and accepts the checked analyses.
No local database or personal state is transferred; no fetch/model call or publication
occurs. Same-run retries require identical frozen identity. Publication remains explicit
and alone completes the run/advances coverage. Deploy supporting code before staging.

Publication submits all checked topics to `publish-import` using the strict
`zforum-publication-1` envelope. Expected current releases, frozen source/membership,
summary consistency and analyzed status are checked inside one SQLite transaction.
Topic releases, post/source/rendition records, summaries and completed coverage commit
together; any refusal rolls back the entire batch. Catalog reads hold one consistent
read snapshot. A failed client response after commit cannot revert completed import state.

`excludedDiscoveryThreads` omits explicitly excluded IDs from new discovery without
changing existing published/tracked membership. Thread 20456 is excluded by user
decision; its unpublished draft registration is removed and private fetch artifacts
are retained. Previously accepted analyses in other topics are unaffected.

## 24. Reading availability during staged updates (D-101–D-102)

Staged source pulls do not alter published pull timestamps or content. Readers retain
the checked release until atomic publication. If the forum hides an already published
post, privacy restrictions take effect immediately without withdrawing the topic.
The response explicitly enters original-discussion mode: restricted source is null,
all derived summaries/analyses/provenance are withheld, and only an allowlist of public
source fields is returned. Remaining original posts, thread navigation and author
masking stay usable. The page explains the temporary mode and omits AI filters/controls.
Saved links and speech handle originals without an analysis object. A checked replacement
with the restricted posts hidden restores the normal view after atomic publication.

SQLite migration 6 replaces the old topic-wide availability view with a per-post
restriction predicate. No table row is changed. Backups/import tools accept schema 5
through 7, while server startup performs migrations after the existing startup backup.
Catalog revision checks include privacy mode so already open pages refresh safely.

## 25. Cheap review of future new threads (D-103–D-104)

Existing tracked threads and the current frozen import retain their scope, except
the explicitly excluded music thread. Future discovery stages each unseen thread's
title (at most 180 Unicode characters) and opening excerpt (at most 600) before
fetching its full history. It makes no classification model call and supplies no
analysis rubric. The operator agent quickly assesses this bounded packet, recommends
excluding only social-only/fun-only threads, keeps mixed/uncertain material under
review, and asks the user to confirm proposed exclusions.

`new-thread-review.json` uses `zforum-thread-review-1`: run ID and ordered entries
`{id,title,excerpt,classification,decision,reason}`. The source fields are frozen.
Classification is substantive/frivolous/uncertain; confirmed decisions are include/
exclude, with a nonempty reason of at most 240 characters. Draft entries are
unreviewed/pending. `fetch --review FILE` strictly validates the decisions and source
identity; pending or changed packets cannot trigger analysis/publication. Schema 7
adds `import_thread_reviews` for confirmed decisions. Included threads are fetched;
excluded threads receive no full-history fetch, summary or reply assessment, including
later imports. No existing source/account table is rewritten. An entirely excluded
new window can complete with no model calls. Prepared bundles preserve review decisions.

## 26. Zenzcash alpha presentation and source access (D-111–D-112)

The public product name is Zenzcash, including the header, help pages, generated
exports/recovery downloads and passkey display name. Document, Open Graph and Twitter
sharing titles are “Zenzcash: A Calm, Personalized Zcash Community Forum”. Internal
storage keys, cookie names, format identifiers and the passkey RP ID retain their
existing values so the presentation change preserves saved preferences and accounts.

A notice beneath the site header identifies the alpha release, says not everything
works yet, and invites feedback by forum DM to sudo_ml or earthrise. Both links open
the forum's new-message composer; Zenzcash does not send messages itself.

Every nonhidden post has a labeled “On the forum” link to its original thread/post
number, visible while collapsed, expanded, filtered or anonymous and during original-
only privacy mode. Existing internal post permalinks remain. External links use the
shared URL validation and open separately with opener/referrer protection.

The selection workflow puts Listen to selected posts, Export selected posts, Copy
prompt + selected posts, and Copy post links only in one labeled action group. They
sit together on desktop and wrap together on narrow screens. Explanatory export help
follows the entire group; it contains no selection actions. Selection capture, busy/
empty disabling, exact original-source exports and multipart downloads remain intact.
