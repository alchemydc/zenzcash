# zforum — specification draft

> A reading lens for the Zcash Community Forum. Same posts, same people, calmer surface.

Status: draft for discussion. Written after reading the live forum (see **2. Evidence**).
All thread citations are real and resolve as `https://forum.zcashcommunity.com/t/<id>` → post `#N`.

---

## 1. What this is (and is not)

zforum is a **client-side reading lens** over `forum.zcashcommunity.com`. It re-ranks,
collapses, annotates and summarises existing posts according to *the reader's* stated
preferences. It is not a new forum, not a moderation system, and not a reputation system.

Three hard constraints, which the rest of the spec exists to serve:

- **C1 — Nothing is deleted, only folded.** Every collapse is one click from open, and
  shows why it was collapsed.
- **C2 — No public scores, ever.** A score is a private lens, never a scarlet letter.
  There is no per-author quality number, not even internally.
- **C3 — No filter may hide a novel claim.** A reader may choose not to hear a *person*
  repeating a point; they may never be allowed to miss the *point*. See §5.

---

## 2. Evidence: what is actually wrong

Measured over 367 posts in five of the hottest threads of the last year
(`t/58515`, `t/58566`, `t/58571`, `t/58610`, `t/53554`):

| Measure | Value |
|---|---|
| Median post length | 457 chars |
| Posts under 200 chars (near-contentless) | 85 / 367 (**23%**) |
| Longest single post | 17,859 chars |
| Share of all posts by the single most prolific account | 63 / 367 (**17%**) |
| Posts hidden by native Discourse moderation | 4 / 367 (**1.1%**) |
| Posts quoting a specific sentence of a specific post | 136 / 367 (37%) |
| Posts with `reply_to_post_number` | 270 / 367 (74%) |

Two conclusions drive the design:

1. **Native moderation is not the problem being solved.** Only 1.1% of posts are flagged.
   What exhausts readers is not rule-breaking, it is *volume, repetition, one-sidedness and
   contempt* — none of which is actionable for a moderator, all of which is actionable for a
   reader with a lens.
2. **The forum already produces the harm we fear from filters.** In `t/58571`, `@fabacab`
   answers the same claim at `#14` and again at `#18`, closing with "This is the second time
   that I have agreed with you and plainly stated that what you are suggesting is not
   happening. It is the last time I will do this." At `t/58515#121` a participant asserts
   "I haven't seen a single person defending ZCAP/ZCG record" — in a thread where several
   had. People are *already* re-arguing settled points and missing what was said, with no
   filter installed. Length and heat are the filter. This reframes the identity question
   (§5): a well-built filter can make re-litigation *less* likely, not more.

### 2.1 The best content is invisible

In the 140-post `t/58515`, the single most valuable exchange is `#109 → #112 → #114`, where
`@strahncryptography` is argued out of a position and says so: *"That is honestly a very
refreshing perspective, and yeah, now I see your point."* A genuine mind-change — the rarest
event in an online argument — is buried at post 112 of 140 and almost nobody will read it.
Likewise `t/58515#137`, which opens "None of this is an attack on anyone, their motives or
competence," then lays out a numbered argument.

**zforum must promote, not merely suppress.** A lens that only hides is a worse product than
one that also surfaces. This is the strongest argument for the claim-digest view (§6.2).

### 2.2 Volume is not a proxy for bad faith

The highest-volume account in the sample — 63 of 367 posts, 17% — is `@strahncryptography`.
It is also, by some distance, the account that most often **concedes a point**: four separate
moments across `t/58515` (`#109`, `#112`, `#114`, `#119`), including the thread's one genuine
mind-change. Its median post is 323 chars, *below* the forum median of 457, so the volume is
many short exchanges rather than monologue — i.e. actual back-and-forth.

A naive "hide the loudest account" filter would have deleted the best epistemic behaviour in
the thread. This is the clearest warning in the whole dataset:

- **C3 (volume dominance) must never feed a hide/collapse decision on its own.** It is a
  *display* signal ("one voice is 17% of this thread") and an input to run-collapsing (C2),
  nothing more.
- Any signal that correlates with *engagement* rather than *conduct* is suspect. Validate
  every threshold against E3 (concession) before shipping it: if a filter's precision looks
  good but it suppresses mind-changes, it is wrong.

Worth noting for §4: this account's interest is invisible in forum metadata. Its `user_title`
is "Regular" (a trust level, not an affiliation); only the free-text bio reveals "a
cryptography firm who have recently incorporated and entered public grant sectors" — i.e. a
prospective grantee arguing about grant funding. The account was created 2026-07-13, roughly
three months before these threads.

