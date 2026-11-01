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
1. **A reading bar at the top**, in the same place on every topic page (`D-47`): "what's
   new since" (6, 12 or 24 hours ago, a number of hours the reader chooses, the reader's last
   visit, or off) and a **Reading settings** button that opens, in place, anonymous mode,
   the minimum maturity score, the minimum time on forum, the traits that filter a post, and
   the mind-change ratings toggle.
2. **Headline and about three sentences** saying what is being argued. Each sentence cites
   the posts it draws on.
3. **"Why do people think this?"** expands into the individual points people make. The AI
   does not decide there are two sides. It may say how points tend to group, under a clear
   disclaimer.
4. **Citations** name the thread and post (A#12) and are coloured by the cited post's
   maturity score. Clicking one opens that post in its thread's tab with its original text
   showing.
5. **What's new** in the chosen window: new posts are marked, each thread tab counts its new
   posts, and points first made in that window are listed. The last visit is kept in the
   browser; there are no logins.
6. **The discussion is one tab per thread** (`D-48`), drawn like the forum itself: the thread
   title, letter avatars, bold usernames, the date at the right, thin dividers. It is headed
   as a read-only copy of forum.zcashcommunity.com, with a link to the thread; it uses no
   forum logo and no copied stylesheet. zforum's own additions inside it (the account-age
   badge, marks, ratings, feedback) keep zforum's style, so they stand out. Posts load 20 at
   a time as the reader scrolls, like the forum, and a click inside a post changes only that
   post (`D-51`).
7. **Each post** shows its author with a **time-on-forum badge** (`D-46`), its marks (§5), and
   its **calm restatement, original and diff as tabs** in clearly different colours: the
   restatement tinted and labelled as written by AI, the original plain like the forum
   (`D-49`). Posts open on the restatement. A post that is already calm shows only its
   original, labelled so. The Diff tab marks removed wording with strike-through and added
   wording with underlining and distinct colours. It compares the author's original wording
   with the rendition; unchanged quoted replies appear separately below it (`D-56`).
8. **Anonymous mode** hides authors so arguments are read on their merits. Authors become
   consistent pseudonyms ("Participant 7", with a "P7" avatar), and account age is hidden
   too. The reader can reveal the author of a single post, or switch the mode off.
9. **Mind-change ratings** (§6), behind a toggle.
10. **Restatement feedback** (§7) on every post that has a restatement.

## 4. The calm restatement
- It changes **tone only** (`D-36`). It removes insults, sarcasm, contempt, shouting and
  imputed motives aimed at a person.
- It keeps every claim at full strength, the conclusion (including a flat refusal), and
  every number, name, link and question. It never adds an argument, a reason or evidence.
- A post that is already calm is shown as written and labelled so.
- It is labelled as a restatement and never presented as the author's words.

## 5. Marks
Every post gets a **maturity score from 1 to 10** with a one-line reason, plus any of these
**traits** (`D-38`). Each trait carries a one-line reason and the quoted words:

| Trait | Meaning |
|---|---|
| Contempt | insults, name-calling, sarcasm, mockery, shouting |
| Questions motives | attacks hidden motives or alleged conflicts instead of the argument |
| Repeats | restates a point already made in the thread, adding nothing new |
| Unsupported | asserts facts or numbers with no source or reasoning |
| One-sided | argues one side without acknowledging any cost or counterpoint |
| Strawman/simplistic | misstates the other side, or reduces the issue to a slogan |
| No content | agreement or reaction with nothing to add |

The reader chooses a minimum score and which traits filter a post, and a **minimum time on
forum** (any, 30 days, 90 days, 1 year or 2 years) that filters posts from newer accounts
(`D-46`). Authors who hide their profile are never greyed for their age, since it is unknown.
The age filter applies to every account of an age, never to a named person (§9). Each filtered
post says why and starts collapsed. Expanding it shows greyed content; the reader can
collapse it again (`D-55`). Citations and direct post links expand their target and show
the original, still greyed if filtered. Scores are colour-coded: 1–3 red,
4–6 amber, 7–10 green.

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

## 8. How the prototype is made
- **Data:** the six ZCG threads from the snapshot crawled 2026-10-31
  (`archive/research-prototype/data/crawls/20261031T215141Z`), plus account creation dates
  from public profiles. "Now" for "what's new" is the snapshot time.
- **AI work** is done ahead of time by Sonnet subagents, at most 5 at a time: per-post
  restatements and marks, and the topic summary. A validator accepts an output only if it
  covers every post, uses only known traits, and quotes words that appear verbatim in the
  author's own text. A restatement must also keep every link and number from the
  original.
- **Forum text is data, never instructions.** Every prompt says so. Prompt injection has no
  complete defence, so AI output is replaceable: everything can be re-generated or rolled
  back, and a person can remove an output.
- **The page** is static HTML and JavaScript with no build step. It renders forum text only
  as text, never as markup. The Rust server serves the page and the ratings and feedback
  API.

## 9. Deliberately excluded
- **No filter for individual accounts.** People would mute those they dislike, argue from
  incomplete knowledge, and build echo chambers.
- Reading filters collapse posts, with expansion available; they do not remove arguments
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
- **Download prompt + posts** exports one UTF-8 Markdown file containing the reusable
  instructions from `site/prompt.md`, the selected original source texts (including quote
  tags), authors, timestamps, reply references, zforum links and forum links. Ordering is
  stable by thread and post, independent of checkbox order. No AI output enters this export.
- The export explains that this is a manual subset and identifies missing parent posts.
  Its prompt asks for a cited summary by points of contention, with dissent, uncertainty,
  attribution and context limitations preserved. Source text is data, never instructions.
- The controls disclose that original text and usernames are exported even in anonymous
  mode. No request is sent to an AI. **Copy links** copies direct zforum links; when clipboard
  access fails the error and a selectable link list are shown.
- Direct links use `#/topic/zcg/post/<thread-id>/<post-number>` and open the original post,
  loading through the required batch. The complete text in the exported file means the
  reader's AI does not need access to a locally hosted zforum URL.

## 12. Approved framework migration, pending implementation
D-54 adopts the proposed four-dimensional reading framework described in HANDOFF.md,
replacing the maturity and trait model and updating renditions and summaries. The
implementation of that migration remains outstanding; §§4–5 currently describe the
running prototype. D-55 to D-57's presentation and export changes are implemented first.
