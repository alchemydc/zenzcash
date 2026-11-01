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
1. **Headline and about three sentences** saying what is being argued. Each sentence cites
   the posts it draws on.
2. **"Why do people think this?"** expands into the individual points people make. The AI
   does not decide there are two sides. It may say how points tend to group, under a clear
   disclaimer.
3. **Citations** are coloured by the cited post's maturity score. Clicking one opens that
   post with its original text showing.
4. **What's new** since 6, 12 or 24 hours ago, a number of hours the reader chooses, or the
   reader's last visit. The last visit is kept in the browser; there are no logins. New posts
   are marked, and points first made in that window are listed.
5. **The clean discussion** follows, thread by thread. Every post appears as a calm
   restatement (§4), with its original one click away.
6. **Marks and greying** (§5).
7. **Anonymous mode** hides authors so arguments are read on their merits. Authors become
   consistent pseudonyms ("Participant 7"), and account age is hidden too. The reader can
   reveal the author of a single post, or switch the mode off.
8. **Mind-change ratings** (§6), behind a toggle.

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

The reader chooses a minimum score and which traits grey a post out. Greyed posts stay
readable, just faint. Scores are colour-coded: 1–3 red, 4–6 amber, 7–10 green.

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

## 7. How the prototype is made
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
  as text, never as markup. The Rust server serves the page and the ratings API.

## 8. Deliberately excluded
- **No filter for individual accounts.** People would mute those they dislike, argue from
  incomplete knowledge, and build echo chambers.
- Posts are never hidden or left out of the summary to pressure behaviour. Readers choose,
  guided by visual markers.
- No per-person quality profiles and no reputation system, for now.
- No X/Twitter, no logins, no crawling the whole forum.

## 9. Later
- Check before you post: the reader drafts a reply in zforum, gets it checked for
  repetition, unjustified claims and emotional arguing, and appends a proof to the real
  post. It never blocks posting. Posts carrying a proof show green on zforum. (The archive
  has working signed receipts.)
- Self-quiz on a topic.
- After-reading check-in: time spent, understanding, how it felt.
- Ask questions with your own Claude: the site publishes a `/prompt.txt` and a read-only
  data API. zforum never forwards or pays for queries.
- An automated recap of recent forum activity.
- A calmness slider for the restatement (`D-44`).
- Live crawling of the most active threads.