---

## 3. Signal taxonomy

Signals are deliberately **narrow and named**. The UI never says "low quality" — it says
"unsourced number" or "already answered at #126". Specific labels are defensible and
falsifiable; "low quality" is a slur and will be fought.

### A. Argument structure
| ID | Signal | Real example |
|---|---|---|
| A1 | One-sided case; no steelman, no cost acknowledged | `t/58515#1` lists only reasons for |
| A2 | Unsourced quantitative claim | "98.6% disapproval" (`#23`,`#134`); "$125M+, 12+ years of runway" (`#18`); "over $30M a year" (`#22`) |
| A3 | Strawman / absurd extension | "all 550m users of the worlds largest public social media platform are nazis?" (`t/58571#12`); "EUREKA, THEY MUST BE CONSULTING FIRMS!" (`t/58515#113`) |
| A4 | Unfalsifiable motive attribution | "clearest sign that you are indeed a Fed" (`#98`); the multi-step plot at `#138` |
| A5 | **Claim already answered upthread** | `#121` vs `#126`; `t/58571#14`,`#18` |
| A6 | Non-responsive / goalpost shift | `t/58571#2` asks for forum citations, `#4` relocates the claim to X |

### B. Conduct and tone
| ID | Signal | Real example |
|---|---|---|
| B1 | Ad hominem from affiliation | "I realize as a self serving ZCG member you may not understand this" (`#123`); "And working for the Zcash Foundation nonetheless! Surely unbiased." (`t/58571#12`) |
| B2 | Name-calling / othering | "Fed" (`t/58515#98`), "naziland" (`t/58571#11`), "prudes" (`t/58515#110`) |
| B3 | Contempt, sarcasm, shouting | all-caps reductio (`#113`) |
| B4 | Bad faith ascribed to a whole group | "Everyone pay attention: it's coming from coinholders" (`#99`) |

### C. Low information (cheap to detect, no model needed)
| ID | Signal | Real example |
|---|---|---|
| C1 | Contentless agreement | "I agree with your point 100%" (`#9`), "Kill both." (`#21`), "Yeah, very fair take" (`#25`) |
| C2 | Consecutive pile-on by one account | `@ACoffee` at `#129`,`#130`,`#131` |
| C3 | Volume dominance within a thread ⚠️ **display-only, never hides — see §2.2** | one account = 17% of 367 posts |
| C4 | Wall of text (>6k chars, no structure) | max 17,859 chars |

### D. Interest and disclosure (see §4 — hardest category)
| ID | Signal | Source |
|---|---|---|
| D1 | Structured affiliation | Discourse `user_title` / `primary_group_name` / groups |
| D2 | Self-disclosure in the post | "(not speaking on behalf of ZF, as always)" (`#135`); "I don't plan to run for reelection to the ZCG" (`#124`) |
| D3 | Third-party allegation of interest — **contested, not fact** | `#22` alleges an employment link; `#104` flatly denies it: "I have zero affiliation with Winklevoss or Cypherpunk or any miners or VCs" |

### E. Positive signals (ranked up)
| ID | Signal | Real example |
|---|---|---|
| E1 | Asks for specific evidence | `#134`, `#136` |
| E2 | Explicit de-escalation | `#137` |
| E3 | **Concession / mind-change** | `#112`, `#114`, `#119` — highest weight in the system |
| E4 | Steelmans the opposing case | `#13` concedes the opponents' goals ("Maybe we should even get rid of the dev fund. It certainly causes governance headaches") *before* raising specific objections |
| E5 | Correction with a citation | `#126` "Please read the grant…" |

---

## 4. Disclosure: why metadata is not enough

Tested against five central participants:

| Account | `user_title` | groups | Relevant interest actually discussed in-thread |
|---|---|---|---|
| `artkor` | "Zcash Community Grants Member" | ZcashGrants, ZCG_Candidates | ✅ fully covered |
| `conradoplg` | "Zcash Foundation" | — | ✅ covered |
| `joshs` | "ZODL" | — | ⚠️ partial |
| `thowar2` | *(empty)* | ZCG_Candidates | ❌ the affiliation argued over for 20 posts is absent |
| `strahncryptography` | "Regular" *(a trust level, not an affiliation)* | — | ❌ only in free-text bio |

So: **Discourse metadata covers roughly half of what matters, and misses the contested
half.** Design consequences:

