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

## 2. Home page
- A **board of cards**, one per hot topic. A topic can span several threads.
- Each card shows a short title, a one-line description, keywords, and statistics: posts,
  threads, participants, and how long the participants have been on the forum.
- The AI picks the topics to suggest from activity.
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
   posts, and points first made in that window are listed. The last visit is kept in the
   browser; there are no logins.
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
| Minimum time on forum | Any; 30 days; 90 days; 1 year; 2 years |

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

A reader can clear their rating. Each post shows the count at each level and the average of
all ratings. Ratings are shared, so a small Rust server stores them. A reader is an
anonymous id kept in the browser, which means nothing stops one person from posing as many.
That is acceptable for a design prototype, not for launch.

## 7. Restatement feedback
Two sliders on every post that has a restatement, alongside the mind-change ratings
(`D-50`). They tell the zforum team whether restatements work:

| Slider | Question |
|---|---|
| Emotions | This restatement helped me avoid negative feelings. |
| Head | I got something out of this that I wouldn't have had if it wasn't restated. |

Each runs from 0 ("not at all" or "nothing") to 10 ("a lot"). A slider is unrated until the
reader moves it or clicks it, and can be cleared. **The answers are feedback for the team
only, for now:** the server stores each reader's answers, gives each reader back only their
own, and the page says so. The team reads them with `node tools/feedback-report.mjs`.
The active feedback file is keyed by a deterministic hash of the current rendition corpus,
so a rewrite does not inherit responses about older wording. Older files are preserved;
pass their path explicitly to the report tool to inspect those responses (`D-63`).

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
  as text, never as markup. The Rust server serves the page and the ratings and feedback
  API.

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
- Direct links use `#/topic/zcg/post/<thread-id>/<post-number>` and open the original post,
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