- **D1 (metadata) ships first and alone.** It is authoritative, cheap, and uncontroversial.
- **D2 (self-disclosure) is quoted, never paraphrased.** That `@conradoplg` types
  "(not speaking on behalf of ZF, as always)" by hand, repeatedly, is direct evidence that
  users *want* structured disclosure. Extract it, attach it, link to the post it came from.
- **D3 (allegations) never render as a chip.** An accusation and its denial go in a
  separate, collapsed **Contested interests** tray showing both sides and both links. zforum
  reports that a dispute exists; it does not adjudicate it.
- A community-maintained affiliation registry (every entry sourced, versioned, publicly
  contestable, with a right of reply) is **deliberately the last thing built** (§10). It is
  the most useful feature and by far the most dangerous.

---

## 5. The identity-filter question

**Recommendation: allow per-account muting, but implement it as claim-aware collapse rather
than erasure.** Five rules make this safe, and they resolve the echo-chamber worry directly.

1. **Mute = collapse, not remove.** A muted author's post renders as a one-line stub:
   author, timestamp, and a neutral one-sentence summary of the claim. Expandable.
   You lose the tone, not the information.
2. **Novelty guarantee (C3).** The *first* appearance of any distinct claim in a thread is
   never collapsed, whoever makes it. Mutes can only ever fold *restatements*. This is
   mechanically enforceable because we extract and cluster claims anyway (§8.3) — so a mute
   can never cause the "arguing about something already settled" failure.
3. **Coverage meter.** Persistent, non-dismissable: *"You are muting 3 participants in this
   thread — 41% of posts, 2 claims you have not seen stated by anyone else."* An echo
   chamber you can measure is a choice; one you cannot is a trap.
4. **Mutes expire.** Default 30 days, with a renewal prompt. Heat is situational; permanent
   walls are how grudges calcify.
5. **Asymmetric and private.** You can make someone quieter *for you*. You can never make
   yourself invisible *to them*, and no one is told they were muted. No reciprocity, no
   notification, no shadow-ban dynamics.

Rationale: the thing worth avoiding is not "I chose not to read this person," it is "the
forum stopped telling me what was argued." Those come apart cleanly once claims are
first-class objects. And per §2, the unfiltered forum *already* fails at the second one —
rules 2 and 3 make zforum strictly better on the exact axis the worry is about.

**Also ship a per-thread "one voice is 17% of this thread" nudge.** In practice the relief
people want from a dominant poster is usually *rate limiting*, not silence: "collapse
runs of consecutive posts by the same author" (C2) and "show me this author's best three
posts in this thread" deliver most of the benefit of a mute with none of the cost.

---

## 6. Interface

### 6.1 Lenses (presets, user-editable, none default-on at install)
- **Raw** — untouched. Always available, one keystroke.
- **Calm** — collapses B (conduct) and C1/C2; preserves all claims. The default offer.
- **Signal** — the claim digest. See below.

### 6.2 The claim digest (the actual product)
One card per distinct claim in a thread, not one card per post:

> **"ZCG funded sex work out of block rewards."**
> Asserted by 3 participants · 6 posts · first `#16`
> **Strongest statement:** `#16` · **Strongest rebuttal:** `#126` ("ZCG has never funded sex
> work. ZCG funded a Zcash presence at a few adult industry events…")
> Status: **contested — factual**

A 140-post, five-day, multi-front fight compresses to roughly a dozen such cards. This does
more for the stated goal ("calm") than any amount of hiding, and it is the feature that makes
§5's novelty guarantee possible. Build this first.

### 6.3 Per-post affordances
- Signal chips, max two, always with a quoted span: *"unsourced number — '98.6%'"*.
- "Why was this folded?" opens the rubric clause and the exact span that triggered it.
- **Right of reply:** an author can see every signal zforum attached to their own post and
  attach a standing rebuttal, shown in that same panel.
- Disclosure chips (D1/D2 only) beside the username; **Contested interests** tray separate.

---

## 7. Plain restatement (faithful re-voicing)

**One operation, not two.** zforum re-voices a post so it reads as it would if written by
someone calm. It is a *tone* transform over existing content.

**Explicitly out of scope:** the model does not invent stronger arguments, supply missing
considerations, add evidence, or improve anyone's reasoning. Where a post genuinely is
missing something, zforum **cites the post that already supplies it** (§7.3) rather than
writing one. No generated argument is ever attributed to a named person.

This is a deliberate narrowing. It removes the laundering risk, the false-balance risk, and
most of the "it put words in my mouth" risk in one move, and it makes the fidelity guarantee
in §7.2 enforceable rather than aspirational.

### 7.1 What the transform touches, and what it must not

**Removed — affect carriers:**
- Second-person attack → third-person claim about the idea. ("you are a Fed for proposing X"
  → "X carries this risk")
- Imputed motive dropped. Usually unfalsifiable, and the main heat source.
- Sarcasm and rhetorical questions → the proposition they encode.
- Contempt intensifiers ("only an idiot would", "do better", "it's not complicated").
- ALL CAPS, pile-on emoji, scare quotes → plain register.
- A concession buried under an attack is promoted to the front. **Reordering existing
  content, not adding any.**

**Preserved — non-negotiable:**
- The claim and its full logical force.
- The conclusion, including a flat refusal. **Disagreement is not immaturity.** A calm
  "no, and here is why" is the target; agreement is not.
- Every number, name, link and citation, verbatim.
- Questions and demands ("cite this", "state your evidence") — these are the *productive*
  parts of a hostile post and must survive intact. See `t/58515#136`.
- The fact that the author was angry — carried by the tone indicator, not erased.

The distinction that makes this tractable: **strip intensifiers that mark contempt for the
interlocutor; keep intensifiers that mark confidence in the claim.** "Obviously X" → "X" is
fine. "X, and only an idiot disagrees" → "X". But "X would be catastrophic" *stays* — that is
a claim about X, not an attack on a person.

Two worked examples from the live forum:

> `t/58515#98` — "Advocating for putting all this money in a non-profit foundation is clearest
> sign that you are indeed a Fed. A much more useful idea would be to burn all this ZEC forever."
>
> **Restated:** "Concentrating the fund in a registered non-profit creates a single legal
> entity that can be pressured, captured or compelled. Proposed alternative: burn the ZEC
> instead."

> `t/58515#113` — "Let's see, a16z and Paradigm both hire researchers and conduct research,
> provide upfront funding, expect returns from a speculative source… EUREKA, THEY MUST BE
> CONSULTING FIRMS!"
>
> **Restated:** "Those shared features don't distinguish the two: a VC buys equity and seeks
> a return on that equity, whereas a consulting firm is paid a fee for work delivered."

In both, the insult was load-bearing for the tone and irrelevant to the claim. Note that
neither restatement adds a reason the author did not give.

And what failure looks like:

> `t/58515#123` — "Actually having a looting, self serving org getting block rewards is
> deeply offensive to people looking for fair money."
>
> ❌ **"Some have raised concerns about ZCG's efficiency."** — strength destroyed, claim
> replaced, author misrepresented. Both sides will correctly call this censorship.
> ✅ **"An organisation that takes block rewards while serving its own interests is offensive
> to people who want money to be fair."** — same accusation, same force, no second-person
> attack.

### 7.2 Provenance as a hard gate

Because nothing is ever generated, **an unmapped sentence is a bug, not a disclosure.** That
upgrades the §7.2 mechanism from a label to a gate:

- Every sentence of a restatement must map to a source span in the original.
- If any claim-bearing sentence fails to map, **the restatement is rejected and the original
  is shown instead.** There is no "added by zforum" annotation, because nothing should ever
  be added.
- The mapping is inspectable (hover, or a side-by-side view).

This is a far stronger guarantee than labelling, and it is only available because generation
was cut.

Presentation rules:

- Visibly distinct typeface; labelled as a machine paraphrase; original always one click away
  and always linked.
- **Never rendered as the author's own words.** Copy-to-clipboard carries the attribution so
  it cannot be quoted elsewhere as theirs.
- Tone indicator retained — *"original tone: hostile"* — so the reader knows heat was removed
  rather than absent. Erasing the signal that a thread is on fire is itself a distortion.
- The author may reject any restatement of their own post; the rejection renders beside it
  (§6.3).
- **Never call it "the mature version."** That labels the author immature and starts precisely
  the fight the product exists to avoid. The UI says *"plain restatement"* and *"show
  original"*, and says nothing about the author.

### 7.3 "Missing something": cite, don't generate

When a post is weaker than it could be, or omits the obvious counter, the thing it is missing
has almost always **already been said by someone else** — in the same thread, or in an
earlier one. So:

- Surface *that post*, by link, with its author's name.
- The claim digest's "strongest statement" and "strongest rebuttal" fields (§6.2) are
  **selections from existing posts, never syntheses.**
- If nothing in the corpus supplies the missing piece, zforum says nothing. **Silence over
  invention.**

Why this is strictly better than generating the argument:

1. The argument has an author who stands behind it and can be questioned.
2. It is verifiable — a reader can click through and check.
3. It credits the person who actually made the point, rather than laundering their work into
   model output.
4. It is the direct antidote to the re-litigation problem (F-3 / A5): the missing piece is
   usually already on the page, unread. Citing it is the whole point.

The one compose-time affordance worth keeping: when you hit reply, show **the existing posts
that already answer** what you are about to argue with — not a synthesised steelman of your
opponent. Same benefit against strawmanning (A3), zero fabrication.

### 7.4 Start with annotation, not prose

The minimum viable form is not a rewrite at all — it is a one-line **claim extraction**
rendered above a folded hostile post:

> `#98` · *claim:* concentrating the fund in a single legal entity creates a capture and
> coercion risk · *tone: hostile* · **[show original]**

Cheaper, strictly lower-risk, no voice-homogenisation problem, no provenance UI needed, and it
reuses the claim digest (§6.2) already being built. Full prose restatement is an opt-in
upgrade on top of it, not the default.

Voice homogenisation is the real cost of full rewriting: everyone ends up sounding like the
same assistant, and non-native English speakers — a large share of this forum — are flattened
hardest, losing what identifies them as individuals. Annotation avoids this entirely.

---

## 8. Architecture

```
ingest (Discourse JSON, unauthenticated)
  └─> raw store (immutable, append-only, revision-aware)
        └─> graph builder (quote + reply edges)        ← free, no model
        └─> deterministic signals (C, A2 regex, volume) ← free, no model
        └─> claim extractor + clusterer                 ← model
        └─> rubric classifier (A, B, E)                 ← model
              └─> scores store (separate; re-scorable without refetch)
                    └─> lens renderer (local)
```

Raw and derived data are strictly separated so the rubric can be revised and everything
re-scored without re-crawling. Scoring runs **locally / client-side**; there is no central
score service (see §9).

### 8.1 Data acquisition — the API question, answered

**No API key is needed, and you should not ask for one.** Discourse exposes read-only JSON
publicly; every endpoint below was verified live against the forum, anonymously:

| Endpoint | Returns | Use |
|---|---|---|
| `/about.json` | 12,271 topics · 248,541 posts · 14,706 users | sizing |
| `/categories.json` | 14 categories (Mining 3042, General 2516, Governance 295 …) | scope |
| `/latest.json?order=activity&page=N` | topic list, paginated | backfill |
| `/top.json?period=yearly\|quarterly\|monthly` | top topics by period | prioritised backfill |
| `/t/{id}.json` | **first 20 posts only**, plus `post_stream.stream` = *all* post ids | thread head |
| `/t/{id}/posts.json?post_ids[]=…` | arbitrary posts by id, ~40/call | full thread |
| `/posts.json` | 50 newest posts **forum-wide** | incremental sync |
| `/u/{username}.json` | title, groups, bio, created_at | disclosure (D1) |
| `/posts/{id}/revisions/latest.json` | edit history | re-scoring edited posts |
| `/raw/{topic_id}/{post_number}` | **original markdown**, no auth | cleaner than parsing `cooked` |
| `/search.json?q=…+after:YYYY-MM-DD` | search | targeted backfill |

`robots.txt` disallows only `/admin/`, `/auth/`, `/email/`, `/session` — public topic JSON is
permitted for `User-agent: *`. **No scraping of HTML is required anywhere.**

`/raw/` also **respects moderation state**: a community-hidden post returns 404 there, and
in the JSON its `cooked` field is replaced by "This post was flagged by the community and is
temporarily hidden." So the ingest layer inherits the forum's own moderation decisions for
free, with no code — a feature, not a gap (see §9 on why zforum should not un-hide them).

`/raw/{topic_id}/{post_number}` deserves emphasis: it returns the author's original markdown
**without authentication**, and its quote syntax —
`[quote="thailand85, post:123, topic:58515"]` — carries the same argument graph as the cooked
HTML asides in a form that is trivially parseable. Prefer it over `cooked` for text, and keep
`cooked` only where rendered output is needed. This closes the last plausible reason to want
an API key (`raw` is normally thought to require one via `post.raw`).

**A read-only API key adds nothing measurable.** Two facts settle it:

1. **The gated surfaces are gated on *privilege*, not on authentication.** On a hidden post
   the anonymous JSON reports `can_see_hidden_post: false` — that flag is satisfied by being
   staff or the post's own author, not by holding a credential. The same is true of
   `/review.json` (staff) and the admin user endpoints (admin). So a read-only key bound to a
   **non-staff** account sees exactly what anonymous sees. A read-only key bound to a **staff**
   account is a different object: it reads hidden post text, the flag queue, and the admin
   user list *including email addresses and IPs* — "read-only" constrains writes, not reads,
   and that is data zforum must not hold.
2. **Anonymous access is not rate-limited in practice.** Measured: 30 sequential
   `/t/{id}.json` fetches in 7s, all HTTP 200, no 429s — roughly 4 req/s sustained. A full
   backfill of all 248,541 posts at 40 posts/request is ~6,200 requests, i.e. **about 25
   minutes**, once. There is no throughput problem to solve.

A secondary consideration: a key is issued and revoked by the forum's operators, so holding
one makes zforum institutionally entangled with the Zcash Foundation and gives a critic a true
story about privileged access. For a tool whose only defence is verifiability (§9) that is a
real cost — but the decisive argument is simply that there is no benefit to weigh against it.

Stay anonymous. Send a real `User-Agent` with contact info, stay well under the measured
ceiling (~1 req/s is plenty), back off on 429, and check the forum ToS before publishing a
mirror.

### 8.2 Notes on the `alchemydc/synapse` prior art

`src/services/discourse/DiscourseSource.ts` (MIT, so reusable). `types.ts` is a good,
accurate field map — take it nearly as-is. The fetch logic needs four changes, because it was
built for digests rather than full-thread analysis:

1. **It reads only `post_stream.posts` from `/t/{id}.json`, i.e. 20 posts.** On `t/58515`
   that silently loses 120 of 140 posts. Must page `post_stream.stream` through
   `/t/{id}/posts.json?post_ids[]=` in batches.
2. **It sends `Api-Key`/`Api-Username` headers** (empty-string when unset). Drop entirely.
3. **`stripHtml(cooked)` destroys the argument graph.** `cooked` contains
   `<aside class="quote" data-username="…" data-post="123" data-topic="58515">` — *who is
   rebutting which sentence of which post*. Parse asides out **before** stripping; combined
   with `reply_to_post_number` this yields a near-complete rebuttal graph for free (37% +
   74% coverage) and is the backbone of A5, A6 and §6.2.
4. **`if (p.updated_at < since) continue`** is right for digests and wrong here — detecting
   "already answered" needs the whole thread, not a time window. Also: no politeness delay,
   and no handling of `hidden`, `post_type` (small actions) or deleted users.

### 8.3 Claim extraction
Per thread: extract atomic claims, embed, cluster. For each cluster record first-asserter,
all restatements, and best rebuttal (via the quote graph). This single structure powers the
claim digest (§6.2), the A5 signal, the novelty guarantee (§5 rule 2), and a **compose-time
nudge**: *"This claim has been made 4 times in this thread — see #16, #126."* That nudge
attacks the re-litigation problem at the source, which no filter can do.

### 8.4 Classifier discipline
- Deterministic signals run first and need no model: all of C, plus A2 (numerals without a
  nearby link/citation), plus volume and consecutive-run stats.
- Model signals (A, B, E) must return, per signal: score, **a quoted span**, and the rubric
  clause id. A signal with no quotable span is dropped. This is non-negotiable — it is what
  makes labels auditable and arguable.
- Calibrate on a hand-labelled gold set of ~300 posts drawn from these five threads,
  published with the repo. Report per-signal precision/recall. **Tune for precision:** a
  false "poorly argued" label costs far more trust than a miss.
- The rubric and prompts are **data, not code** — swappable, diffable, versioned. Users can
  run a different model and adjust weights.

---

## 9. What can go wrong with the tool itself

- **The rubric becomes a governance object.** In a forum where participants already accuse
  each other of being Feds and of undisclosed conflicts, a tool that labels arguments will be
  read as a political actor. Mitigations: published versioned rubric, open prompts, open gold
  set, local scoring, no public scores, right of reply, and visible funding/provenance.
- **Provenance will be scrutinised.** Anyone shipping this is a participant with a stake, and
  will be accused of down-ranking opponents. The defence is not neutrality claims but
  *verifiability*: anyone can re-run the rubric, diff the weights, and see every label's
  quoted span. Consider inviting a known critic to review the rubric before launch.
- **Selective-quoting risk in the digest.** "Strongest statement / strongest rebuttal" is an
  editorial act. Always link the full post; let readers promote a different post as the
  strongest version of a claim.
- **Disclosure chips as weapons.** §4's D3 rule exists because at `t/58571#12` a disclosed
  affiliation is *already* used as an argument ("working for the Zcash Foundation
  nonetheless!"). Shipping unsourced interest claims would industrialise that.
- **Asymmetric chilling.** Scoring tends to penalise non-native English and terse styles.
  Check signal rates by account age and by whether the author posts in a non-English
  category before shipping any threshold.
- **Suppressing good faith by proxy.** See §2.2: the loudest account was also the most
  concessive. Every threshold must be validated against E3 (mind-change) before shipping.
- **"It put words in my mouth."** The most likely public attack on zforum, and it comes from
  the restatement layer (§7), not the filters. The provenance *gate* (§7.2 — reject rather
  than label), the never-as-author's-words rule, and author rejection of restatements are the
  whole defence. Do not ship prose restatement without all three.
- **Flattening disagreement into agreement.** The failure mode of a tone transform is
  softening a real accusation into a mild concern (see the ❌ example in §7.1). That
  misrepresents the author and reads as censorship to both sides. Strength preservation is a
  test case in the gold set, not an aspiration.
- **Voice homogenisation.** Full prose restatement makes everyone sound like the same
  assistant and flattens non-native English speakers hardest. Mitigated by shipping
  annotation first (§7.4) and keeping prose opt-in.
- **Un-hiding what the community hid.** A key bound to a *staff* account would expose the
  text of flag-hidden posts (4/367 in the sample). Displaying content the community voted to
  hide would invert the product's entire purpose. zforum shows the placeholder and stops.
  Note this is privilege-gated, not auth-gated (§8.1): anonymous access gets the protection
  for free, which is the cleanest reason to keep the ingest path unauthenticated.

---

## 10. Phasing

| Phase | Ships | Model needed |
|---|---|---|
| **P0** | Read-only mirror + thread reader + quote/reply graph | no |
| **P1** | Deterministic signals (C1/C2/C4, A2; C3 display-only per §2.2), collapse-with-reason, Raw/Calm lenses | no |
| **P2** | Claim extraction + **claim digest** + compose-time "already argued" nudge | yes |
| **P2.5** | **Claim annotation on folded hostile posts** (§7.4) — "claim: … · tone: hostile" | yes |
| **P3** | Rubric classifier (A, B, E) + gold set + published calibration | yes |
| **P4** | Disclosure chips from D1 (metadata) and D2 (quoted self-disclosure) | light |
| **P5** | Claim-aware mute with novelty guarantee + coverage meter | — |
| **P6** | Full prose restatement + provenance gate & mapping UI (§7.1–7.2), opt-in | yes |
| **P7** | Community affiliation registry, sourced and contestable | — |

**Prototype status (2026-10-31, session 2).** Built: P0 (crawl, reader, quote/reply graph),
P1 (deterministic signals, Calm/Raw lenses), P2 (claim digest; the compose-time nudge exists
as the check_draft receipt flow, §12), P3 in part (model signals with verbatim spans; no gold
set yet), P4 in part (D1 from metadata, with trust-level titles excluded; D2/D3 as model
signals), P5 (claim-aware mute, novelty guarantee, coverage meter). Also added: thread
summaries, a forum digest, a self-quiz per thread, and signed check receipts. Not built: P2.5
annotation as a separate lens (folded posts show the annotation already), P6, P7.

P7 last, on purpose. P2 is the phase that proves the product; if the claim digest does not
make these threads readable, filtering will not either. P2.5 likely delivers most of the
restatement value and should be measured before committing to P6 — full prose rewriting may
turn out to be unnecessary. Note there is no generation phase: the "cite, don't generate"
rule (§7.3) is satisfied by P2's digest, which selects existing posts.

---

## 11. Open questions

1. Does the claim digest actually relieve the anguish, or is the relief mostly §5's
   "collapse consecutive posts by the dominant voice"? Cheap to A/B on `t/58515`.
2. Publish the lens, or keep it private? A public zforum view of a live argument becomes
   itself a move in that argument.
3. Who may edit the affiliation registry, and what is the appeal path? Unanswered, this
   sinks P7.
4. Should E3 (mind-change) be surfaced forum-wide — a "people changed their minds here"
   feed? Possibly the single best incentive redesign available, and nearly free once claims
   are extracted.
5. Does the ToS permit a public mirror, or only local use?
6. Does annotation (§7.4) capture most of the value of prose restatement? If yes, P6 never
   gets built and the project avoids its single largest reputational risk.
7. May a restatement be shown to the *author* of the post it rewrites, pre-send? Offering
   someone a calmer version of their own post is potentially the highest-leverage
   intervention in the design, and also the most patronising. Needs user testing, not
   argument.
8. If a restatement and the original diverge in how readers understand the claim, which
   counts as "what was argued" for the §5 novelty guarantee? Current answer: always the
   original.
9. Is "strip contempt intensifiers, keep confidence intensifiers" (§7.1) actually separable
   in practice, or does it collapse under adversarial phrasing? This is the single riskiest
   assumption in §7 and the first thing the gold set should test.

---

## 12. Check receipts (format zfr1)

A check receipt is zforum's signed statement that its checker read exactly a given draft,
against exactly a given thread snapshot, with a given prompt and model, and recorded given
findings. It is a **findings receipt**, never a clearance (`D-22`). It is issued whatever the
findings are, and nobody needs one to post. The reference implementation is
`zforum/attest/receipt.py`. An independent browser implementation is `site/js/receipt.js`.
Both pass the test vectors in `tests/vectors/receipt-v1.json`, which use the RFC 8032 test-1
key (tests only).

### 12.1 Draft text
- **Whitespace** means exactly the characters for which Python's `str.isspace()` is true:
  U+0009–U+000D, U+001C–U+001F, U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028,
  U+2029, U+202F, U+205F, U+3000. Note that U+FEFF is not whitespace.
- **Normalisation:** replace every CRLF with LF. Then reject any remaining CR. Then strip
  leading and trailing whitespace. Reject empty text, and reject text with any line starting
  `zforum-receipt: `. Normalisation is part of the format, not a repair. Browsers submit
  CRLF and Discourse trims.
- `draft_sha256` is the SHA-256 of the normalised text's UTF-8 bytes. `draft_chars` is its
  length in Unicode code points.

### 12.2 Payload
Canonical JSON: keys sorted by code point, no insignificant whitespace, UTF-8, no escapes
beyond those JSON requires. It has exactly these fields:

| field | value |
|---|---|
| `v` | `1` |
| `kid` | first 16 lowercase hex chars of SHA-256(raw 32-byte Ed25519 public key) |
| `seq`, `prev` | log position (§12.4) |
| `issued_at` | `YYYY-MM-DDTHH:MM:SSZ` |
| `topic_id`, `draft_sha256`, `draft_chars` | the thread, and the draft (§12.1) |
| `corpus_sha256` | SHA-256 of the canonical check_draft job input: thread posts + accepted analysis + draft |
| `checker` | `{task: "check_draft", prompt_sha256, backend: "subagent" \| "anthropic-api", model}` |
| `findings_sha256` | SHA-256 of the canonical findings JSON |
| `counts` | `{repetitions, contradicted, supported, unsourced, tone, novel_claims}`, integers |

- Integers are in [0, 2^53−1] (`topic_id` and `draft_chars` ≥ 1).
- Floats, even `1.0`, are rejected, and so are strings containing lone surrogates. Every
  JSON implementation must decode a payload identically.
- Hashes are 64 lowercase hex characters.

### 12.3 Signature and wire form
- `signature = Ed25519(private_key, "zforum-receipt-v1\0" || payload_bytes)`.
- Wire form: `zfr1.` + unpadded base64url(payload) + `.` + unpadded base64url(signature).
  Base64url must be canonical: re-encoding the decoded bytes must reproduce the text exactly.
- **In a post:** `normalised_draft + "\n\n" + "zforum-receipt: " + wire`. The receipt line is
  the last line, after exactly one blank line.

### 12.4 Log
Receipts form an append-only hash chain: entry `i` has `seq = i` and
`prev = SHA-256("zforum-log-v1\0" || payload_bytes of entry i−1)`, or 64 zeros for entry 0. The
published log (`receipts/log.json`) holds receipts only (hashes and counts, never draft text),
so a draft that was checked but never posted is not disclosed. Re-checking a draft until the
findings look better leaves visible entries for the same topic and the same draft hash.

### 12.5 Verification, in order
1. Normalise the post as in §12.1 (CRLF to LF, strip). Its last line must start
   `zforum-receipt: `, and exactly one blank line must precede it.
2. Check the body is a valid normalised draft.
3. Decode the wire form strictly. The signature must be 64 bytes.
4. Parse the payload as JSON. Look up `kid` in the keyring and verify the signature.
5. Check the payload against §12.2, then check that it is canonical.
6. Check that `draft_sha256` and `draft_chars` match the body.
7. Check the log chain, and that the entry at `seq` is byte-identical to this payload.

Rejection reasons for the vector cases are specified exactly in the vector file.

### 12.6 What a receipt does not prove
- It does not prove the findings are right. The checker is a model; the cited posts are
  there so readers can judge.
- Facts are judged only against the thread (`D-25`).
- The trust anchor is zforum's signing key; a ZK proof could remove it later.
- Receipts are self-contained (verifiable offline with the public key), which costs about
  1 KB per post. A compact form that refers to the log by `seq` would be shorter, but would
  need the log to be online.
