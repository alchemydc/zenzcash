# zforum work log

Append-only ledger of decisions, findings and open threads. Newest session at the bottom.
Entries record *why*, not just what — the rationale is the part that gets lost.

Conventions: **D-n** = decision, **F-n** = finding, **Q-n** = open question, **A-n** = action.
Forum citations resolve as `https://forum.zcashcommunity.com/t/<id>` → post `#N`.

---

## 2026-10-31 — Session 1: container setup, forum research, spec v0.1

### Context
Project goal (from `README.md`): *"calm, personalized zcash forum."* A reading lens over
`forum.zcashcommunity.com` that lets a reader filter and reframe by personal preference —
poorly argued, emotionally driven, rude, or undisclosed-interest posts. Motivation: the forum
is painful to read, especially since the influx of new and mercenary interest.

### Setup
- Repo cloned to `/workspace/zforum` (private; cloned by the user, not reachable anonymously).
- **D-1** — Container git identity set globally to the root commit's author,
  `sudo_ml <29868543+ml-sudocode@users.noreply.github.com>`, replacing the previous global
  value `Taylor Hornby <taylor@defuse.ca>`. *Why:* requested, so commits attribute to the
  GitHub account that owns the repo. Reversible; prior value recorded here on purpose.

### Research performed
Pulled **367 posts** across the five hottest threads of the last year via the public
Discourse JSON API, anonymously. Raw JSON retained at
`/tmp/claude-1000/-workspace/39f6bcd7-d241-407b-b12a-14f1f8743fac/scratchpad/forum-raw/`
(session-scoped — **A-1**: move into the repo as a fixture if it is to become the gold set).

Threads sampled: `t/58515` *End ZCG and send its funds to the NSM* (140 posts, 5 days),
`t/58566` *ZCG gets too much ZEC*, `t/58610` *Time to end the Zcash Development Fund*,
`t/58571` *We can disagree about grants. There's no room for hate*, `t/53554` *Coinholder
voting… whale oligarchy*.

### Findings
- **F-1** — Premise confirmed. 23% of posts are under 200 chars; one account is 17% of all
  posts; longest post 17,859 chars; median 457.
- **F-2** — **Native moderation is not the lever.** Only 4/367 posts (1.1%) are flagged
  hidden. The pain is volume, repetition, one-sidedness and contempt — none moderator-
  actionable, all reader-actionable. Justifies a client-side lens over any moderation ask.
- **F-3** — **The forum already produces the harm we feared from identity filters.**
  `t/58571#14` and `#18`: the same user answers the same claim twice, closing "It is the last
  time I will do this." `t/58515#121` asserts "I haven't seen a single person defending ZCG"
  in a thread where several had. Re-litigation happens with no filter installed. Length and
  heat are the filter. → directly resolves the design dilemma (D-3).
- **F-4** — **The best content is invisible.** The one genuine mind-change in `t/58515`
  (`#109→#112→#114`) sits at post 112 of 140. A lens that only hides is strictly worse than
  one that also promotes.
- **F-5** — **Volume ≠ bad faith.** The 17% account (`@strahncryptography`) is also the most
  concessive (4 concessions), with a *below*-median post length — many short exchanges, not
  monologue. A naive "hide the loudest" filter would delete the thread's best epistemic
  behaviour. → C3 demoted to display-only.
- **F-6** — **Discourse metadata covers ~half the relevant conflicts of interest, and misses
  the contested half.** `artkor` → "Zcash Community Grants Member" ✅; `conradoplg` → "Zcash
  Foundation" ✅; `thowar2` → empty, though his affiliation is argued over for 20 posts ❌;
  `strahncryptography` → "Regular" (a trust level), real interest only in free-text bio ❌.
- **F-7** — Undisclosed interest is already a live weapon, in both directions. `t/58515#22`
  alleges an employment link; `#104` flatly denies it. `t/58571#12` uses a *disclosed*
  affiliation as the attack ("working for the Zcash Foundation nonetheless!").
  `t/58515#135`: `@conradoplg` hand-types "(not speaking on behalf of ZF, as always)" —
  users are manually doing disclosure work that should be structured.
- **F-8** — **No API key needed.** Discourse serves read-only JSON publicly; every endpoint
  verified live and anonymously. `robots.txt` disallows only `/admin/`, `/auth/`, `/email/`,
  `/session`. `/posts.json` = 50-post forum-wide firehose (ideal incremental sync);
  `/posts/{id}/revisions/latest.json` = edit history. **No HTML scraping required anywhere.**
- **F-9** — `/t/{id}.json` returns only the **first 20 posts** plus `post_stream.stream`
  (all ids). On `t/58515` that is 20 of 140. Full threads need batched
  `/t/{id}/posts.json?post_ids[]=`.
- **F-10** — **The argument graph is free.** `cooked` HTML carries
  `<aside class="quote" data-username data-post data-topic>` — who rebuts which sentence of
  which post. 136/367 posts (37%) have it; 270/367 (74%) have `reply_to_post_number`.
  `stripHtml()` destroys it. This is the backbone of A5, A6 and the claim digest.

### Decisions
- **D-2** — **Do not accept an API key even if offered.** It adds only flags, PMs and emails
  (liabilities, unneeded) and institutionally entangles zforum with the Zcash Foundation,
  which is corrosive to its credibility. Stay anonymous and read-only; real `User-Agent`,
  ~1 req/s, backoff on 429.
- **D-3** — **Identity filtering: ship it, as claim-aware collapse, not erasure.** Five
  rules: mute = collapse to an expandable stub; the **first appearance of any distinct claim
  is never collapsed whoever makes it**; a non-dismissable coverage meter ("muting 3
  participants — 41% of posts, 2 claims you haven't seen stated by anyone else"); mutes
  expire in 30 days; asymmetric and silent (you can never make yourself invisible to others).
  *Why:* the harm worth avoiding is not "I chose not to read this person" but "the forum
  stopped telling me what was argued" — and those separate cleanly once claims are
  first-class. Per F-3 this makes zforum strictly better than raw on the very axis of the
  worry.
- **D-4** — **Build the claim digest first (P2), not the filters.** One card per distinct
  claim — strongest statement, strongest rebuttal, who is on each side — collapses a 140-post
  fight to ~12 cards. It is also the precondition for D-3's novelty guarantee and for the
  compose-time "already argued" nudge, which attacks re-litigation at the source.
- **D-5** — **Never label anything "low quality" in the UI.** Signals are narrow and named
  ("unsourced number — '98.6%'"). Specific labels are falsifiable and defensible; "poorly
  argued" is a slur and will be fought. Related: no public per-author scores, ever, not even
  internally.
- **D-6** — **C3 (volume dominance) is display-only and must never feed a hide decision**
  (from F-5). Every threshold gets validated against E3 (concession) before shipping.
- **D-7** — Interest disclosure ships in strict order of defensibility: D1 structured
  metadata → D2 quoted self-disclosure → (last, maybe never) a community registry.
  Third-party allegations **never render as a chip**; they go in a collapsed "contested
  interests" tray showing accusation and denial with both links. zforum reports that a
  dispute exists; it does not adjudicate it.
- **D-8** — Reuse `alchemydc/synapse` `src/services/discourse/types.ts` (MIT) nearly as-is;
  rewrite the fetch logic. Four required changes: page the full stream (F-9); drop the
  `Api-Key`/`Api-Username` headers; parse quote asides *before* stripping HTML (F-10);
  remove the `updated_at < since` skip (detecting "already answered" needs the whole thread,
  not a time window). Also absent there: politeness delay, `hidden`/`post_type` handling,
  revision tracking.
- **D-9** — **Rewriting: detox and steelman are different features with different risk.**
  Detox = same claims at same strength, affect removed (faithful). Steelman = adds what the
  author did not say (authoring content, attributing positions). Detox may be default-on in
  the Calm lens; steelman never is. Both always labelled as machine paraphrase, original one
  click away, **never rendered as the author's words**, copy carries the attribution.
- **D-10** — **Provenance checking is the mechanism that makes rewriting safe.** Every
  sentence of a detox must map to a source span in the original; anything unmapped renders as
  *"added by zforum — not said by the author."* Converts the feature from trust-me to
  checkable, and stops detox silently drifting into steelman. Do not ship prose rewriting
  without it.
- **D-11** — **Strength preservation is a hard constraint on detox.** Rendering "ZCG is a
  looting, self-serving org" as "some have raised concerns about efficiency" is a failure, not
  a success — it misrepresents the author and both sides will correctly call it censorship.
  Remove the affect, never the force. Keep an "original tone: hostile" indicator so readers
  know heat was removed rather than absent.
- **D-12** — **Steelman belongs at compose time, not read time.** Show the steelman of the
  post you are *replying to* — attacks strawmanning (A3) at the moment it is created. Blanket
  read-time steelmanning flattens the thread into uniform reasonableness, hiding who argues
  in good faith and laundering positions that have not earned the upgrade. Offer "steelman
  the view I disagree with", asymmetric by design. Posts with no extractable claim ("Kill
  both.") are ineligible — generating an argument for them is fabrication.
- **D-13** — **Start rewriting as annotation, not prose** (new phase P2.5). A one-line
  `claim: … · tone: hostile · [show original]` above a folded post is cheaper, lower-risk,
  has no voice-homogenisation problem, needs no provenance UI, and reuses the claim digest.
  Full prose detox becomes an opt-in upgrade (P6) only if annotation proves insufficient.
  *Why also:* full rewriting flattens non-native English speakers hardest, and they are a
  large share of this forum.

### Deliverables
- `SPEC.md` — specification v0.1, 11 sections. Uncommitted.
- `WORKLOG.md` — this file.

### Open questions carried forward
- **Q-1** — Does the claim digest relieve the anguish, or is most of the relief just
  run-collapsing the dominant voice? Cheap A/B on `t/58515`.
- **Q-2** — Publish the lens or keep it private? A public zforum view of a live argument is
  itself a move in that argument.
- **Q-3** — Who may edit the affiliation registry, and what is the appeal path? Unanswered,
  this sinks P8.
- **Q-4** — Surface E3 (mind-change) forum-wide as a "people changed their minds here" feed?
  Possibly the best incentive redesign available and nearly free once claims are extracted.
- **Q-5** — Does the forum ToS permit a public mirror, or only local use? **Unchecked.**
- **Q-6** — Does annotation (D-13) capture most of the value of prose detox? If yes, P6 never
  gets built and the project dodges its largest reputational risk.
- **Q-7** — May a detox be shown to the *author* of the post it rewrites, pre-send?
  Potentially the highest-leverage intervention in the design, and the most patronising.
  Needs user testing, not argument.
- **Q-8** — If detox and original diverge in reader understanding, which counts as "what was
  argued" for the novelty guarantee? Current answer: always the original.

### Standing risk
The rubric becomes a governance object. In a forum where people already accuse each other of
being Feds and of hidden conflicts, a tool that labels arguments will be read as a political
actor, and whoever ships it is a participant with a stake. The defence is not a neutrality
claim but **verifiability**: published versioned rubric, open prompts, open gold set, every
label carrying its quoted span, local scoring, no public scores, right of reply. Consider
inviting a known critic to review the rubric pre-launch. The rewrite layer (§7) raises this
risk materially — "it put words in my mouth" is the most likely public attack.

### Next actions
- **A-1** — Promote the 367-post sample into the repo as a test fixture / gold-set seed.
- **A-2** — P0: ingest + quote/reply graph builder (no model). Per D-8.
- **A-3** — Hand-label ~300 posts against the §3 taxonomy; publish per-signal
  precision/recall. Tune for precision.
- **A-4** — Check the forum ToS (Q-5) before any public mirror.

---

## 2026-10-31 — Session 1, addendum: scope correction on rewriting + API key

### Correction (supersedes D-9, D-12)
The earlier reading of "steelman" was wrong. It was specced as *augmentation* — the model
supplying missing considerations and stronger arguments. **That is not wanted.** The goal is
only that a post become easier to read from an emotionally mature perspective: a **tone
transform over existing content**, with no model-generated arguments.

- **D-14** — **One operation, not two: "plain restatement."** Faithful re-voicing only. The
  model never invents arguments, supplies missing considerations, adds evidence, or improves
  reasoning. §7 rewritten accordingly; **D-9** (detox/steelman split) and **D-12**
  (compose-time steelman) are retired. *Why this is a gain, not a loss:* it removes the
  laundering risk, the false-balance risk, and most of the misattribution risk in one move,
  and it makes the fidelity guarantee enforceable rather than aspirational.
- **D-15** — **"Missing something" is handled by citation, not generation.** What a post is
  missing has almost always already been said by someone else in the thread. Surface *that
  post*, by link, with its author. The claim digest's "strongest statement" / "strongest
  rebuttal" fields are **selections from existing posts, never syntheses**. If nothing in the
  corpus supplies the missing piece, zforum says nothing — **silence over invention.**
  *Why:* the argument then has an author who stands behind it, a reader can verify it, it
  credits the person who made the point instead of laundering their work into model output,
  and it is the direct antidote to F-3 (the missing piece is usually already on the page,
  unread).
- **D-16** — **Provenance upgraded from label to gate.** With generation off the table, an
  unmapped sentence is a *bug*, not something to disclose. Every sentence of a restatement
  must map to a source span; if any claim-bearing sentence fails to map, **reject the
  restatement and show the original.** No "added by zforum" annotation, because nothing
  should ever be added. Only possible because generation was cut.
- **D-17** — **The transform rule: strip intensifiers that mark contempt for the
  interlocutor; keep intensifiers that mark confidence in the claim.** "Obviously X" → "X";
  "X, and only an idiot disagrees" → "X"; but "X would be catastrophic" **stays** — that is a
  claim about X, not an attack on a person. Preserved absolutely: the claim and its force,
  the conclusion *including a flat refusal* (**disagreement is not immaturity**), every
  number/name/link/citation, and any question or demand ("state your evidence",
  `t/58515#136`) — those are the productive parts of a hostile post.
- **D-18** — **Never call it "the mature version" in the UI.** That labels the author
  immature and starts exactly the fight the product exists to avoid. The UI says *"plain
  restatement"* and *"show original"*, and says nothing about the author.
- **D-19** — **Do not use the forum API key, and do not put it in this container.** Confirms
  and strengthens D-2 with new evidence (F-11). Offered key declined on the merits.

### Findings
- **F-11** — **`/raw/{topic_id}/{post_number}` returns the author's original markdown with no
  authentication**, and its quote syntax `[quote="thailand85, post:123, topic:58515"]` carries
  the same argument graph as the cooked HTML asides, in a trivially parseable form. Verified
  live. This closes the last plausible reason to want an API key — `raw` is usually assumed to
  require one via `post.raw`. **Prefer `/raw/` for text; keep `cooked` only for rendered
  output.**
- **F-12** — Rate limits are not a real constraint either: a full backfill of all 248,541
  posts at 40 posts/request and ~1 req/s is ~6,200 requests, under two hours, once.

### Phasing change
P7 (compose-time steelman) deleted. Affiliation registry moves P8 → P7. P6 is now "full prose
restatement + provenance gate." There is no generation phase at all: "cite, don't generate" is
satisfied by P2's digest, which selects existing posts.

### New open question
- **Q-9** — Is "strip contempt intensifiers, keep confidence intensifiers" (D-17) actually
  separable in practice, or does it collapse under adversarial phrasing? **The single riskiest
  assumption in §7**, and the first thing the gold set should test.

### Secret-handling note
A forum API key exists but has deliberately **not** been shared with this session and should
not be. If authenticated access is ever needed (it should not be, per D-19/F-11), the key
belongs in the deployment environment, never in the repo, never in a shell command, and never
pasted into a chat transcript. Note that this container runs in bypass-permissions mode, so
"not leaked" is a matter of command hygiene rather than a hard boundary — a single `curl -v`
or verbose error would put it in the transcript permanently.

### Later additions, same session
- **F-13** — Anonymous access withholds exactly three things, verified live: the *text* of
  community-hidden posts (`cooked` is replaced by a placeholder; `/raw/` 404s on them), the
  review/flag queue (`/review.json` → 403), and private messages (→ 403). Admin surfaces are
  additionally gated. **No restricted categories appear in the public category listing**,
  though a fully-hidden category would be unenumerable anonymously by definition — the one
  genuine unknown.
- **F-14** — Consequence: `/raw/` and the topic JSON **inherit the forum's moderation
  decisions for free.** The ingest layer cannot accidentally surface flag-hidden content. A
  key would remove that protection, and un-hiding what the community voted to hide would
  invert the product's purpose. Logged as a risk in §9.
- Forum runs Discourse `2026.11.0-latest`.

---

## 2026-10-31 — Session 1, addendum 2: the key is read-only (revises D-19's rationale)

The forum key is **read-only**. That retires the sharpest objection raised against it — a
read-only key cannot post, edit, flag or impersonate, so the "leaked credential becomes a
forgery weapon in a live funding dispute" argument does not apply and should be struck from
the earlier reasoning.

The conclusion is unchanged, but it now rests on measurement rather than on risk:

- **F-15** — **The gated surfaces are gated on privilege, not on authentication.** On a
  hidden post, anonymous JSON reports `can_see_hidden_post: false`; that flag is satisfied by
  being staff or the post's own author, not by holding a credential. `/review.json` requires
  staff; the admin user endpoints require admin. **Therefore a read-only key bound to a
  non-staff account sees precisely what anonymous sees — it unlocks nothing at all.**
- **F-16** — **Anonymous access is not rate-limited in practice.** Measured: 30 sequential
  `/t/{id}.json` fetches in 7 seconds, all HTTP 200, no 429s — ~4 req/s sustained. Full
  backfill of 248,541 posts ≈ 6,200 requests ≈ **25 minutes**, once. This retires F-12's
  two-hour estimate and kills the throughput argument for a key.
- **F-17** — Caveat that survives: **"read-only" constrains writes, not reads.** A read-only
  key bound to a *staff* account still reads hidden post text, the flag queue, and the admin
  user list *including email addresses and IPs*. If the key is staff-bound, it is custody of
  data zforum must not hold, regardless of the read-only scope.
- **D-20** — **Revises D-19.** Still do not use the key, but for the correct reason: against a
  non-staff read-only key it confers no capability (F-15) and no throughput (F-16), so there
  is simply no benefit to weigh. The institutional-entanglement cost (§9) stands but is
  secondary. If the key is staff-bound, F-17 becomes the primary reason to leave it out.
  The container-hygiene note from addendum 1 still applies: a read-only key is still a
  credential, and one that lands in a transcript still has to be rotated.

---

## 2026-10-31 — Session 2: static prototype

### Request (verbatim intent, recorded before execution per CLAUDE.md)
Scrape a decent amount of recent forum content and build a **static prototype** of the idea.
Sonnet subagents supply the intelligence for now. There is no automatic AI integration, but
the work given to the subagents must be replaceable by an API-key-backed backend. Three new
features:
1. **Summary of stuff.**
2. **Self-quiz** so a reader can check whether they understand the arguments.
3. **Proof of checking:** when a user posts on the forum, they can prove that zforum checked
   the post for repetition, false claims and similar. A trusted third-party model is
   enough; no ZK proofs.

Also adopted this session: `CLAUDE.md` working rules, with a zforum ratification section.

### Open before building
- **Q-10** — How many threads get deep model analysis (sets the subagent token spend)?
- **Q-11** — Receipt semantics for feature 3: a findings receipt (always issued, records
  what was found) or a clearance stamp (issued only when nothing is flagged)?
- **Q-12** — Should the crawler's User-Agent carry a contact email?

### Rulings (user, 2026-10-31)
- **D-21** (answers Q-10) — Deep model analysis covers **~12 threads**: the hottest threads of
  the last ~30 days. Every thread in the crawl window is still crawled and shown with the
  signals that need no model.
- **D-22** (answers Q-11) — The feature-3 receipt is a **findings receipt**. It is always
  issued, and it signs the exact post text together with what the checker found. It is never
  a clearance stamp. An append-only, hash-chained log records every check issued, so
  "retry until clean" is visible. zforum never decides who may post.
- **D-23** (answers Q-12) — The crawler User-Agent carries **no email**.

### Design decisions for the prototype
- **D-24** — **Model work is a task, not code.** Each task (`analyze_thread`, `quiz_thread`,
  `forum_digest`, `check_draft`) is a prompt file, an input builder and an output schema.
  A backend turns a job (prompt + input + schema) into an output: today a Sonnet subagent
  reading the job directory, later the Anthropic API with a key. Both backends consume the
  same job files. Every accepted output passes the same gate: schema validation, plus
  semantic checks (every cited post exists, and every quoted span occurs verbatim in its
  source). Outputs are stored with provenance (task, prompt hash, input hash, model, backend).
- **D-25** — **The checker judges "false" only against the thread.** In `check_draft`, a
  factual finding is `contradicted-in-thread` or `supported-in-thread`, citing posts, or else
  `unsourced`. The model's own world knowledge never produces a "false" verdict. That keeps
  every finding verifiable by a reader (§9: verifiability is the only defence) and stops the
  checker from becoming an arbiter of truth.
- **D-26** — **The site is static and makes no live model calls.** The compose page produces
  a check request. The operator runs it through a backend (a subagent today, the API later)
  and issues a signed receipt, which the author pastes at the end of the post. Verification is
  entirely client-side (WebCrypto Ed25519) and checks the published log.

### Findings (session 2)
- **F-18** — **`include_raw=true` works on both `/t/{id}.json` and the batched
  `/t/{id}/posts.json?post_ids[]=`.** It returns the original markdown inline, so the crawler
  needs no per-post `/raw/` request: 1 + ⌈(n−20)/40⌉ requests per thread instead of n.
- **F-19** — **On flag-hidden posts the `raw` key is absent, not null** (verified on
  `t/58515` #10, #85, #142). Every visible post carries it. The parser enforces
  "`raw` present exactly when `hidden` is false". The first crawl crashed on this, which
  is the strict parse doing its job: the assumption from session 1 was wrong.
- **F-20** — Activity volume: 271 topics were bumped in the 30 days to 2026-10-31, and about
  14k posts were active in the last two weeks. Four multi-year megathreads (Price
  Speculation: 7,446 posts) dominate the raw post count. The crawler fetches threads of
  ≤300 posts whole, and longer ones as their opening posts plus an in-window tail capped at
  400 posts. The manifest records which scope each thread got.
- `tools/fetch_sample.sh` and `tools/fetch_topic.sh` were replaced by
  `python -m zforum.crawl` (with `--topics` for the SPEC §2 research sample). They
  duplicated the crawler, and `fetch_topic.sh` sent an email in its User-Agent (`D-23`).
- **F-21** — **A2 (unsourced number) is noise on opening posts.** Sampling the 30-day crawl
  turned up 1,894 A2 spans. They were real quantities, but most sat in grant applications
  and reports ("$9,600", "$120,000"), where the figures are the author's own budget, not a
  claim against anyone. A2 now fires on replies only. The precision-first rule from §8.4
  applied before any gold set existed.
- The first crawl's manifest was written by code from before the `selection` field existed.
  The data was identical, so its top-level `window_start` was converted once, by hand, into
  `selection: {kind: recent-window, window_start}` rather than re-crawling (~400 requests).
  Snapshot: `data/crawls/20261031T215141Z`, 271 topics, 5,639 posts, 7 hidden.

### Ruling (user, 2026-10-31)
- **D-27** — **Never run more than 5 agents at a time.** The 8 analysis subagents already
  running may finish. Every later batch (digest, draft checks, reruns) stays at 5 or fewer
  concurrent agents.

### Findings (session 2, continued)
- **F-22** — **Deleted posts leave gaps that replies still point at.** In `t/55855` the
  post stream holds 86 posts against a highest post number of 126. Replies to #4, #6, #10
  and others refer to posts that no longer exist anywhere, so analysis cannot cite them.
  This is not a crawl gap: the crawler fetched every id in the stream.
- **F-23** — **The model outputs are usable at precision-first settings.** Across the 12
  threads, subagents emitted 25 E3 (mind change), 31 E1, 23 B3, 25 A4 and 8 B2 signals,
  each with a verbatim span. A sample of conduct signals read as correct ("You want your
  boss to make more money" → A4). There is no gold set yet, so this is a spot check, not a
  measurement (A-3 still stands).
- **F-24** — **Writing a second, independent receipt verifier (JS) found three places
  where implementations could disagree:** integers above 2^53−1, floats in integer fields,
  and lone surrogates. All are now rejected by the format (SPEC §12.2) before any receipt
  was issued. Whitespace and lengths are pinned to Python `str.isspace` and code points.
- **F-25** — **The forum digest's picks are balanced within the ZCG debate (end / defend /
  middle path) but give one pick to each other debate**, as its author agent itself
  reported. Worth a prompt revision later; not changed now, because changing a prompt
  invalidates every output it produced.

### Decisions (session 2, continued)
- **D-28** — **Stale model outputs stop the build.** A result is bound to its input hash
  and prompt hash. Re-crawling (new posts) or editing a prompt makes `zforum.site` refuse it
  until the task is re-run, so published outputs always match published prompts.
- **D-29** — **Discourse trust-level titles ("Regular", "Leader", ...) are not shown as
  affiliation.** SPEC §4 found them misleading. D1 shows other titles and primary groups.
- **D-30** — **Muting is disabled on unanalyzed threads**, because the novelty guarantee
  needs the claim graph. The Calm lens still folds deterministic signals there.

### Status at end of session 2
Built, tested and committed:
- the crawler (`zforum.crawl`)
- the thread model and deterministic signals
- the model-task pipeline with subagent and Anthropic API backends (`zforum.intel`)
- signed findings receipts with a hash-chained log (`zforum.attest`)
- the static site (`site/`, built by `zforum.site`)
- 12 thread analyses, 12 quizzes, a forum digest and 3 draft checks, all produced by
  claude-sonnet-5-5 subagents

Every view was verified by headless-Firefox screenshots at 1280px and 390px. Three bugs
were found that way and fixed:
- quiz rendering
- raw markdown in excerpts
- a protocol-relative link passing as a forum path

### Next actions
- **A-5** — **Decide whether to commit the crawl snapshot** (36 MB, `data/crawls/20261031T215141Z`).
  Committed results are bound to it by input hash, so a fresh clone that re-crawls gets newer
  posts and the build refuses the results until the tasks are re-run. Committing it makes the
  repo self-contained, but it is a mirror of forum content, which ties to Q-5 (ToS).
- **A-6** — Add a `statement_span` to claims, so the digest quotes the passage that makes
  the claim rather than the start of the post. Needs a prompt and schema change and a re-run
  of all 12 analyses.
- **A-3**, **A-4** carry forward unchanged: the gold set, and the ToS check.
- **A-7** — Run the jobs through `run-api` once an API key is available, and compare with
  the subagent outputs on the same inputs.

---

## 2026-10-31 — Session 2, addendum: digestible main mode

### Ruling (user)
- **D-31** — **The current UI is a research piece, and becomes "Research mode".** The main
  format must be far more digestible. Design target: someone with **10 minutes** gets caught
  up on temperature, importance, the main views, and how those views align or misalign with
  their own, without the details. Research mode stays available for anyone who wants to
  check the work.

### Open before building
- **Q-13** — How zforum learns the reader's own views (asked once across threads, per
  thread, or both).
- **Q-14** — What "importance" means (stakes, activity, or both), given the risk of zforum
  becoming an editorial actor (SPEC §9).
- **Q-15** — Whether a new model task produces purpose-built briefs, or the main mode is
  derived only from the existing analyses.

### Rulings (user, 2026-10-31)
- **D-32** (answers Q-13) — **Ask once.** The reader answers 4 to 6 short cross-thread
  questions drawn from this period's debates, in about 30 seconds. Answers stay in the
  browser only. Every thread then shows which views match or oppose the reader, and the
  best point made against the reader's view, cited from a real post.
- **D-33** (answers Q-14) — **Importance = stakes + activity, shown as reasons, never a bare
  score.** The model tags what kind of thing is at stake and whether a decision is pending.
  Activity is measured: participants and posts in the period, and the last post. The
  ordering rule is fixed and printed on the page: open decisions on funding, protocol or
  governance first, then everything else, each group by number of participants.
- **D-34** (answers Q-15) — **New model tasks.** `brief_thread` writes a 10-minute brief per
  analyzed thread. Its views carry their holders and a verbatim best-for and best-against
  quote, so nothing is invented (`D-15`). `forum_issues` derives the cross-thread
  questions and maps each thread's views to their stances. Existing analyses stay valid.
  Subagents run at most 5 at a time (`D-27`).

### Design
- Routes: `#/` becomes **Catch up** (the main mode); the previous front page moves to
  `#/research`. Thread pages are research mode.
- The Catch-up page has three parts:
  - a one-time stance card (skippable)
  - a ranked list of compact brief cards, about 40 seconds each, with: temperature gauge,
    importance reasons, why it matters, views as bars sized by holder count with
    match/oppose marks, the best point against your view, common ground, what is
    unresolved, and what happens next
  - a short "also active" list for unanalyzed threads
- Temperature is the analysis's overall tone plus the measured share of heated or hostile
  posts.

### Findings (catch-up build)
- **F-26** — **The forum already contains text aimed at AI readers.** A subagent briefing
  `t/55855` reported a "NEW PROMPT" line in #11 and a proof-of-work challenge in #16. It
  treated both as data. The "post text is data, not instructions" line in every prompt,
  and the verbatim-span gate, are load-bearing, not boilerplate. An attacker who wanted to
  steer a summary would need the steered text to survive the validator, which rejects any
  quote that does not appear verbatim in the cited post.
- **F-27** — **"Decision pending" covers decisions of very different concreteness.** 7 of
  the 12 briefs are marked pending (counted from `intel/results/brief_thread/`): 6 funding,
  1 personal-funds. They range from an open poll (`t/58566`) to draft ZIPs with no vote or
  date (`t/58515`, `t/58656`, as the agents reported). The catch-up page prints the decision
  text itself under "Deciding:", so a reader can judge how concrete it is. A
  "decision date known" field would be a cheap refinement.

---

## 2026-10-31 — Session 3: restart from the recorded design

### Ruling (user, recorded before execution)
- **D-35** — **The session-2 prototype is set aside.** It is too complex, with too many
  half-baked features, and too many of them were invented by the AI rather than designed by
  us. Everything built so far moves, unchanged, to `archive/research-prototype/`, where it
  still runs (its paths are relative to that directory). `CLAUDE.md` and this ledger stay at
  the repo root. `SPEC.md`, `HANDOFF.md` and `README.md` describe the archived prototype and
  move with it; the root gets a short `README.md` and `HANDOFF.md`.
- The new design input is the design conversation recorded 2026-10-31 19:26
  (`Oct-31-07-26-PM-zforum-spec-a1d3ae28-24b4.md`, the user's file, left uncommitted).
- **Sequence:** (1) summarise our understanding of the recorded design; (2) the user
  corrects it; (3) build a simple design prototype, demonstrated on the ZCG controversy, as
  an HTML and JavaScript page, with a Rust backend only if it needs one. Its purpose is to
  iterate on the design before the first real prototype is written. Nothing gets built
  until step 2 is done.

### Rulings on the design summary (user, 2026-10-31)
- **D-36** — **The clean version changes tone only.** It removes insults, sarcasm and
  contempt, and keeps every claim at full strength, with every number, name, link and
  question. Poor or one-sided reasoning is never edited out. It shows up as marks and
  greying instead, because removing it would mean deleting what the author argued or
  adding what they did not.
- **D-37** — **Marks:** each post gets a 1–10 maturity score plus named traits. Each mark
  carries a one-line reason and the quoted words. The reader chooses a minimum score and
  which traits grey a post out. Greyed posts stay readable; nothing is hidden.
- **D-38** — **The 7 traits** (chosen from the tallies over the 350 analysed posts of the six
  ZCG threads): contempt, questions motives, repeats, unsupported, one-sided,
  strawman/simplistic, no content.
- **D-39** — **The ZCG topic is six threads:** t/58515, t/58566, t/58656, t/58611, t/58610
  and t/58571, all taken from the existing snapshot (354 posts, 60 authors, 94 posts in the
  24 hours to the snapshot), which is enough for "what's new". The home page's other cards
  are lorem ipsum, to show the style; only ZCG is real.
- **D-40** — **Account age is included**, on the topic card and beside each author. It is
  fetched from public profiles (60 requests at 1 per second).
- **D-41** — **The first design prototype has the home page and the topic page only.**
- **D-42** — **Mind changes are rated by readers on zforum,** at four levels, from "made me
  dig in" to "changed my mind". Each post shows the count at each level and the average.
  Shared counts need a backend, so the prototype gets a small Rust server for ratings
  only. The user left the names and UX to us.
- **D-43** — **Anonymous mode can be lifted for a single post.** In anonymous mode the reader
  can reveal the author of just the post they are curious about.
- **D-44** — **Later, not now:** a calmness slider, so the reader picks how calm and neutral
  the restatement is.
- Recorded at the user's request in the design conversation: **zforum deliberately has no
  filter for individual accounts.** People would mute those they dislike, argue from
  incomplete knowledge, and build echo chambers.

### Findings (design prototype build)
- **F-28** — **Parallel subagents collided in the shared scratchpad.** Several named their
  helper script `build_marks.py`; one agent re-ran a script another had overwritten, which
  rewrote `marks-58611-1-37/output.json`. Every accepted output was then compared with its
  agent's reported restatement list and trait counts: all matched exactly and equal the
  files on disk, so no output was damaged (the rewrite re-ran that job's own latest script).
  **D-45:** subagent launch instructions require job-specific helper names and forbid
  running a script the agent did not write.
- **F-29** — **12 of the 60 authors hide their forum profile.** Their account age shows as
  "profile hidden". That choice is respected, not worked around.
- **F-30** — **Restatements drop conflict-of-interest allegations along with motive
  attacks.** `58515/22` loses "@maxdesalle works for Winklevosses": the prompt says to
  remove imputed motives, while `D-36` says to keep every claim. The post is still marked
  "Questions motives" and the original is one click away. The agents are not even
  consistent: the restatement of `58515/100` keeps its allegations ("Tom runs one of the
  VCs…"). Open: **Q-16**.
- **F-31** — **No post in the six threads tried to instruct the model.** Several paste
  AI-written text as part of their own argument (`58566/69`, `58656/36`); agents judged
  those as ordinary posts.
- Results: 77 of the 350 visible posts got a restatement (the rest were already calm).
  Trait marks: unsupported 53, motives 45, contempt 37, no-content 22, strawman 14,
  repeats 8, one-sided 2. Maturity runs 2 to 10. The default minimum of 4 greys 42 posts.

### Open
- **Q-16** — Should a restatement keep an allegation of interest ("X works for Y") as a
  claim, or drop it as a motive attack?

### Status
Built and verified with screenshots at 1280px and 390px:
- the home board (the real ZCG card plus six lorem ipsum cards; interest filter)
- the topic page: overview with thread-lettered, maturity-coloured citations; "why do
  people think this?"; what's new; reading settings; the whole discussion as calm
  restatements with marks, greying, anonymous mode with per-post reveal, and mind-change
  ratings
- the Rust ratings server
Gate: 26 node tests, 11 Rust tests, clippy clean, and the build re-checks every accepted
result. Awaiting the user's review.

## 2026-11-01 — Session 3 (continued): design changes after the first review

### Rulings (user, recorded before execution)
- **D-46** — **Time on forum is prominent and filterable.** Each author's account age is a
  clear badge beside the name. A new reading setting, *minimum time on forum* (any, 30 days,
  90 days, 1 year, 2 years), greys posts from newer accounts, with the reason shown; nothing
  is hidden. Authors who hide their profile are never greyed by it, since their age is
  unknown. It applies to every account of an age, never to a named person, so it does not
  breach the no-individual-filter rule. Anonymous mode still hides the badge (SPEC §3.7);
  the filter still works there and its reason does not state the age.
- **D-47** — **Controls sit at the top of every topic page.** One bar above the summary holds
  "What's new since" and a button that opens all reading settings in place. The list of
  what's new stays in the page body.
- **D-48** — **One tab per thread, styled like the forum.** The discussion is six tabs (A–F,
  short title, post count, new-post count); only the open tab's posts are on the page. A
  citation opens its thread's tab at that post. Inside a tab it looks like a plain Discourse
  thread (title, letter avatars, bold usernames, date at the right, thin dividers), headed as
  a read-only copy of forum.zcashcommunity.com. No forum logo, no copied stylesheet. zforum's
  own additions (marks, ratings, feedback) keep zforum's style so they stand out.
- **D-49** — **Restatement and original are tabs inside each post,** opening on the
  restatement, in clearly different colours (restatement tinted and labelled as AI-written;
  original plain like the forum). Already-calm posts show only the original.
- **D-50** — **Two feedback sliders on each restated post, alongside the mind-change
  ratings:** *emotions* ("this restatement helped me avoid negative feelings") and *head*
  ("I got something out of this that I wouldn't have had if it wasn't restated"). 0–10,
  unrated until moved, clearable. **Feedback for us only, for now:** the server stores it,
  readers see only their own answers, and the page says so.
- **D-51** — **The page must stay fast.** Posts load 20 at a time as the reader scrolls, like
  the forum, and a click inside a post redraws only that post. (Cause found: every click
  redrew all 354 posts, each in both versions.)
- **D-52** — **Maturity and trait definitions are unchanged for now;** the users will come
  back to them.

### Findings (design changes build)
- **F-32** — **The slowness was whole-page redraws.** Every click redrew all 354 posts with
  both versions built (9,702 elements); a settings change took about 250 ms in headless
  Firefox, and so did every rating click. Now one thread tab is on the page, 20 posts at a
  time (about 1,100 elements); a settings change takes about 85 ms, and clicks inside a post
  (tabs, ratings, sliders, reveal) update only that part, without a redraw.
- **F-33** — **The age filter's reach in this topic:** at 30 days it greys no posts; at 90 days,
  4 posts from 3 accounts; at 1 year, 136 posts from 15 accounts; at 2 years, 157 posts from
  18 accounts. 12 hidden profiles are never greyed by it.

### Status
Built and verified with screenshots at 1280px and 390px, and through the API with curl: the
reading bar, thread tabs in the forum's style, version tabs, the age badge and filter, the
feedback sliders (stored, returned only to their reader, read by
`tools/feedback-report.mjs`), and loading on scroll. The ratings and feedback stores share
one generic store (`server/src/store.rs`); the ratings file format moved to
`zforum-ratings-2` (field `entries`), which is internal (no promise, and no ratings file
existed). Gate: 33 node tests, 19 Rust tests, clippy clean. Awaiting the users' review.

## 2026-11-01 — Session 3 (continued): the reading framework goes to Codex

### Ruling (user, recorded before execution)
- **D-53** — **The next task is worked on with Codex,** from a handoff in `HANDOFF.md`. The
  task: adopt the reading framework ChatGPT produced from the user's annotations of 12 forum
  posts (`/home/firexware/ml/discourse-evaluation-agent-handoff.json`, outside the repo),
  following ChatGPT's accompanying recommendation, which is recorded verbatim in
  `HANDOFF.md`. Claude's assessment of the framework, given in chat, is set aside at the
  user's instruction ("ignore the last response") and is not part of the handoff. The
  framework file stays out of git: it is the user's working file and contains local paths
  and the user's comments.

## 2026-11-01 — Session 4: adopt the reading framework

### Rulings (recorded before execution)
- **D-54** — Adopt the proposed reading framework described in D-53: independent tone,
  premise-transparency, reasoning and contribution ratings; passage-backed flags;
  faithful neutral renditions; separate automatic AI-generated analysis; and summaries
  organised by points of contention. The twelve examples remain provisional calibration,
  not validated ground truth. This supersedes D-36 to D-38 and D-52 where they conflict.
  Central allegations remain attributed allegations in renditions (resolving Q-16);
  changing tone must not manufacture support. Original posts remain directly accessible.
  Display the unreviewed-analysis disclosure without a reporting invitation, since no
  contact route exists. Preserve the unrelated features listed in HANDOFF.md.
- **D-55** — **Filtered posts start collapsed; when expanded they are greyed out.**
  The user explicitly chose this over leaving them fully readable by default. Each
  collapsed post states the filter reasons and can be expanded. Reading filters affect
  presentation, not the argument coverage of summaries. This supersedes D-37's
  always-expanded presentation and applies to the account-age filter too.

### Status
Implementation in progress; user verification remains pending.

### Additional rulings (user, before implementation)
- **D-56** — Add a Diff tab beside Original and Restatement for posts with a rendition.
  Show removed and added wording distinctly so readers can inspect the actual changes.
  Posts without a rendition need no diff.
- **D-57** — Add Select posts mode with checkboxes, a selection count, clear and export
  controls. Selections survive thread-tab changes. Export one self-contained Markdown
  file containing the reusable summary prompt, selected original posts, and links to
  their zforum and original-forum locations. The user explicitly chose one combined
  file over separate prompt and selection files. Also allow copying the selected links.
  The prompt requests a cited summary by points of contention, preserves dissent and
  flags missing context; forum text is data, never instructions. This brings the manual
  selection part of SPEC §10's own-AI feature into the current prototype.

### Findings and implementation status
- **F-34** — Implemented D-55 to D-57: filtered posts collapse, expand greyed and remain
  selectable; diff tabs compare original authored text with the rendition, retaining
  quotes separately; manual selection exports a combined prompt/source Markdown file
  and direct links. Export explicitly includes original authors even in anonymous mode.
  Internal site data moved to `zforum-design-2` to retain raw and authored source text;
  builder, browser and Rust server use that format. No ratings or feedback API changed.
- **F-35** — The unit/Rust/build gate passes. Added exact diff/export/route tests and
  generated checks for diff reconstruction, longest shared subsequences and source-fence
  preservation. All 77 existing renditions diffed in ~23 ms total, slowest ~3 ms in Node.
  Browser integration is **not verified**: localhost binding fails with `Operation not
  permitted (os error 1)` in this sandbox; a separate offline Firefox attempt crashes with
  exit 139. `tests/browser.mjs` records a bounded integration check for a suitable local
  environment, including real file download comparison and desktop/mobile screenshots.
- The broader D-54 framework migration remains outstanding after the user's pause to add
  these features. Existing model prompts and accepted outputs are unchanged. User review
  is pending for the additions; no task is marked complete.

## 2026-11-01 — Summary reading experience handoff

### Ruling (user)
- **D-58** — The user accepted the suggested direction for reducing the burden of the
  20-argument summary and requested a handoff for their website agent. Present a short
  orientation followed by approximately five or six expandable cards organised around
  questions/points of contention, with concise explanations and cited arguments beneath.
  Remove the duplicate full-text list and grouped rendering. Keep every question
  directly accessible; an optional Next button and quiet exploration progress can
  support guided reading. Progress must not imply agreement or comprehension. The
  specific six headings and sample copy are prototype proposals, not verified summaries.
  This refines D-54's summary presentation without replacing the outstanding framework
  migration. The implementation brief and evaluation criteria are in `HANDOFF.md`.

### Status
- Handoff prepared; no website code, model output or summary schema changed in this
  task. Implementation and user verification remain pending. General NN/g guidance
  informed the proposal; no claim of a measured dopamine reward or zforum usability
  result is made.

## 2026-11-01 — Incorporate the approachable-summary handoff

### Ruling and implementation plan (before execution)
- **D-59** — The user instructed the website agent to incorporate the D-58 handoff.
  Replace the duplicate points/groups presentation with six directly accessible question
  cards, a short cited orientation, concise cited positions and unresolved questions,
  and detailed arguments on demand. Retain stable point ids and first-appearance
  citations for what's new; audit all twenty existing points against the new cards.
  Store the explanations and D-54 contention fields in the single summary output,
  validate them, and regenerate/accept that output with honest model provenance.
  An optional Next question action opens and focuses the next question without closing
  others. Persistent progress/resume is deferred; disclosure state lasts for the page
  session. The separate ratings/renditions migration remains outstanding. Preserve all
  existing post tools and reading controls. User verification remains pending.

### Findings, coverage audit and validation
- **F-36** — Implemented six question cards with a three-sentence cited orientation.
  Concise expanded explanations contain 64, 66, 71, 71, 70 and 66 words respectively
  (excluding headings, citation labels and optional details). All twenty existing
  arguments retain their ids and first citations, preserving first-appearance metadata.
  There were no argument merges or splits. The one-home coverage map is:

  | Card | Detailed arguments | Cross-references |
  |---|---|---|
  | q1 — control | p1, p7 | q3, q6 |
  | q2 — useful work | p2, p5, p8 | q1, q5 |
  | q3 — funding amount | p3, p4, p6, p10, p11 | q1, q4 |
  | q4 — destination | p9, p12, p13, p14, p15 | q3, q6 |
  | q5 — adoption | p17, p18, p19, p20 | q1, q2 |
  | q6 — decision process | p16 | q1, q4 |

- **F-37** — Source review preserves qualifications that a compressed summary can lose:
  the ZSA poll's scope and denominator are disputed (`58566/18`, `/40`); the airdrop
  challenge and outreach rebuttal remain paired (`58656/15`, `/17`); objections to
  spending remain distinct from condemnation of identity attacks (`58571/1`, `/9`,
  `58515/121`); legal authority is reported as counsel's conditional view, not our legal
  finding (`58611/24`); mining-interest motive allegations remain allegations
  (`58515/1`, `/22`). Existing detailed points were rewritten to attribute contested
  judgments, not assert them as established facts. No external factual verification
  was performed. The renderer does not generate editorial copy or filter summary sources.
- The one summary schema includes all D-54 contention fields, including explicit
  evidence limits and separately labelled questions to clarify. The acceptance tool now
  requires an honest backend; this revision is recorded as `gpt-6`, `primary-agent`.
  Internal site format is `zforum-design-3`; removed groupings have no compatibility shim.
- **F-38** — Node tests, 19 Rust tests, clippy and the accepted-result rebuild pass.
  New structural/property tests reject lost/duplicated arguments and unsupported
  references. Nonvisual DOM-recording tests exercise the actual renderer's disclosure
  structure, Next/related focus wiring, citation actions, state retention and text-only
  handling of hostile prose. These do not substitute for browser/layout verification.
  A fresh browser attempt again failed at localhost binding (`Operation not permitted`)
  and Firefox automation startup. No desktop/mobile screenshots were obtained or
  inspected. The extended bounded browser check is committed for a suitable environment.
- User verification remains pending: ask readers to explain two explored disagreements
  and find the original evidence. The per-post ratings/renditions/notes migration is
  still outstanding, as the website handoff explicitly permits.

## 2026-11-01 — Reading controls and complete per-post framework

### Rulings (user, before execution)
- **D-60** — Move the What's new time controls directly into the What's new section.
  Make the debate summary optional and collapsed so readers can reach individual posts
  easily. All visible posts start collapsed with a succinct AI-generated post summary;
  provide Collapse all. Expanded posts excluded by a reading filter remain greyed.
  Citations still open the original and expand their target; forum-hidden posts stay hidden.
- **D-61** — The user explicitly prioritizes completing D-54's per-post framework now.
  Replace maturity and the seven traits with the four independent 0–3/null dimensions,
  passage evidence, rubric flags, faithful renditions and separate grounded AI analysis.
  Re-evaluate original posts, rather than convert legacy maturity numbers into new scores.
  Provide the rubric's tone/support presets, explicit unassessable handling, evidence
  explanations and summary-coverage information. Keep originals, diff, selection/export,
  account age, anonymity, ratings and feedback. Treat calibration as provisional and retain
  honest model/source/prompt provenance. User verification remains pending.
- **D-62** — The user authorized up to three parallel agents to re-read the visible
  posts and produce individual evaluations under D-61. Split jobs without overlapping
  output ownership; the primary agent handles integration, acceptance and validation.
- **D-63** — Regenerated renditions need a distinct feedback dataset: the existing local
  feedback includes one response to the previous text. Preserve that file. Derive the
  active feedback filename from a deterministic hash of the current rendition corpus,
  shared by the launch script and report tool. This prevents old responses being presented
  as evaluations of revised text; mind-change ratings remain attached to original posts.

### Implementation and review evidence
- **F-39** — What's new now owns its time controls, including Off. The debate summary
  starts collapsed and is optional. Every visible post starts as a succinct summary row,
  with expansion, and Collapse all closes posts across threads. Citations and deep links
  still expand the original. Filtered expanded content remains grey. Reading controls sit
  beside the discussion and separate tone, support, unassessed handling, contribution
  kinds and passage flags. Additional controls flag disputed assumptions, show constructive
  reframing, highlight new content and choose the preferred text version. Issue counts and
  attributed summaries with source links identify coverage lost to filters without removing
  any of the twenty summary arguments. Changed controls retain focus across rerenders.
- **F-40** — Re-evaluated all 350 visible originals under `reading-0.1-provisional`, with
  108 neutral renditions and 110 separate analytical notes across 103 posts. Sixteen records
  suggest review for concrete uncertainty. The longest collapsed summary is 154 characters.
  Four forum-hidden posts remain hidden and have no analysis. All ten jobs pass the new
  strict schema, verbatim authored-span, visible-reference, parent-context and claim-audit
  checks. These checks do not establish semantic fidelity or truth. The primary agent
  inspected selected difficult rewrites and authored the final 22 posts (58515/121–143);
  that mixed batch explicitly records `primary-agent+subagent`. Other batches record
  `subagent`; the model is gpt-6. The rubric is included in the prompt hash. Internal site
  format is now `zforum-design-4`; old maturity/trait/clean fields and controls are removed.
- **F-41** — Qualitative calibration remains provisional. ZAP #15 retains tone 1,
  transparency 1, support 2 and contribution 2; #17 has 3/2/2/3, distinguishing a useful
  outreach hypothesis from demonstrated retention. End ZCG #64 has 2/2/2/3 and keeps the
  hypothetical coalition explicitly hypothetical. Two judgments differ from the proposed
  examples: #54 gets tone 1 for sarcastic dismissal rather than a direct personal attack;
  #67 gets predominant tone 1 with an isolated material peak of 0. The other calibration
  examples were consistent, but this is not an accuracy measurement or a gold-standard test.
  Additional source review included opposing-side unsupported accusations (#44 and #98),
  both with tone/support 0; #113's opponent quotation does not lower authored tone 3;
  ZAP #34's quoted rant likewise remains separate, and #53's export duplication is not
  classified as rhetorical repetition. Manual stance reversal, formalization and insult
  removal checks preserve support judgments; these are qualitative audits, not automated
  model evaluations. In particular, anger, informal wording and disclosed grant interests
  did not substitute for evaluating the argument.
- Fidelity review preserved the employment chain and over-$30M allegation in 58515/22,
  corrected added implications or softened assertions in 58571/2, /9 and /21, and restored
  58515/121's universal statement about sex work as an attributed belief. Legal claims in
  58611/24 remain the organization's report of counsel's conditional advice. The 58611/14
  arithmetic note identifies a narrow discrepancy without dismissing its price-sensitivity
  argument. Missing images and external documents remain disclosed limitations. No external
  factual verification was performed. No user annotations or external handoff paths were
  copied into accepted records.
- **F-42** — `scripts/check.sh` passes: all eleven Node test files, clippy, nineteen Rust
  tests and a complete accepted-result rebuild. New tests cover schema rejection, independent
  0–3/null thresholds, material peaks, contribution kinds, coverage retention, original-only
  evidence, claim audits, disclosure structure, collapse, grey content, diff reconstruction,
  text-only rendering, provenance and feedback-path validation. An additional nonvisual
  integration check rendered all 350 posts both collapsed and expanded through the actual
  topic renderer and reconstructed both texts for all 108 diffs (125 ms total for diffing).
  With restrained-only, well-supported, assessed-arguments-only settings, the funding-
  destination issue has 0/72 matching sources; the UI explicitly retains that issue and
  its attributed arguments. This demonstrates a real coverage loss the controls must expose.
- The bounded browser check failed again: binding `127.0.0.1:8017` returned `Operation not
  permitted`, and Firefox did not start its automation endpoint. No new screenshots were
  obtained or visually inspected; no server was left running. Desktop/mobile verification
  remains pending in an environment permitting local listeners and Firefox. The test script
  includes default-collapse screenshots, keyboard disclosures, citations, filters, export,
  diff and mobile overflow checks. User verification remains pending for the full experience.
- The feedback launch/report path now uses the rendition-corpus hash. The original one-
  response `work/feedback.json` is unchanged and remains available for explicit historical
  reporting. Decision-only commits D-62 and D-63 were inspected for security issues; none
  were found. Code and data security review follows the implementation commit.
- **D-64 — Make selected-post AI export discoverable and destination-specific (2026-11-01).**
  User reports that copying posts and the prompt template is obscure, including whether
  the prompt is for NotebookLM or a chat AI. Add a named, visible entry point with selection
  instructions and two explicitly labelled workflows. Chat AI copies the entire prompt
  plus original posts, or downloads that same single Markdown file. NotebookLM downloads
  the same file as a source, then copies the summary request into its chat; uploading a
  source alone does not run the request. Preserve the single-file requirement, cross-thread
  selection, original-author disclosure and secondary links-only export. Include clipboard
  failure recovery, exact-content/event tests, gate and bounded browser verification.
  Google source/chat workflow checked against https://support.google.com/gemininotebook/answer/16179559.
- **F-43 — Export destination UX implemented; visual verification still blocked (2026-11-01).**
  The named entry point now explains selecting posts before revealing chat AI and
  NotebookLM cards. Chat copying includes the entire prompt and original posts; both
  downloads produce the identical single Markdown file. NotebookLM's separate copy action
  puts the shared summary request in its chat after source upload. Links-only copying is
  under a secondary disclosure. Clipboard denial retains selectable text and instructions;
  failed/empty templates and selections changed during loading are reported explicitly.
  Six new DOM/event tests cover discovery, selection, exact copy/download contents,
  URL cleanup, clipboard recovery and template/selection failures. The full gate passed
  (12 Node test files, 19 Rust tests, clippy and data rebuild). Browser scenarios were
  updated, but the bounded run failed before rendering: binding 127.0.0.1:8017 returned
  Operation not permitted, and Firefox's automation endpoint did not start. No screenshot
  was obtained; visual and user verification remain pending. No backend change is needed,
  so an existing server only needs a page refresh. D-64's decision commit was inspected
  for security issues; none found. Implementation security review follows its commit.

- **D-65 — Execute batches 001 and 002 autonomously (2026-11-01).** The user explicitly
  asks implementation of both numbered briefs, choosing unresolved details without waiting
  and keeping a reviewable rationale ledger. This supersedes their clarification/approval
  pauses and the local guideline to wait for design corrections. Preserve existing work.
  Use one SQLite-backed Rust application on durable local storage, no deployment or hosting
  purchase. Use maintained WebAuthn, SQLite, hashing and secure-RNG dependencies as necessary;
  this is authorized by the requested passkey/database implementation. No bespoke crypto.
  Keep unauthenticated legacy feedback historical, never adopt it by browser reader id.
- **D-66 — Concrete personal-state defaults (2026-11-01).** New authenticated feedback uses
  a separately versioned signed -10…10 scale: worse/narrower, no effect, better/new angles.
  Existing 0…10 records retain their old meaning and are not converted. Companion emotional
  state and light-bulb progress independently use the mean of each account's latest answered
  rendition per post/dimension, bounded by the scale. Clearing removes that contribution;
  appearance changes, time away, playback and exports confer no points or penalties.
  Offer ten fixed lightweight illustrated appearances. Use ten independent recovery codes,
  revoke old credentials/sessions on completed recovery, preserve other unused codes.
  A visit starts after 30 minutes of inactivity; store a stable previous cutoff per device
  visit while coordinating tabs with a shared local device identifier. Site-wide account
  visit history is separate from login and explicit read choices. Calendar age filters use
  calendar-month subtraction with end-of-month clamping; years mean twelve months.
- **D-67 — Content and playback boundaries (2026-11-01).** Crawl only the six configured
  ZCG threads, no schedule or forum-wide discovery. Reconcile complete post-id membership
  and existing posts to catch edits/hiding/deletion. Preserve immutable candidates and make
  publication explicit; visibility restrictions apply immediately even if AI work fails.
  Keep operator runner workspaces separate from private application data and record model,
  runtime, exact job hashes and measured/unavailable usage. Shared selection snapshots are
  ordered by source thread/post order and no longer cancel when selection later changes.
  Browser speech reads existing overview/post text with local-voice preference, explicit
  version choice, bounded utterance chunks, local resume without autoplay and visible errors.
  No paid speech provider, automatic AI transmission or promised background playback.
- **F-44 — Shared selection and browser listening implementation.** Exactly three primary
  selection actions now use one set; scoped bulk selection uses all available source posts.
  Export coverage is computed from membership. Ask your AI and NotebookLM reuse exact source
  blocks with distinct wrappers; podcast customization is separate. Actions capture selection
  when started. Listening has overview/post/selection entry points, ordered immutable queues,
  original/rendition labels, quotation boundaries, local-voice preference, speed/transport
  controls and snapshot-bound local resume without autoplay. Pause cancels the engine and
  replays the current <=450-character passage on resume, avoiding cross-engine stuck queues;
  this behavior is disclosed. Local speech caches contain source text and are invalidated by
  snapshot/anonymous-mode identity; they are never transmitted by zforum.
  Package retrieval for WebAuthn failed because Cargo cannot resolve crates.io; no cached
  maintained verifier exists. Continue independent functionality; authentication must remain
  fail-closed until that dependency can be built. No substitute cryptography is authorized.
  Decision commit 36122dc inspected: no security issues in its ledger-only changes.
- **D-68 — Isolate the maintained WebAuthn verifier at a narrow process boundary.** The
  application/storage tests can use cached SQLite/RNG/hash crates, while webauthn-rs cannot
  currently be downloaded. Implement a small Rust verifier executable using webauthn-rs,
  called with bounded JSON through stdin/stdout (no shell), with challenge state retained
  only on the server. The app never accepts a browser's assertion as verified without a
  successful library result. Missing/unbuildable verifier disables account enrollment and
  authentication explicitly; it does not enable a development login or trusted-reader path.
  This keeps the independently testable application runnable and avoids custom WebAuthn
  verification. The verifier build and real authenticator acceptance remain required before
  enabling accounts. Production requires explicit HTTPS origin/RP configuration. Security
  review of 996cf36 found no transmission/execution of source content; speech remains an
  explicit user action with remote-voice disclosure. Speech-engine/visual checks are pending.
- **F-45 — Account storage and UI implemented; verifier dependency remains unavailable.**
  SQLite now owns sessions, hashed independent recovery codes, current/historical rendition
  feedback, reading state, preferences, visits, appearances and immutable releases. Recovery
  completion atomically consumes one code, replaces credentials and revokes sessions. Owned
  routes derive identity only from session cookies and require Origin plus CSRF headers.
  Guest readers cannot submit counted answers. Legacy browser-id records remain historical.
  The frontend includes account/recovery controls, saved posts, manual read/unread, calendar
  month filters, ten companion options and independent progress from committed signed
  feedback. Saved filters can be explicitly imported; no old feedback is reinterpreted.
  WebAuthn is implemented through the maintained-library verifier but cannot yet be built:
  registry DNS is blocked and the crate is absent from local caches. Account UI reports
  unavailable and endpoints refuse authentication until built; there is no bypass login.
  Application gate passed: 14 Node files, 22 Rust tests, clippy and rebuild before the final
  static-path regression check. Real authenticator and visual/speech checks remain pending.
  Security inspection found and fixed a static fallback risk: only known assets are served;
  encoded/alternate data paths cannot bypass visibility checks. DB/backup files use mode 0600.
- **D-69 — Restricted operator runners and reviewable publication.** Use Linux bubblewrap
  to expose system runtime files, one public job workspace and the chosen CLI's authentication
  file only; application databases and the rest of the home/workspace are not mounted.
  Fail if isolation is unavailable. Pass arguments directly, never through a shell. Jobs run
  sequentially with explicit model, max-job and per-job timeout limits. Claude has no tools
  or MCP servers; Codex has a read-only job sandbox. Record exact requested model, reported
  runtime/model/usage when available and unavailable cost explicitly. Freeze snapshots and
  prompts for comparisons, preserve each candidate, and require an explicit publish command.
- **F-46 — Refresh/comparison pipeline and operating contract implemented.** Added the
  fixed-scope anonymous forum client, full reconciliation, incremental fetch checkpoints,
  immediate visibility restrictions, immutable completed pulls, frozen prompt/source runs,
  separate candidate artifacts, bounded isolated Codex/Claude adapters, exact validation,
  blinded review samples and explicit publication. SQLite schema 2 records successful pulls
  separately from published analysis; the UI labels pending analysis. Refreshed renditions
  retain per-post producing job/model/runtime/input provenance. README supplies commands,
  backup/restore procedure and reusable operator instructions; SPEC/HANDOFF describe limits.
  Security review of a80d3ea found no additional session/ownership bypass after the static
  allowlist fix. Database/public routes do not expose recovery codes or other users' answers.
  Runner smoke testing found an installation-relative module resolution bug; preserving the
  CLI's executable path inside the isolated filesystem fixed it. Both installed CLIs report
  versions inside bubblewrap (Codex 0.162.1, Claude Code 2.1.316), without provider requests.
  Async bounded subprocess pipes avoid this environment's synchronous capture restriction.
  New failure tests cover interrupted pulls, restrictions before failure, 429 delays,
  candidate resume and tampering, identical-input comparisons, subprocess timeout/output
  bounds and publication/freshness separation. Full gate passes: 15 Node files, 24 Rust tests,
  clippy and deterministic rebuild. Release binary also built. Live fetch verification failed
  on forum DNS (EAI_AGAIN), wrote a failed/unpublished report and did not advance freshness.
  Browser retry failed at local socket binding (EPERM) and Firefox automation startup. The
  WebAuthn verifier remains unbuilt because its crate is absent from the cache and registry
  DNS is blocked. Real passkeys, provider model output, device speech, visual layout and
  NotebookLM import remain unverified. No live publication or paid model run was performed.
- **D-70 — Oversized export handling.** Keep the requested one-file export as the default.
  Above a 2 MiB soft threshold, offer explicitly numbered files split only between posts,
  repeating the prompt/source wrapper and stating both full-selection and per-part coverage.
  Do not truncate or split original post text. A single post exceeding the threshold stays
  intact with a visible size notice. Present individual download controls rather than trigger
  multiple downloads that browsers may silently block. Open NotebookLM's instructions after
  its export action so the podcast-instructions control is discoverable in that flow.
- **F-47 — Preserve initial-artifact provenance too.** Initial archived accepted analyses
  now carry per-post job/model/backend, prompt/view hashes and the exact artifact fingerprint,
  rather than only a release-wide model list. Their unrecorded runtime/full-context hash stay
  explicitly null. Refreshed jobs retain measured runtime/context hashes. Regression checks
  verify both paths and the full gate remains green. Post-commit security review of 0a63f4b
  found no additional injection, traversal or private-data exposure issue: subprocesses use
  direct argv, model workspaces exclude account data, and publication is separate and explicit.
- **F-48 — Finish large-export and NotebookLM flows.** Normal selections still download
  one combined file. Larger selections offer individually downloadable numbered parts with
  complete original posts, repeated prompts/source wrappers, total and per-part coverage,
  byte sizes and visible notices for oversized intact posts. NotebookLM export opens the
  instructions disclosure, exposing Copy podcast instructions in the flow. Large source
  fences no longer rely on spreading arbitrarily many runs into a function call. Tests check
  exact source retention, ordering, multibyte sizes, captured selection data and the opened
  NotebookLM instructions. Full application gate passed (15 Node files, 24 Rust tests,
  clippy/build); the added initial-provenance regression passed separately afterward.
  Post-commit review of 7003351 found no additional security issue: public analysis metadata
  remains data, and artifact fingerprints add no execution or private-account access path.
- **D-71 — Approved defaults and Zamagotchi name.** The user approved signed feedback,
  the independent latest-answer companion formula, the 30-minute visit boundary and ten
  single-use recovery codes. Name the feature **Zamagotchi** in visible/accessibility copy.
  This approves product choices, not the still-pending live authentication/browser checks.
- **F-49 — Zamagotchi naming applied.** Updated visible labels, accessibility descriptions,
  feedback explanations and current docs. Full gate passes (15 Node files, 24 Rust tests,
  clippy/rebuild). Decision commit f4651c1 is documentation-only; review found no security issue.
- **F-50 — Passkey build blocker cleared.** The user's dependency download succeeded.
  Boxed the large passkey enum field without changing JSON or verification behavior; Clippy
  and the release build now pass. Committed the generated dependency lock and use `--locked`.
  Smoke checks confirm discoverable registration, required user verification, sign-in
  challenge creation and malformed-input rejection. Full application gate passes; the helper
  currently has no unit tests. Real browser registration/sign-in/recovery remain unverified.
- **D-72 — Make the passkey origin explicit.** The reported signup 403 can be caused by
  the startup link advertising 127.0.0.1 while authentication requires localhost. Print the
  configured origin, expose it to the account UI, and offer its link before signup when the
  page address differs. Keep exact-origin and CSRF enforcement; distinguish their errors.
- **F-51 — Diagnose signup address mismatch.** The user confirmed browsing at 127.0.0.1.
  Startup now prints the configured account origin, and the account panel links there instead
  of offering signup on a mismatched address. Origin and missing-header errors are distinct;
  neither protection is relaxed. Regression checks cover wrong-host rejection, matching-host
  passage, unsafe-link rejection and the corrective UI. Full application gate passes.
  Review of decision commit 3e78f77 found no security issue in its documentation-only change.
- **D-73 — Repair speech continuity before changing providers.** The user reports Firefox
  speech that stutters and sounds synthetic. Prefer sentence boundaries within the existing
  passage limit, remove redundant cancellation, and defer replacement speech until cancellation
  callbacks settle. Report unavailable chosen voices instead of silently switching them. Keep
  browser speech and local-voice preference; these fixes do not promise a natural voice engine.
- **F-52 — Repair speech phrasing and restart sequencing.** Passages preserve whole
  sentences within the existing size cap. Each restart cancels once, waits for the engine
  to become idle (bounded to one second), and ignores stale completion/error events. Missing
  selected voices stop visibly; Automatic names its choice. Tests cover sentence retention,
  asynchronous cancellation, voice changes, stale events and timeout/pause behavior. Full
  gate passes; final loop cleanup also passes speech tests. Actual Firefox audio remains
  unverified, and synthetic voice quality is not claimed fixed. Decision commit bee3d78
  reviewed without security findings; it changes documentation only.
- **F-53 — Speech review follow-up.** Resolve unavailable voices before assigning the browser
  utterance property. Speech tests pass with a strict voice-property test double. Review of
  5c65426 found no new data-transmission or DOM-execution path; cancellation tokens still
  suppress stale playback after pause, source replacement or visibility restrictions.
- **D-74 — Execute the bounded production-style update test.** The user approved the
  proposed three-thread test: bug bounties (57058), Zebra disclosure grant (58723), and
  Konclave (57218). Discover threads active in a rolling seven-day window, but fetch full
  histories only for this explicit allowlist. Keep ZCG as its own independently published
  topic, with accounts and stable post keys preserved. Add per-topic publication and
  catalog navigation, topic-aware prompts, and validated cross-run artifact reuse. Preserve
  historical prompt bytes for the accepted ZCG artifacts; live prompts must not manufacture
  debate or a fixed number of questions for short threads. Reuse requires identical actual
  source/context, prompt, model and job inputs, not merely unchanged target post text.
  Exercise discovery, initial import, unchanged repeat, new replies/threads, edits, removal,
  interrupted fetch/analysis and rollback in isolated test storage. A replay omitting recent
  posts is a simulation, not a reconstructed historical snapshot. Use bounded sequential
  Codex CLI jobs with an explicit model for the live run, and publish validated results only
  after inspecting them. Do not schedule background work or crawl the entire forum.
  Direct forum fetch currently fails with EAI_AGAIN; report live execution separately from
  fixture verification. No source text scraped from rendered pages will masquerade as a
  complete API snapshot. Keep runnable commands for the operator if networking stays blocked.
- **D-75 — Live runner model and certificate correction.** After the user restarted with
  network access, discovery and all three full imports succeeded. The isolated runner's
  certificate bundle symlink points into `/etc/ca-certificates`; mount that public trust
  store read-only and disable Codex apps/plugins as well as shell/web tools. The account
  rejects the historical provenance label `gpt-6` as a CLI model id. Use the installed
  account catalog's explicit `gpt-6.1-sol` model for these new artifacts, preserving the
  failed candidate and reporting the actual model. This is a bounded operator analysis
  run, not a regeneration or relabelling of historical ZCG results.
- **D-76 — Bound live analysis output and preserve failed attempts.** The first live
  34-post marks batch failed strict validation (invalid claim categories and incomplete
  rendition claim audits); it was not published. Limit live marks jobs to eight target
  posts while retaining the whole thread as context. Allow at most three model attempts
  per job, counting every attempt against the invocation job limit. Give validation
  errors and the rejected output back to the model for correction, never repair ratings
  heuristically. Save failed outputs, actual request hashes and attempt usage. Keep the
  successful summary reusable. Review of the D-75 documentation commit found no secrets
  or executable changes. The live-source replay detected all twelve recent posts,
  including the new Zebra thread, and exercised edits, hiding, deletion and interruption.
- **F-54 — Multi-topic update implementation and fixture verification.** Added rolling
  discovery with an explicit import allowlist, per-topic SQLite releases/catalog/navigation,
  preserved personal state, short-thread summaries, topic-derived question references,
  exact cross-run analysis reuse and bounded validation retries with recorded attempts.
  The application gate passes 98 Node tests in 17 files, 26 Rust tests, clippy and rebuild;
  focused tests also pass after source-scope validation. Live discovery/import and the
  source replay passed. Live analysis and publication are still in progress, not complete.
  Firefox renders screenshots; its BiDi native-key activation fails even for a plain
  details/summary probe. Keep that check failing and report it separately from the new
  catalog pointer/navigation/mobile checks. The D-76 decision commit is documentation-only
  and its security review found no issue. No user files or private DBs are staged.
- **F-55 — Live repeat and pre-publication checks.** A second live discovery found 123
  active threads; the three allowlisted full histories remain unchanged at 69 posts.
  The validated bug-bounty and Zebra candidates reuse all eight artifacts across runs
  with zero new model calls. Their summaries and selected rendition/claim details were
  inspected against source; Zebra has one question and does not invent opposing replies.
  Konclave's summary preserves later corrections and open security/recovery limits; its
  per-post analysis is still running. A consistent schema-2 development DB backup passed
  integrity checking at `work/backups/zforum-before-multitopic-20261101T221453Z.sqlite`;
  private table fingerprints are saved alongside it for the publication comparison.
  Review of implementation commit 6a8ad62 found no additional injection, traversal or
  private-account exposure issue. An independent Firefox BiDi probe on a plain data-URL
  details/summary delivered trusted Enter events but no activation, confirming the browser
  test limitation outside app code. No production publication or user verification is claimed.
- **F-56 — All three candidates reviewed and repeat verified.** The three `sol-small`
  candidates contain 34 bug-bounty posts, one Zebra disclosure and 34 Konclave posts, with
  four, one and five question cards respectively. All 14 artifacts validate; the second
  live snapshot reused all 14 with zero model calls and no source changes. Two small-batch
  attempts failed complete claim-audit coverage and passed after model correction; rejected
  outputs and metrics remain recorded. Early setup failures and the rejected 34-post trial
  predate complete attempt capture, so their usage cannot be reconstructed; dollar costs
  remain unavailable. Source-grounded assistant review is recorded in the run's
  `review-report.json`, not represented as human or independent technical verification.
  A private copy of the real schema-2 backup passed upgrade, independent publication,
  rollback and restriction checks while preserving all personal tables and the ZCG release;
  `migration-report.json` records the rehearsal and its temporary copy was removed.
  The catalog Firefox suite passes all four routes, collapsed defaults, question counts,
  citations, deep links and mobile width without console errors. Desktop/mobile screenshots
  were inspected. Fixed singular topic/thread labels exposed by the one-post topic; the
  browser check verifies the count and new-post badge separately. The full gate still passes
  98 Node tests, 26 Rust tests, clippy and deterministic rebuild. Native keyboard activation
  remains unverified under this Firefox automation environment. Review of documentation
  commit 8d0ab7f found no secrets or executable change. Publication is the remaining step.
- **F-57 — Publish the bounded import and restart development.** Published the reviewed
  unchanged-repeat candidates for all three topics to the existing `work/zforum.sqlite`,
  after another consistent schema-2 backup at
  `work/backups/zforum-prepublish-20261101T231748Z.sqlite`. All eleven personal-table
  fingerprints match their immediate pre-publication values, the original ZCG release is
  unchanged, SQLite integrity passes, and the catalog contains 423 posts (419 visible)
  across four topics. The original server was identified outside process isolation and
  restarted with execution approval, preserving its exact origin/RP/DB/verifier arguments.
  Live HTTP checks confirm all four catalog/direct-topic releases, no pending analysis for
  the imported topics, and available passkey verification at `http://localhost:8000/`.
  The development server is intentionally left running. Reports record the reviewed inputs,
  published releases, preserved state and live endpoints; private audit files stay outside
  the served tree. Review of 1f34173 found no security issue: count formatting remains text
  and introduces no input execution path. The native keyboard automation limitation remains;
  actual human review and next-day update verification are not claimed. No scheduler or
  full-forum crawl was started.
- **D-77 — Default to one forum thread per topic; merges are manual.** The user chose
  a 1:1 default between imported forum threads and zforum topics, with the maintainers
  deciding when to merge threads. Automatic semantic grouping is not a production
  requirement. Activity-based suggestions may surface topics but must not change their
  membership. Preserve explicit groupings during updates and retain the existing six-thread
  ZCG grouping; this decision does not request splitting it or merging any other topics.
  Membership is currently configured in code. A dedicated merge operation for already
  published topics is still unimplemented. Record the policy in SPEC and HANDOFF without
  changing published content or expanding the test import scope. Review of the preceding
  documentation-only commit f9a50c2 found no security issue or exposed private values.

## 2026-11-01 — Batch 003 reading experience

- **D-78** — The user authorized implementation of the complete review discussion and
  final refinements. The concrete contract is
  `agent-prompts/003-reading-experience-and-simple-feedback.md`. Header navigation and
  information pages replace account panels in the reading column; controls use exact
  multiple-choice bands, compact exclusions, combined/newest-first reading, local dates,
  concise explanations and unified selection export. Public stats remain deferred.
- **D-79** — Replace signed sliders with new ternary Heart/Head feedback and add separate
  per-post mood reactions. Preserve historical signed feedback without conversion. Latest
  mood/Heart per post supplies one emotional contribution; latest Head per post supplies
  perspective state. Clear removes the channel contribution. New nonzero committed
  answers visibly animate the Zamagotchi; no repeated-click rewards or absence decay.
  New settings have explicit migration; removed filters never remain invisibly active.
- **D-80 — Restart development for user review.** The user explicitly asked to restart
  the server now that implementation is in place, while final verification continues.
  Back up the existing private SQLite database before schema-4 migration, preserve all
  existing server origin/RP/verifier/database arguments, and restart only the identified
  development process. Verify the four published topics and personal-table preservation.
  This is a local development restart, not public deployment. At this point 103 Node
  tests, 30 Rust tests and clippy pass; Chrome has exercised the full feature flow and
  desktop/mobile layouts, with the native keyboard check still being finalized.
- **F-58 — Batch 003 implementation and verification.** Implemented the full scoped
  prompt: navigation/info pages, reading controls/ordering, compact exclusions, post
  controls, simple feedback and expressive pets, plus a unified selected-post export.
  Fixed rapid Heart/Head edits by merging each patch inside the serialized send; export
  captures the data/selection before awaiting its prompt. Current tests pass: 103 Node,
  30 Rust, clippy, deterministic build, and Chrome browser coverage of all four topics.
  The browser test checks exact downloaded bytes, account reading/feedback, native Enter
  activation, focus tooltips, reduced motion, and desktop/mobile overflow. Screenshots
  were visually inspected. Firefox reported activeElement while document.hasFocus and
  :focus remained false even on a private display; Chrome/CDP supplies the verified
  browser path. No product keyboard workaround was added to hide that environment issue.
- **F-59 — Requested restart and migration audit.** Restarted only the identified local
  development process, keeping all origin/RP/verifier/site/database arguments. Preserved
  a consistent pre-migration backup at
  `work/backups/zforum-batch003-20261102T010650Z.sqlite`; audit at
  `work/backups/batch003-restart-audit.json`. All prior personal/content rows matched
  exactly, with signed feedback retained under historical names. Schema 4 and SQLite
  integrity pass. Four live topics and available passkey verification were checked at
  http://localhost:8000/. The process remains running in exec session 73351 for user review.
  Review of decision commits 92ee924 and 079bf73 found no executable change or private
  data exposure. Implementation review found parameterized SQL, authenticated/CSRF-gated
  mood writes, escaped DOM rendering and unchanged source restrictions; no security issue
  identified. Physical passkey testing and user acceptance are not claimed.

## 2026-11-01 — Batch 004 topic review

- **D-81 — Implement the topic-page feedback.** The user requested the changes captured
  in `agent-prompts/004-topic-navigation-and-filter-polish.md`: minimum-age month slider,
  stable disclosures, per-filter explanations, logout and bulk expansion, bookmark icon,
  minus/zero/plus ordering, pull-relative 1/3/7-day windows, title search, sorting and
  manually featured topics. Preferences move to v6 with explicit migration. Featured
  configuration is maintained locally (up to three ids), with ZCG selected initially and
  an optional question outstanding for the other two. Preserve accepted analysis data.
- **F-60 — Diagnose apparently ineffective filters.** All four published cards carry
  all four interest ids, so existing OR filtering matches every card. The ZCG summary's
  only two points within the previous day first appeared at 18:04 and 18:14 UTC on
  October 31; each falls in every old 6/12/24-hour window ending at 21:58 UTC. The point
  counts are not hardcoded. Highlights and new points were uncontrolled details elements
  recreated by settings renders. Use controlled disclosure state and curated primary tags.

- **F-61 — Back up the database before the next import.** At the user's request,
  created `work/backups/zforum-before-proper-import-20261102T014654432693Z.sqlite`
  using SQLite's online backup API with a read-only source connection. The schema-4
  backup is 4,935,680 bytes across 21 tables; integrity check returned `ok` and the
  foreign-key check found zero violations. SHA-256:
  `9398d820a005221aa90d080fa04075da06bf743029589fb8eea4039786cbbd62`.
  The adjacent JSON manifest records verification and table counts. Both files have
  mode 0600 and remain in ignored private storage outside the served site. No import
  or server restart was performed. Documentation review found no private records
  exposed or executable changes.
- **D-82 — Feature ZCG only for now.** The user selected ZCG only in response to the
  optional Featured Topics question. Keep the other two slots empty; the local
  maintenance command may select up to three configured topics later.
- **F-62 — Batch 004 implementation and checks.** Implemented prompt 004, including v6
  preference migration, monthly age thresholds, stable disclosures, inline filter help,
  bulk expansion, bookmark icons, minus/zero/plus ordering, pull-based windows and
  directory discovery/curation. Grouped repeated audit operations while preserving every
  distinct quotation and accepted source artifact. ZCG alone is featured. All 107 Node
  tests, 30 Rust tests, clippy and the deterministic build pass. Chrome coverage across
  all four topics includes actual hover/native Escape, focus retention, 1/3/7-day count
  variation, pagination expansion, account preference saves/logout, exact exports and
  desktop/mobile overflow. Screenshots were visually inspected. Browser checks caught a
  missing exact static route for curation (added with a restriction regression assertion)
  and a test-only scripted-click focus assumption (replaced by explicit focus and a
  stricter retained-focus assertion). Decision commits 8be3a39 and 23be572 were reviewed:
  no executable change, secrets or private records were introduced by those commits.
- **F-63 — Batch 004 development restart.** Backed up to
  `work/backups/zforum-batch004-20261102T015825Z.sqlite` before stopping only the verified
  development server. Restarted the rebuilt release binary with the same site, DB,
  origin, RP and verifier arguments; current exec session 34660 remains running at
  http://localhost:8000/. Audit `work/backups/batch004-restart-audit.json` confirms exact
  fingerprints for all 21 tables, integrity OK and zero foreign-key violations. Four
  topics, ZCG-only configuration and available passkey verification were checked live.
  Backup/audit are mode 0600. No import, AI run, public deployment or user acceptance is
  claimed. The user's untracked transcript remains untouched.

## 2026-11-02 — General MVP import

- **D-83 — Implement and run the single-command importer.** User authorized continuing
  through publication of full histories of all public threads active in the past 24
  hours, replacing test content after backup. Implement `scripts/zforum import [UTC]`,
  persistent runs/checkpoints and stable forum identities, resumable subscription-only
  Codex jobs using committed prompts, validation and automatic per-topic publication.
  Default imports overlap the last successful cutoff and reconcile tracked threads;
  earlier explicit dates extend coverage without duplicate topics/posts. One thread
  starts one topic; existing explicit membership is authoritative. Activity means the
  forum's public latest-activity listing (bumped_at), not an assertion that edits to
  untracked old threads are discoverable. Full tracked histories reconcile edits and
  restrictions. Freeze the initial 24-hour window when the importer starts. Preserve
  accounts/passkeys; clear content and content-dependent test state, and remove implicit
  ZCG fixture seeding. No one-week run or public deployment in this turn. Record timings,
  actual usage and limitations. No API-key billing or independent agent delegation.
- **F-64 — Import implementation verification.** Added general discovery, schema-5 run
  tracking/source identity, overlap-safe imports, automatic frozen Codex jobs/publication,
  subscription-only auth and backed-up content reset. All 112 Node tests, 31 Rust tests,
  clippy and deterministic build pass. Fixtures exercise failed-run resume, unchanged AI
  reuse, earlier coverage, generated overlapping registrations, manual membership, strict
  timestamp/auth checks and identity-preserving reset. Legacy browser fixtures now publish
  explicitly because normal startup must not seed ZCG. Decision commit 3bda686 reviewed:
  no executable change or secrets. Live reset/import and browser review follow.
- **D-84 — Three concurrent Codex jobs.** User explicitly approved up to three concurrent
  analysis jobs to shorten the 35-thread import. Generate each topic summary first, then
  run at most three independent post batches; preserve source order in assembled results.
  Keep complete thread context but put stable context before changing target instructions
  to allow provider prompt-cache reuse. Freeze this run's concurrency setting at three
  before any model calls. No additional independent implementation agents are needed.
- **F-65 — Reset and start initial window.** A new integrity-checked backup is
  `work/backups/zforum-before-mvp-reset-20261102.sqlite` (4,968,448 bytes). All accounts,
  credentials, sessions, recovery and visits matched after clearing content; audit at
  `work/backups/import-reset-audit.json`. Restarted the server in exec session 34610.
  Two discovery passes found 35 active threads since 2026-11-01T02:15:39Z, cutoff
  2026-11-02T02:15:39.347Z; run 998f6966-b52b-4cce-887b-448d0472e773 is fetching full
  histories. Browser regression passed four fixture topics including desktop/mobile
  layout and native keyboard. Commit 26c568b reviewed for injection, private-data access,
  credential exposure and publication boundaries: no issue identified.
- **F-66 — Unattended import progress and concurrency review.** The user approved three
  concurrent Codex jobs and asked to avoid permission prompts while asleep. Authenticated
  model execution is working inside the existing boundary. Fetch completed with 35 topics,
  2,152 regular posts (2,146 visible), 334 planned jobs and 621 seconds of recorded completed
  fetch work. At this note 24 topics are published. Rejected schema/citation/evidence/claim
  audit attempts are corrected by Codex before publication; none are bypassed. Inspected
  the live directory screenshot and sampled initial summaries against original text.
  Concurrency tests establish a three-job bound and identical serial/parallel assembly.
  Commits f302cad and 9447d49 reviewed: documentation carries no secrets; job workers retain
  isolation, drain in-flight work before failure and assemble source order deterministically.
  Updated stale startup documentation; final import validation remains pending.
- **F-67 — Longer-history checkpoint.** At roughly 210 minutes from the frozen start,
  33 of 35 topics are published (802 regular posts), including both ZCG funding debates
  and moderation feedback. 159 of 334 jobs pass; 232 attempts include validation retries.
  Adoption Pool (180 regular posts) and Cypherpunk Zero (1,170) remain. Catalog parsing,
  SQLite integrity and foreign keys pass; the first 298 published posts exactly match
  their frozen raw text, author, timestamps, replies, segmentation and visibility. Live
  credentials, sessions and ten recovery codes equal the pre-reset backup. Current account
  appearance/preferences and visit activity differ from that backup and remain untouched.
  No new permission prompt, authentication failure or validation bypass has occurred.
- **F-68 — Live failed-run recovery.** The last Adoption Pool batch returned malformed
  JSON (`expected , or }`, offset 14018), causing a safe importer exit before publication.
  Re-ran `scripts/zforum import` without a date: session 47721 resumes the same run/cutoff
  and reuses all 24 accepted jobs, fetching nothing again. Only the unfinished batch needs
  regeneration. This runner-level failure precedes recorded candidate metrics; final usage
  totals must explicitly exclude that unavailable call rather than claim complete billing
  accounting. No permission was required. Progress commit 9dc4e50 reviewed: documentation
  only, no executable changes or private records exposed.
- **D-85 — Reduce concurrent demand after capacity failures.** During the final NFT
  history, the service twice reported `Selected model is at capacity`. A same-run resume
  after the first failure made progress from two to eight accepted jobs. Reduce the
  configured concurrency from three to two, within the user's approved maximum, and resume
  the same frozen inputs/model. This tests lower concurrent demand; it does not establish
  the cause of service capacity errors. Preserve validation and all accepted work. Runner
  failures have unavailable usage and must be distinguished from recorded attempts.
- **F-69 — Resume with two workers.** Adoption Pool published after its single unfinished
  batch regenerated successfully, bringing publication to 34 topics/982 regular posts.
  NFT has eight accepted jobs. Configured two workers and resumed in session 58753 after
  all 11 focused import/refresh tests passed. Actual desktop/mobile Adoption Pool screenshots
  were inspected; source link, layout and adjacent new-post controls render correctly.
  Commits c7bfd00 and 0b6cce7 reviewed: documentation only, no private records or executable
  changes. Runtime review of the scheduling change follows; no model or input changes.
- **F-70 — NFT checkpoint and capacity observation.** Two workers completed eighteen
  additional NFT jobs before another service-capacity error, so lower concurrency did not
  eliminate it. After a brief wait, resumed again in session 82737 without changing inputs.
  NFT now has 50/150 accepted jobs; all topics together have 234/334 in 339 recorded
  attempts (105 rejected structured outputs), at about 318 minutes wall time. Three
  capacity interruptions and the earlier malformed response have unavailable runner usage.
  Commit 064a013 reviewed: only concurrency lowered; isolation/authentication/validation
  unchanged, no security issue identified. User acceptance and final import checks pending.
- **F-71 — Initial 24-hour import published and verified.** Run
  `998f6966-b52b-4cce-887b-448d0472e773` finished at 2026-11-02T09:23:39.615Z after
  7 hours 8 minutes wall time. All 35 topics/2,152 regular posts are published, including
  NFT; 2,146 are visible and six remain hidden. All 334 jobs passed in 466 recorded
  attempts, including 132 rejected structured outputs. Five service-capacity interruptions
  and one malformed response required same-run resumes; accepted work was reused.
  Recorded usage is 32,779,871 input tokens (4,218,624 cached), 2,953,042 output tokens;
  failed-runner usage is unavailable, so these are incomplete totals, not billing figures.
  The user asked whether incomplete threads could be dropped after publication had finished;
  none remained, and content was retained. No week expansion or public deployment occurred.
- **F-72 — Final audit and prompt clarification.** All 35 candidate artifacts revalidated
  against frozen inputs; every live topic endpoint matches the catalog. All 2,152 original
  posts match text, metadata, segmentation, visibility and stable identities, with no
  duplicates. Hidden source/analysis fields are null. SQLite integrity and foreign keys
  pass. Account identity, passkey and ten recovery codes are preserved; live session/visit
  changes are recorded separately. An initial audit assumed empty-string hidden text and
  unchanged sessions/visit cutoffs; inspection of the existing contract corrected those
  audit assumptions, without changing production data or weakening repository tests.
  Private `final-audit.json` records the results. Inspected final desktop/mobile catalog,
  Adoption Pool and NFT screenshots. A consistent completed-content backup is
  `work/backups/zforum-after-24h-import-20261102.sqlite`. Clarified the summary JSON key
  `interests` after completion; frozen artifacts remain unchanged and future cache keys
  reflect the prompt change. All 113 Node tests, 31 Rust tests, clippy and deterministic
  build pass. Commit c4bada2 reviewed: documentation only, no security issue identified.
  User acceptance and semantic review remain pending.

## 2026-11-02 — Explicit six-thread funding group

- **D-86 — Group the six funding threads.** User explicitly requests 58515, 58566, 58571,
  58610, 58611 and 58656 in one topic. Use `zcg` with suggested working title "The future
  of Zcash funding"; exact wording is not yet user-approved. Prompt 005 captures scope.
  The current 35-topic import contains only four of these. Fetch the two missing threads
  explicitly, reuse exact checked assessments, generate a combined summary and perform
  an atomic merge that preserves other topics, source identities and personal data.
  Preserve membership for later imports; do not restore the historical database.
- **F-73 — Explain the missing two threads.** The completed import discovered neither
  58571 nor 58610 in its November 1–2 activity window. Their latest posts in the earlier
  backup are October 31 at 18:38:36Z and 18:23:20Z respectively (21 and 24 posts). They
  were omitted from the fresh import, not hidden by UI filters. The old grouping should
  have been distinguished from the current published catalog when answering the user.
- **D-87 — Import only the two missing threads.** User clarified "just import those two
  particular ones then." Limit source fetching to 58571 and 58610; no general import or
  wider activity window. This follows the authorized six-thread grouping: retain the four
  already-published histories. The two direct pulls contain the same 45 posts as backup,
  so their assessments can be reused. Combined summary passed on one generation attempt;
  recorded usage is 111,535 input tokens (8,448 cached) and 9,590 output tokens. Publication
  and preservation checks remain pending.
- **F-74 — Group preparation and rehearsal.** Directly fetched only 58571 (21 posts) and
  58610 (24 posts). Text, author, timestamps, replies and visibility match the prior checked
  release. No post assessment was regenerated. One combined summary over 494 visible posts
  passed validation; 499 regular posts are represented including five hidden. Preserved
  original assessment question scope per thread and recorded the new summary separately.
  Mixed pull timestamps are explicit and use the earliest included pull for What's new.
  The group builder initially compared serialized segmentation objects; inspection showed
  identical structures with different property ordering after SQLite JSON serialization.
  Corrected to structural equality and added a regression test, without relaxing text checks.
- **F-75 — Atomic merge verification.** All 116 Node tests, 33 Rust tests, clippy and the
  deterministic build pass. Added refusal/rollback checks for stale releases, omitted
  threads, changed assessments, conflicting owners, bad fingerprints and active imports.
  Backed up to `work/backups/zforum-before-six-thread-group-20261102.sqlite` and rehearsed
  on a separate copy. The rehearsal has 32 topics/2,197 posts; all 31 unrelated topics,
  existing post/source/re-write identities, import identities and 17 unaffected tables
  match exactly, including all personal tables. SQLite integrity/FK checks pass. Rehearsal
  report: `work/groups/zcg-six/rehearsal-audit.json`. Actual live publication pending.
  Decision commits 314e205 and 5cfc372 reviewed: documentation only, no executable changes
  or private account records included.
- **F-76 — Live six-thread grouping published.** Applied the rehearsed merge under the
  import lock. Release `6d2b25859d541f19e3ed52637202a217f738ce5a3fe7b34fcdfe1e587dd66f44`:
  six threads/499 posts (494 visible), with exactly 45 additional posts overall. Catalog
  now has 32 topics/2,197 posts; all 31 unrelated topics and existing post/import identities
  remain exact. Initial live audit matched 17 unaffected tables, including personal data.
  Live Chrome verified both imported originals, all six source links, old deep links,
  Featured Topics and desktop/mobile layouts; screenshots inspected. No server restart.
- **F-77 — Preserve checkpoint serialization.** Post-publication source-hash verification
  identified that Rust serialization reordered checkpoint object keys. Store exact checked
  source JSON alongside parsed validation, with equality enforced before any write. Added
  byte-preservation and mismatched-serialization regression tests. Rehearsed and reapplied
  the same release with corrected checkpoint storage; public release/content did not change.
  Stored source hash now matches. A repeat audit observed only accounts.last_visit and
  visits.active advancing while the site was in use; verified monotonic updates and exact
  equality of every other previously unchanged column, without restoring visit activity.
  Evidence: live-audit.json and checkpoint-audit.json under work/groups/zcg-six. Full gate
  passed 116 Node/33 Rust; added focused serialization test passes (34 Rust tests total).
  Review of 920e978 found parameterized transactional writes, stale-release checks, exact
  source reuse validation, escaped UI text and no new network write endpoint; no security
  issue identified. User acceptance remains pending.

## 2026-11-02 — Preserve reading context

- **D-88 — Fix filter and directory scroll restoration.** User reports losing their
  place when toggling Highlights and author identities and when returning to All
  topics. Batch 006 records the focused repair: preserve document and reading-panel
  scroll through redraws, remember the directory return position for in-app links
  and browser Back, retain search/sort/interests and post deep-link behavior. Verify
  in a real browser with a long directory and desktop/mobile layouts. No imports,
  account changes or ratings redesign. The ratings follow-up was answered by locating
  the existing toggle and explaining the current signed-in requirement.
- **F-78 — Measured and fixed both context losses.** Live Chrome measured a Highlights
  toggle resetting internal panel scroll from 655 to 0 while window scroll stayed at
  522, moving the input from viewport y=614.390625 to 1269.390625. All topics reset
  the 32-topic directory from scroll y=4142 to 0. After the central render fix both
  preserve the exact original offsets. Hash navigation explicitly owns browser scroll;
  directory card IDs allow focus restoration without scrolling. State is memory-only.
- **F-79 — Verification.** Both single-topic and four-topic bounded Chrome suites pass
  with added desktop/mobile checks for real clicks on all five toggles in both
  directions, exact scroll/control/focus preservation, and repeated All topics/header/
  browser Back returns. Existing account-save redraws and post deep links also pass.
  Screenshots inspected. Full gate: 116 Node tests, 34 Rust tests, clippy, deterministic
  data build. No server restart or database mutation needed. Decision commit dfc0b43
  reviewed: documentation only, no security issue. User acceptance remains pending.


## 2026-11-02 — Continue development in the Linux checkout

- **D-89 — Restore the transfer and select Fly.io.** The user asks to inspect the
  repository and ZIP handoff, extract the transfer, and continue development in
  `/home/zenzcash/zforum`, with future deployment to Fly.io from this environment.
  This supersedes the earlier hosting-not-selected status. Inspect and verify the
  archive before restoring its missing private work data and generated site data;
  preserve existing source and never overwrite an existing database. Keep transfer
  payloads outside version control. Deployment implementation and public launch
  follow the local restoration; no new forum import is requested.
- **F-80 — Transfer restored and checked.** All 260 existing source files matched
  the ZIP. Extracted 1,806 files privately under `work/transfer-20261102/zforum`;
  all 1,804 manifest-listed payloads passed size/SHA-256 checks (the manifest and
  transfer note are not listed). Copied missing work and generated site data into
  this checkout without overwrites. Read-only SQLite checks report integrity OK,
  zero foreign-key violations, 32 import topics, 2,197 imported/current posts,
  one account and one completed import. Database bytes still match the archive,
  mode 0600. No forum requests, model calls or server startup occurred.
- **F-81 — Local runtime and deployment gaps.** Node, Cargo and Fly CLI are not on
  this shell's PATH; no application gate was run. Chrome is present. The server
  binds IPv4 localhost explicitly; deployment packaging, externally reachable
  binding, durable database storage and production origin/RP configuration remain
  future work. The transfer note supersedes old running-server claims. Added a
  ZIP ignore rule to keep private transfer data out of commits. Reviewed decision
  commit 04917f0: documentation only, no private records or security issue found.

- **D-90 — Run the restored application locally.** The user requests a running
  server for a quick check. Provision missing build/runtime tools, build the
  application and WebAuthn verifier, preserve the restored database with a backup,
  and start localhost:8000 for user review. The requested interactive server may
  remain running. No source import or public deployment is part of this step.
- **F-82 — Local server started.** User installed Node 22.22.1 and system build
  dependencies plus Rust/Cargo 1.99.1 through rustup. Built the locked application
  release and WebAuthn verifier with `CARGO_HOME=work/cargo-cache`; verifier clippy
  passed and its test target ran zero tests. Created and integrity/FK-checked
  `work/backups/before-local-start-20261102.sqlite`. Server session 42981 serves
  localhost:8000 with the restored database. HTTP checks return 200 for the home
  page and funding topic, 32 catalog topics, and auth_available=true. No import,
  AI work or public deployment occurred. Decision commit 3cbd403 reviewed:
  documentation only, no security issue identified.
- **F-83 — Missing historical rebuild fixture.** Node gate reports 19 passing test
  files and refresh.test.mjs failing. Data rebuild explicitly fails with ENOENT
  for archive/research-prototype/data/crawls/20261031T215141Z/manifest.json, absent
  from the transfer. Started the compiled server directly with intact transferred
  generated files; no test assertions or source were changed. Full gate and real
  authenticator verification remain outstanding; user review is pending.

- **D-91 — Expose a sun/moon theme button.** User requests a visible light/dark
  control, specifically icons. Add a header button for guests and signed-in readers;
  default to the system preference until an explicit choice, remember that choice
  in this browser, and expose the next action with an accessible name and tooltip.
  Switching must preserve reading position and focus. Verify both palettes,
  persistence, system changes and desktop/mobile placement. No account schema change.
- **F-84 — Header theme control.** Added a sun/moon button independent of navigation
  rendering, with native keyboard behavior, action tooltip/accessible label and
  browser-local storage. Default tracks system preference; explicit choices override
  it. Invalid stored values and unavailable storage report visible errors. Existing
  palettes now use the resolved document theme, also setting native color-scheme.
  Eight focused tests pass. Corrected a new test's ARIA expectation from empty to
  the required string true. Full Node run has 20 passing files; the existing refresh
  failures were directly confirmed to require the missing research manifest.
  Chrome assertions passed twice, including native Enter, exact body colors, reload
  persistence, focus/scroll and 390px layout; four screenshots visually inspected.
  Both runs then hit an ENOTEMPTY Chrome-profile cleanup race, so added five bounded
  cleanup retries without changing browser assertions. Decision commit c726ef8
  reviewed: documentation only, no security issue identified. User review pending.
- **F-85 — Final theme/browser verification and refresh readiness.** Browser suite
  exits 0 with bounded cleanup retries; existing reading, feedback, exports and
  keyboard regression assertions also pass. Read-only importer checks confirm the
  saved cutoff is 2026-11-02T02:15:39.347Z, ChatGPT subscription auth is present, and
  the isolated Codex version command succeeds outside the outer tool sandbox. No
  new forum pull/model call or daily automation was started. The user wants an easy
  daily trigger and a refresh before deployment; existing `scripts/zforum import`
  is the local manual trigger. Production refresh must target its authoritative DB.

- **D-92 — Review each pull before analysis and publication.** User requests fetch
  and preview, a quick scan after each pull and before each push, and a trial with
  the small Zebra disclosure example. Replace the default automatic import flow
  with explicit fetch/preview, bounded analyze, and publish stages sharing the
  existing pipeline. Fetch makes no model calls; analyze cannot publish; publish
  cannot fetch or analyze. Show source changes, job/cache readiness and prompt sizes
  before analysis, then validated candidate summaries and actual usage before push.
  Keep observed visibility restrictions immediate. Preserve frozen inputs/resume
  and advance full coverage only after complete publication. A scoped thread trial
  must not advance full-forum coverage. Use a database copy for the example, stop
  after the zero-token fetch preview for review, and do not deploy or schedule work.
- **F-86 — Staged import implemented and tested.** Default import now stops after
  fetch/preview. Explicit analyze requires a global per-invocation call allowance;
  explicit publish makes no network/model calls and checks all remaining candidates
  and release baselines before publication. Shared cache validation and prompt
  construction power both preview and execution. Preview opens the DB read-only,
  reports unknown summary-dependent cache/prompt values honestly, and writes private
  text/JSON reports with changed source links, candidate summaries/renditions and
  actual attempt usage. Scoped runs preserve full-import cutoff semantics. Frozen
  pre-fetch comparison survives a source-checkpoint interruption. Twelve import tests
  pass; Rust clippy and 34 Rust tests pass. Full Node gate has 20 passing files and
  the pre-existing refresh failure caused by missing historical fixture data.
- **F-87 — Real zero-model-call Zebra rehearsal.** Backed up live SQLite to
  `work/previews/zebra-20261102.sqlite` and fetched only thread 58723. Outer sandbox
  DNS failed first; the authorized retry resumed run
  `dd282490-7f7e-4a65-a157-7152f6acb0e4`. Result: two visible posts, one added reply,
  zero edits/unavailable posts. Summary requires a new call (17,956 input prompt
  characters); marks reuse/size awaits the summary. No model call or publication.
  Nine live content/checkpoint table hashes remained identical; trial SQLite integrity
  and foreign keys pass. Reprinting preview succeeds offline. User review pending;
  next trial step is explicit analyze with max-calls 2 and the same trial --db.
  Decision commit aadf6bb reviewed: documentation only, no security issue identified.

## 2026-11-02 — Prepare Fly.io deployment

- **D-93 — Repo-built service and durable SQLite on Fly.** User requests review of
  the staged-import work and complete deployment preparation following the hosting
  recommendation. Use one always-running Fly Machine, a 3 GB volume at /data,
  512 MB initial memory, HTTPS, health checks, consistent off-volume backups and
  14-day Fly snapshots. The app name is zencash; use the US San Jose region (sjc).
  Confirm the truncated domain answer before fixing the production origin/RP ID.
  Build binaries and browser contract from tracked source, with no database,
  private operator artifacts or credentials in the image. Bootstrap the existing
  database once; subsequent code deploys never reseed it. Preserve explicit fetch,
  review, bounded local analysis and publication: production owns import state,
  local analysis receives content artifacts only, and publication validates those
  artifacts against production's frozen run. Keep AI credentials local. Prepare
  and test deployment/backup/restore tooling without launching the public app or
  running real imports/model calls. Record missing infrastructure and the existing
  historical-fixture gate failure honestly; do not weaken that gate.
- **D-94 — Production domain.** User confirms app name zencash, US hosting and
  ownership of zenzcash.com. Use https://zenzcash.com and RP ID zenzcash.com.
  Fly's generated hostname for that app name is zencash.fly.dev, not the separately
  mentioned zenzcash.fly.dev. Production sign-in uses the custom domain. DNS and
  certificate activation remain launch prerequisites. Reviewed 262db88: docs only,
  no credentials or security issue.
- **D-95 — Seed production from the restored database.** User explicitly confirms
  that deployment must include the existing database from the handoff ZIP. Prepare
  a consistent snapshot of the current authoritative work/zforum.sqlite, not an
  empty database or a new import. Transfer its frozen import artifacts as well.
  Fresh inspection finds 32 topics, 2,197 posts and two accounts (the older handoff
  counted one). Preserve both accounts and all current personal/import state.
- **F-88 — Deployment packaging and operator checks.** Added a source-only Docker
  image (pinned Rust/Node base digests, locked Rust builds), runtime-only contract
  build, configurable bind/proxy handling, health endpoint and a UID-10001 runtime
  requiring a volume. First seeding is explicit, SHA-256 checked and exclusive;
  normal startup rejects a missing database. Added consistent pre-migration/hourly
  Tigris backups, download/restore verification and remote staged-import artifact
  transfer sharing the existing bounded analysis implementation. Production validates
  candidates against its own frozen source/model/baselines and never receives a
  replacement local database. README and SPEC §21 cover deployment and operations.
- **F-89 — Validation.** Four deployment tests, 13 import tests, Rust clippy and all
  35 Rust tests pass. Verifier clippy/build and its zero-test target pass. The new
  deployment gate exits 0, including HTTP/health, real HTTPS WebAuthn challenge,
  secure cookie, wrong-origin rejection, denied private paths and account/bookmark
  persistence across process restart. The 75 MB image builds remotely and runs the
  same smoke test inside the image. Corrected the initial ignore rules after Fly
  reported an oversized build context; canceled that build. Correct source context
  is approximately 581 KB before incremental transfers, with work/credentials excluded.
  Full Node gate: 21 passing files, one existing refresh failure; historical build
  still fails on the missing research manifest. Tests/fixtures were not weakened.
- **F-90 — Existing data staged on Fly and recovery rehearsed.** Created app zencash,
  encrypted 3 GB sjc volume vol_vp2eyql6gdqxgjj4 (zforum_data), 14-day snapshots and
  private Tigris bucket zencash-backups with staged Fly secrets. Prepared local seed
  work/backups/fly-seed-PNL4ty: schema 5, 32 topics, 2,197 posts, two accounts,
  SHA-256 63b60f9577f81c91e9b2070208def9d1d10fd13fce302949d2faf5899b13dfed.
  All 25 local tables match that seed (private table-audit.json). Uploaded/seeded it
  and restored frozen import artifacts using a temporary Machine with no public
  services. Real Tigris archive upload, download, SHA-256 verification, extraction,
  integrity/FK/count checks pass. The production supervisor's private 60-second test
  performs a startup backup, serves healthy HTTP and exits 0 on SIGINT. No real forum
  fetch, model call or publication ran. The original local server/DB remain intact.
- **F-91 — Domain preparation and launch boundary.** Allocated shared IPv4
  66.241.124.216 and IPv6 2a09:8280:1::1e1:b05a:0; requested zenzcash.com certificate.
  User is updating A/AAAA records; certificate validation was pending at first check.
  No public service has been launched. Final image is
  registry.fly.io/zencash:deployment-01M6FTY6NX3MV6Z0WQFCQVHF5Y.
  After DNS/certificate readiness, the first normal fly deploy must use --ha=false
  and the seeded volume, without reseeding or importing the local DB again.
  Reviewed decision commits 40d0e2d/b4e50fa: documentation only, no security issue.
- **F-92 — Final readiness.** Fly confirms the zenzcash.com Let's Encrypt certificate
  is issued, verified and active. Destroyed the temporary preparation Machine;
  app has no Machines and the seeded volume is retained unattached. The final pinned
  image build passes and has manifest digest
  sha256:a6534df990f9ed86f12c98be29f1a6f5da3b937c578dbbf31660f235c4096aa1.
  Public launch remains a separate user action. All local work is preserved and
  no content update was performed. Real authenticator/user acceptance is pending.
- **F-93 — Post-commit transfer review.** Review of 09615a0 found a staging-name
  collision when a valid topic's name matched another topic's archive directory.
  Separated incoming and previous candidates into distinct parent directories.
  Regression checks cover funding/funding-previous, incoming/previous and
  previous/previous-previous, including repeated acceptance; all 14 import tests
  pass. No publication or personal-state changes occur. Aligned health-check grace
  with Fly's one-minute limit after its validator reported that larger values are
  lowered automatically. Other reviewed credential, seed and proxy boundaries had
  no identified security issue.
- **F-94 — Reviewed image rebuilt.** The corrected transfer implementation is in
  registry.fly.io/zencash:deployment-01M6FVA7R9EHX1FRQ899Y8BKTC (75 MB).
  Remote build and integrated runtime smoke pass. Strict Fly configuration validation
  passes without the grace-period warning. The seeded volume, backup verification,
  active certificate and no-public-Machines status remain the launch prerequisites
  already satisfied; user launch instruction and real authenticator review remain.
- **D-96 — Launch the prepared Fly service.** User explicitly says “ok deploy it”.
  Deploy the reviewed image built from bd23762's runtime source onto the existing
  seeded volume, with one Machine in sjc and the configured zenzcash.com origin/RP.
  Reuse image manifest 143f761fe1d55439133b3dfcfded82deb71afd0735dc9f8687f59281b39b7578;
  do not reseed, import content or run AI. Verify public HTTPS/health, catalog/topic
  access, passkey configuration, durable database counts and startup backup. Record
  the production Machine and actual results; real authenticator/user review remains.
- **F-95 — Public launch verified.** Deployed the reviewed image by immutable digest
  onto the existing volume without reseeding. One production Machine e823213f175598
  runs in sjc with one passing Fly HTTP check. https://zenzcash.com serves the home
  page and health; all 32 individual topics and all catalog release identities match
  the seed. 2,197 posts remain, with all six hidden posts withholding source/analysis.
  SQLite integrity and foreign keys pass; two accounts remain. Private DB/work/contract
  paths return 404, HTTP redirects to HTTPS, and passkeys report the canonical origin.
  A real registration challenge returns RP zenzcash.com and Secure/HttpOnly cookie;
  no account enrollment, real forum import or model call ran. The startup Tigris backup
  completed 2026-11-03T04:44:42.825Z with SHA-256
  dfae9f01ad1f1a94852b7e2a564c7efb1dca2ec225327aaa0031e0911ad60c21.
  Initial health failure while the backup ran cleared after startup. Evidence is in
  ignored work/fly-launch.log and work/fly-launch-verification.json. Production is
  authoritative from this launch. Physical authenticator and user acceptance pending.
  Reviewed d5c9d53: documentation only, no security issue identified.
- **D-97 — Visible highlights, explicit hidden-age inclusion and explained sign-in.**
  User requests three reading fixes: keep the section containing Highlight new points
  expanded; exclude hidden/unknown profile ages unless a new inclusion checkbox is
  checked, including at minimum age zero; explain why guest actions open sign-in.
  Remove the highlights subsection disclosure, add an unchecked includeHiddenAge
  preference (version 7, migrating prior saved choices with this new option false),
  and explain account requirements beside guest actions and on arrival at sign-in.
  Preserve reading position and existing personal data. Test logic, preference saves
  and guest/browser behavior. Prepare the changes locally for review; this request
  does not explicitly request another production deployment.
- **F-96 — Reading changes implemented and verified locally.** Highlights are now
  a fieldset with no subsection disclosure. Added includeHiddenAge=false, strict
  preference version 7 and migration of supported saved browser/account preferences.
  Hidden/unavailable ages fail the filter even at zero months unless explicitly
  included. Guest actions have account-requirement explanations, action-specific
  sign-in context and a reading return link, including pet selection. No account
  records, content, import or production data were changed.
  All 23 logic, seven rendering and six account tests pass; Rust clippy and all
  35 Rust tests pass. Full Node run remains 21 passing files and the known historical
  refresh-fixture failure. Chrome passes the complete bounded suite with desktop/
  mobile screenshots inspected, guest bookmark/pet sign-in explanations and return,
  hidden-age checkbox, version-7 account saving and exact checkbox scroll/focus checks.
  Browser diagnosis exposed a tooltip hover shifting/covering controls; sidebar
  explanations now overlay without consuming pointer events. Also fixed test-process
  group cleanup and asynchronous profile removal so failures are reported reliably.
  Local server restarted on localhost:8000 after backup
  work/backups/before-reading-v7.sqlite. Screenshots/logs use reading-* in work/.
  Production remains on the previous deployment; user review is pending.
- **D-98 — Deploy the reading fixes.** User requests “deploy now pls”. Deploy
  tested runtime source from 690e4d6 using the existing single-Machine Fly workflow.
  Preserve the authoritative mounted database; deploy frontend and server together
  for version-7 preferences. Verify live health, served changes and database/backup
  status. No content import, model call or database replacement is authorized.
- **F-97 — Reading fixes deployed and checked publicly.** scripts/fly-deploy built
  and deployed registry.fly.io/zencash:deployment-01M6FWWVEA327JE69QM1YYZXEF,
  manifest 7b6d4c031e0be50da1a486f8e9b6ea8559a275a089651923180251773e6ec8e3.
  Image runtime smoke passed; existing Machine e823213f175598 is healthy. Live Chrome
  verifies the expanded highlight fieldset, hidden-age exclusion by default and
  inclusion on request (tested topic 1,046 known-age / 1,170 visible posts), guest
  bookmark sign-in explanation and Back to reading. Screenshot visually inspected.
  SQLite integrity/FKs pass; 32 topics, 2,197 posts and two accounts preserved.
  Startup Tigris backup completed 2026-11-03T05:10:17.022Z with SHA-256
  654181aa4e8a9064999aa17c28a4b2e58644ecf7b866f497b84209ce3ff0023e.
  Evidence: ignored work/fly-reading-deploy.log, work/reading-live-browser.log and
  work/reading-live-verification.json. No import or model call ran. User acceptance
  remains pending. Reviewed 2b873c0: documentation only, no security issue identified.
- **D-99 — Full-context import summaries and reusable reply analyses.** User agrees
  to one full-discussion summary pass per imported topic on each explicit import
  (for example, daily), with a single analysis of each reply reused on later imports.
  Do not use a per-reply rolling summary update. The present whole-topic cache key
  invalidates reply jobs whenever the topic changes; unchanged topics can reuse jobs.
  Implementation should separate summary generation/question tagging from durable
  reply analysis. Preserve accepted existing analyses as the starting point. Treat
  edited source text as a distinct revision rather than silently applying an old
  rendition to changed text; retention/revision details remain to be implemented.
  This turn records the agreed direction and explains current behavior; it does not
  import content, call a model or change the production pipeline.
- **D-100 — Build and run the optimized import.** User authorizes implementing and
  testing the agreed importer, then carrying out the actual update from production's
  last completed cutoff and preparing the code and validated content for Fly.
  Generate a fresh full-context topic summary for each new import; freeze/reuse it
  within that run for retries. Preserve existing accepted per-reply analyses and
  provenance, analyze new replies once, and reanalyze edited replies using their new
  text. Summary question changes must not invalidate expensive reply analyses.
  Keep SQLite schema 5, retain the current publication/account/version safeguards,
  and use consistent production backup as the authoritative baseline. Rehearse in a
  separate private database; do not overwrite production or publish new content
  during preparation. Review fetch and candidate previews as part of the authorized
  run, with measured usage and bounded attempts; no additional per-stage user
  confirmation is needed for this import. Report any provider capacity obstruction.
- **F-98 — Optimized importer implemented and rehearsed.** Added reply-reuse-v1:
  import-specific full-context summaries, preserved accepted reply analyses/provenance,
  content/parent-based edit detection, bounded new-reply context independent of summary
  questions, exact reuse validation and retained-context visibility handling. Default
  config enables it; frozen legacy comparison runs keep their recorded policy. No DDL.
  Fifteen import tests pass, including append/edit/unchanged/model-change, metadata-only
  changes, repeated transfers, 20 generated append scenarios, unavailable context and
  tampering. Baseline rehearsal recognizes all 2,191 visible production replies as
  reusable with zero model calls. Full Node run: 138 pass / two failures in the same
  missing historical refresh fixture. Affected test parser now identifies the actual
  job JSON rather than previous-summary/retry-output JSON. Assertions remain intact.
  Downloaded consistent production baseline work/optimized-baseline.sqlite: schema 5,
  32 topics, 2,197 posts, two accounts, no active import; cutoff
  2026-11-02T02:15:39.347Z. Separate work/optimized-import.sqlite is the rehearsal DB.
- **F-99 — Prepared-content staging implemented.** Added validated prepared bundles
  for the authorized backup-based import. Staging compares production cutoff, public
  analysis/source baselines and topic membership before creating a production run,
  reconstructs source checkpoints offline and accepts candidates without publication.
  Accounts/personal state are never included. Same-run retries verify frozen identity;
  stale cutoff, corrupt candidates and conflicting active runs are rejected. Sixteen
  focused import tests pass, including no model/network calls, personal-state retention,
  cutoff preservation, tampering and repeat staging. Deployment support requires the
  updated code before receiving a bundle; the current live database remains unchanged.
- **F-100 — Deployment gate/image ready; actual fetch underway.** Runtime source
  5f009ba passes scripts/check-deploy.sh (16 import tests, deployment tests, 35 Rust
  tests/clippy, verifier builds and runtime smoke). Full Node: 139 pass/two known
  missing historical refresh-fixture failures. Built/pushed without deploying image
  registry.fly.io/zencash:optimized-5f009ba, digest
  ba5377d9305d3a6871982ebe815cc04a8501fa5cea40870a4e1cda32a33e4105 (75 MB).
  Security review of 5f009ba found no issue in path validation, argument-array
  subprocesses, candidate checks or personal-state separation. Actual fetch run
  39574692-e798-4ae6-a679-7e72019917b5 spans 2026-11-02T02:10:39.347Z through
  2026-11-03T05:42:28.138Z. Discovery: 47 active threads, 66 registered topics.
  It runs against the private production-backup draft; no model call/publication yet.
- **F-101 — Real-source review caught serialization-order false edits.** Fetch
  completed all 66 topics/3,936 posts (3,926 visible), with six newly hidden/unavailable
  funding replies restricted immediately on production. Before any model call,
  comparison showed unchanged quoted replies treated as edited because Rust release
  JSON orders quote-source object keys differently from Node snapshots. Replaced
  string-hash comparison with structural equality of content/parent fields, preserving
  semantic edit detection while ignoring object key order. Added 100 generated
  recursive-order permutations with substantive-edit sensitivity and planner coverage.
  No frozen source or model output was rewritten; the full plan is regenerated before
  analysis. The previously built image must be rebuilt with this correction.
- **F-102 — Corrected full import reviewed; model work started.** Full plan retains
  2,183 existing replies, analyzes 1,741 new replies and two edits, and generates 66
  fresh topic summaries: 318 initial model jobs. Planned source characters fall from
  100,732,506 (legacy) to 5,548,893 (94% reduction; actual tokens remain to measure).
  All 11 audited personal tables match the baseline; integrity/FKs pass. Seventeen
  importer tests and deployment gate pass. Full Node: 140 pass/two known historical
  fixture failures. Model analysis uses a 500-call allowance/two workers in session
  51351, work/optimized-analysis.log; first summaries validate and retain original
  replies, with no rejections observed at this point. Reviewed aa6ee03 for security:
  structural comparison only, no new trust/process/filesystem boundary. Rebuilt/pushed
  image registry.fly.io/zencash:optimized-463-ready from aa6ee03 without deployment,
  digest fe220587ce5f04b5d8733592789d905166fb5c9907a7020a52894a38ec62f83b.
  Mirrored immediate visibility restrictions: 58656/99, /179, /182, /74, /112, /132;
  existing production policy withholds zcg until a revised release is published.
- **F-103 — Analysis progressing; preservation audit expanded.** At the checkpoint,
  28 topics validate, with 49 recorded calls (46 accepted outputs/three rejected
  attempts corrected by bounded retries), 673,294 input tokens including 409,728
  cached, and 102,759 output tokens. No provider interruption observed. Extended the
  real-data audit to all 14 non-content/import tables, including moods and legacy
  feedback: all match the baseline, integrity/FKs pass. Existing 32 topics contain
  83 new replies/two edits; 34 first-import topics add 1,658 replies. Their first
  analyses account for most remaining work. Prepared ignored rehearsal/history audit
  scripts to prove offline staging, personal-state and historical-version preservation
  against a disposable production copy; these have not yet run on the final bundle.
- **F-104 — First runner timeout; frozen run resumed.** marks-58764-1-4 returned no
  output within its existing 900-second bound and the runner stopped at
  2026-11-03T06:51:38Z with `process exceeded 900 seconds`. No provider explanation or
  token usage was available, so neither a capacity diagnosis nor zero usage is claimed.
  Resumed the same authorized frozen run with a 500-call allowance in session 86135;
  its accepted summary and all completed reply analyses are reused. Known attempt
  usage and the unreported timed-out call are counted separately in the audit. No
  production publication. Reviewed 079726b: documentation only, no security issue.
- **D-101 — Restore featured-topic availability after immediate restrictions.** User
  reports the featured topic offline during preparation. Immediate restrictions on
  six newly hidden replies triggered the existing whole-topic withholding policy.
  Restore the previously published discussion promptly with those replies hidden,
  one checked summary over the remaining previously published source, and preserved
  reply analyses/provenance. Rehearse on a private copy and publish only this privacy
  repair; newly fetched replies remain unpublished. This repairs the preparatory
  outage, not a deployment of the unfinished import. Rebase only the unstarted zcg
  candidate's frozen public baseline/summary to the repaired release under the import
  lock, preserving its fetched source, window and all completed work in other topics.
  Record the amended hashes and proof that no zcg model job preceded the amendment.
- **F-105 — Featured privacy repair tested; Fly app access obstructed.** Prepared
  work/privacy-repairs/featured-MdiW12/candidate/site.json: original 499-post discussion,
  six newly restricted posts hidden, 488 unchanged visible assessments retained, one
  full-context checked summary. Rehearsals preserve 19 protected tables/import state/
  cutoff, integrity/FKs and 32 topics/2,197 posts/two accounts. Guarded operator checks
  expected release and candidate checksum, excludes new/edited source outside the six
  restrictions, creates a backup and calls the existing publisher. Repaired release:
  335f1e45a23ecd3ac60a966f46d7feddd8bdcda5099c807afdbfd271cfa73f17. Summary usage:
  111,382 input (8,448 cached)/7,977 output tokens; one accepted call. Reviewed source
  citations and boundary handling. No repair has yet been published: Fly identity
  works but app status/list/backup return unauthorized. Requested refreshed Fly login
  asynchronously and continue independent full-import work. Agent permission changes
  do not fix this service-authentication failure. Reviewed b0136aa/332e30e: docs only,
  no security issue found.
- **F-106 — Featured discussion restored publicly.** User refreshed Fly login;
  access works again. Applied the tested guarded privacy repair under production's
  import lock after a fresh backup at
  /data/transfers/featured-before-publish-20261103.sqlite. Public HTTPS verification
  at 2026-11-03T07:16:04.555Z confirms repaired release 335f1e45..., 499 posts/488
  visible/11 hidden, no hidden source/analysis or blocked summary/context references,
  all 32 topics available, health 200. Production retains three accounts (one created
  since the original baseline), 2,197 posts and schema 5. No new imported replies
  were published. Evidence: work/featured-privacy-publish.log and
  work/featured-privacy-live-verification.json. Reviewed c02a5b4: docs only, no issue.
- **D-102 — Online preparation and atomic full-import publication.** User explicitly
  requires threads to remain online and all updates to publish together. Prepare
  source/analysis privately; public content and pull metadata remain on the published
  release until one transaction commits the entire checked import. Include publication
  baselines and import completion/summary checkpoints in the same guarded transaction;
  a failure rolls back every topic. Catalog reads use a consistent SQLite snapshot.
  Replace whole-topic withholding with an explicit original-discussion reading mode
  when immediate privacy restrictions are necessary: hide affected source posts and
  withhold derived analyses/summary until the checked replacement is ready, while
  remaining public originals stay readable. Do not invent substitute AI assessments.
  A small versioned migration may update the availability view to per-post restriction;
  preserve all tables and personal data. Support analysis/staging of existing schema-5
  baselines and current migrated databases. Add real transaction rollback/concurrency,
  visibility, frontend rendering and restart/migration coverage. Rebuild the prepared
  Fly image after testing; the full import remains unpublished during preparation.
- **D-103 — Exclude the music thread from imports.** User explicitly selects
  exclusion of thread 20456 ("What are you listening to?"). It has no published
  release or completed model work in this run. Remove its private draft registry/run
  membership and exclude it from future new-thread discovery. Preserve the original
  fetched private artifacts and all other candidates. This avoids 1,024 first-time
  reply analyses/130 planned calls. Stop at a topic boundary before changing the
  active in-memory run, record amended scope/settings and resume saved work.
- **F-107 — Atomic publication implemented and checked.** Added a strict batch
  publisher that checks release baselines, frozen membership/source and summary
  consistency under one transaction, then commits all topic/source/rendition records,
  summaries and completed import coverage together. Existing single publication/merge
  share savepoints, so they do not create an inner independent commit. Catalog reads
  use a consistent read snapshot. Thirty-nine Rust tests pass, including generated
  new/existing topic batches, rollback at every failing position, stale releases,
  strict request fields and concurrent readers over 20 generations. Seventeen Node
  import tests pass with the new single publication request. Added an additional
  client-response failure regression to preserve committed state; its gate follows.
- **D-104 — Cheap staging review for future new threads only.** User requests
  excluding social-only/fun-only threads without expensive classification, then
  clarifies that current threads may be left alone. Future new-thread discovery
  stages titles and short opening excerpts before full-history fetching/analysis.
  The operator agent makes a quick assessment from that bounded packet (no separate
  rubric/model job), presents proposed frivolous exclusions for user confirmation,
  and records confirmed include/exclude decisions persistently. Excluded threads do
  not receive summaries or per-reply analyses in future runs. Mixed/uncertain material
  is reviewed rather than silently discarded. Existing tracked threads bypass this
  new-thread gate; the current frozen run is grandfathered, except the separately
  approved music-thread exclusion. A small review table may accompany migration 6.
- **F-108 — Music backfill removed; full analysis resumed.** Removed only unpublished
  thread 20456 from the private draft's run/discovery/registry, preserving its fetched
  artifacts and every other candidate. Config now excludes it from new discovery;
  existing tracked topics retain their membership. New plan: 65 topics, 719 new/edited
  reply targets and 2,183 retained replies; 130 planned calls avoided. Added source
  exclusion tests. Settings comparison now uses structural equality so equivalent JSON
  key ordering does not obstruct resume (regression included). Current analysis session
  41427 uses a 250-call allowance. Topic-boundary maintenance interrupted one pending
  request; its unknown usage is recorded separately, along with the earlier timeout
  and baseline-maintenance interruption. Rebased only unstarted zcg on the verified
  repaired release, preserving fetched source hashes; audit files document both scope
  and baseline amendments. Reviewed c776728: guarded parameterized transactions,
  savepoint rollback and strict publication envelope; no security issue identified.
- **F-109 — Reading stays online during source restrictions.** Implemented explicit
  original-discussion mode instead of whole-topic withholding, with an allowlist of
  public source fields and no old derived summary, analysis or grouped provenance.
  Staged source pulls no longer change public pull timestamps before publication.
  Schema-6 view migration restricts individual posts while preserving every table row;
  tools accept 5/6 baselines. Forty-one Rust tests pass, including all 256 restriction
  subsets, migration row equality and remaining-post availability. Forty-one focused
  Node tests and the complete Chrome regression pass, including original-only desktop/
  mobile, deep links, hidden source exclusion and no console errors. Both privacy
  screenshots inspected. Source remains undeployed; live featured repair is healthy.
  Reviewed fe3d357: strict numeric exclusions/parameterized scope removal and structural
  equality; no security issue. Atomic publication response guard now passes (18 tests
  before exclusion coverage expanded the importer suite to 19).
- **F-110 — Future-only cheap scope review implemented.** New discovery now stages
  titles/openings capped at 180/600 Unicode characters before any full-history fetch.
  No paid classifier/rubric call: the operator agent reviews the bounded packet and
  obtains user confirmation before `fetch --review FILE`. Strict validation preserves
  source IDs/text and records include/exclude/classification/reason in the new schema-7
  decision table. Existing tracked/current frozen threads bypass this gate. Twenty-one
  importer tests pass, including pending blocking, changed-source rejection, persisted
  exclusions, and include-all/exclude-all/mixed windows with zero classifier calls.
  Forty-one Rust tests and clippy pass; the empty eligible window is a valid atomic
  completion. Migration fixture reconstruction now removes the newly introduced table
  before simulating schema 3; legacy signed-feedback assertions remain intact. Prepared
  transfers carry confirmed decisions, and progress explicitly distinguishes retained/
  cached outputs from model calls. Reviewed a0eab2e: allowlisted source projection,
  per-post availability and text-only frontend rendering; no security issue found.
- **D-105 — Bounded app-scoped Fly credentials for this preparation.** Repeated app
  access failures returned after a successful login/repair. Official Fly token docs
  now describe login tokens as very short-lived and recommend scoped tokens for
  longer operations (https://fly.io/docs/security/tokens/). Try a token restricted to
  zencash with a 12-hour expiry, stored 0600 under ignored work/ and supplied only via
  child-process environment. Do not print it, commit it, change global CLI credentials
  or grant org-wide access. If the existing login cannot mint it, request one fresh
  login and mint promptly; continue independent local import work meanwhile.
- **F-111 — Final code gates pass; reviewed scope metadata transfer.** Full deployment
  gate passes (21 importer tests, 41 Rust tests/clippy, verifier builds and runtime
  smoke). Full Node is 146 passing/two known missing historical fixture failures.
  Added a prepared-transfer regression proving confirmed exclusions persist on the
  destination without model/network calls or personal-state replacement. Review-aware
  staging migrates an older destination before recording review metadata. Read-only
  reopen confirms exclusions survive connections. Reviewed 792eff3: strict bounded
  review packets, source identity checks, parameterized decisions and no forum-text
  execution; no security issue found. App-scoped token creation also returned
  unauthorized; a second refreshed login is requested and pending. No token was
  written (empty 0600 scratch file), and no code deployment occurred. Latest draft
  audit: 56/65 topics validated, 83 planned calls left, all 14 personal tables equal,
  integrity/FKs clean. Known usage 1,929,847 input (963,328 cached)/455,501 output;
  three unknown-usage calls remain separately recorded.
- **D-106 — Correct measured host clock skew and preserve model work.** Remote build
  failed TLS validation because its certificate's not-before date was ahead of the
  workstation. Local clock 2026-11-03T09:31:37Z disagreed with HTTPS Date headers from
  api.fly.io, fly.io and Cloudflare, all around 15:54:36Z; timedatectl reports NTP
  active but unsynchronized. Correct host time through available system facilities;
  never disable TLS checks. Audit source/pull/run timestamps and elapsed metrics for
  skew, preserving frozen source text and accepted model outputs. Metadata-only
  candidate rebuilds may use validated cached outputs with model calls forbidden.
  Retry remote build after correction and recheck scoped app credentials. Authentication
  expiry effects are plausible but not proven; the TLS cause is directly measured.
- **F-112 — Scoped authentication works; clock correction needs host administrator.**
  User refreshed Fly authentication; created the authorized app-only 12-hour token in
  ignored work/fly-zencash-preparation.token (0600), never printed. Scoped status and
  SSH work; fresh consistent production copy has schema 5, 32 topics/2,197 posts,
  three accounts and repaired zcg baseline. Remote build-only failed before deployment:
  workstation clock is before the builder certificate's not-before date. Chrony
  independently measures the workstation 22,956 seconds slow of authenticated NTP;
  HTTPS Date headers agree. sudo requires interactive administrator authentication.
  Asked user to run sudo chronyc makestep; import continues independently. README now
  records preflight clock/app/SSH checks, bounded scoped credentials and saved-artifact
  resume. Reviewed 0aab249 and 63cc5f5: no secret exposure, execution or input-boundary
  issue identified. No new code or full import has been published.
- **D-107 — Try Fly's supported alternate builder without weakening TLS.** While
  the administrator clock correction is pending, use build-only --depot=false with
  the same bounded app credential. Fly documents this alternate remote builder
  (https://community.fly.io/t/depot-remote-builders-becoming-the-default/21756).
  Do not deploy, disable TLS or broaden credential scope. If access is insufficient,
  preserve the diagnostic and continue local work. Clock audit is private at
  work/optimized-clock-audit.json: keep original source/pull observations and the
  conservative frozen cutoff; an exact historical correction is not justified.
  Forum creation times remain upstream values. Three fetched posts are after the
  cutoff, and next-run overlap revisits them safely without repeating reply analysis.
  Reviewed the documentation-only 1606420/8e73853 changes; no security issue found.
- **F-113 — Final importer image built and pushed without deploying.** The supported
  --depot=false builder succeeded with scoped authentication and TLS enabled. Image
  registry.fly.io/zencash:importer-0aab249, immutable digest
  sha256:1f95cc1e1ab066abc854770fde0eff2033b8dc9fc27f30943f4db3af35951a68,
  251 MB. Log work/final-import-fly-alternate-build.log. This contains all executable
  changes through 0aab249 (later commits documentation only). Production still runs
  the previous image and old published content. Clock correction remains requested,
  but no longer blocks image preparation. Reviewed 9940c2d: documentation only; no
  security issue found. Current import continues through thread 43855.
- **F-114 — Clock corrected; scoped app access verified again.** User ran sudo
  chronyc makestep. Chrony journal records a 22,819.585794-second forward step at
  2026-11-03T16:26:17Z; system time now matches HTTPS Date and Chrony reports zero
  offset. Scoped Fly status and SSH both pass afterward. Zkool summary spanned the
  step: its raw 22,969,349-ms wall duration includes ~22.82 million ms of clock
  correction, not compute. Private clock audit records the subtraction (~149,763 ms).
  Overall invocation/topic elapsed values crossing the step are similarly unreliable;
  preserve raw records, distinguish them from token usage, and do not rerun outputs.
  Original conservative cutoff and source timestamps remain unchanged. App token's
  original earlier usable-until deadline remains conservative. Reviewed a465cb6 and
  91032ce documentation only; no secret exposure or security issue identified.
- **D-108 — Size the Fly Machine for measured import memory.** All 65 topics now
  validate; prepared content bundle is 97 MB. Actual staging/publication rehearsal
  with no swap failed at a 256-MB Node heap, then was killed under a 400-MB process
  scope with a larger heap. The same full rehearsal passed under an 800-MB no-swap
  scope with a 512-MB Node heap, recording 604,492 KiB peak Node RSS. Set fly.toml
  to 1 GB (same CPU, single Machine and persistent volume) for sufficient serving
  plus import headroom; leave production unchanged during preparation. This is a
  resource configuration change, not a new image or model request. Keep the measured
  failure logs and passing rehearsal; do not weaken validation to fit 512 MB.
- **F-115 — Optimized import and full production-copy rehearsal complete.** All 65
  candidates validate: 2,912 posts/2,902 visible, 2,183 retained accepted replies,
  717 new replies/two edits, 65 full summaries and 123 new/edited reply batches.
  Main import recorded 211 attempts (188 accepted/23 rejected), plus three calls
  with unknown usage. Known 4,341,439 input (1,798,272 cached)/1,272,841 output;
  earlier privacy repair remains separately counted. Prepared bundle is 101,650,001
  bytes, SHA ce5b0a50d6b133a75a3e1bd822ceb109a30b3d8e7a3a45e6a9e8cbce3dd0b9f9.
  Full stage/publication on a fresh production copy passes under an 800-MB no-swap
  scope and 512-MB Node heap: three accounts and all 14 personal tables preserved,
  schema 5→7, one atomic publish-import, no model/network calls. Historical releases,
  renditions, source revisions/pulls preserved; all 2,183 retained identities unchanged,
  two edited revisions and ten hidden posts checked. fly.toml now specifies 1 GB,
  validated by fly config validate; serving and operator memory headroom justified
  by the measured 604,492-KiB Node peak. Deployment image already built; no executable
  change since 0aab249. Handoff records hashes, limits, review/deployment sequence and
  auth preflight. Production code/full new content remain unchanged and unpublished.
  Reviewed 634bdcc and d47aa57 documentation: no security issue found.
- **D-109 — Deploy the reviewed optimized import.** User inspected the local preview
  and explicitly says “cool. deploy it”. Deploy the already-built immutable image
  with the committed 1-GB configuration, preserving the existing Machine/volume.
  Take a fresh consistent production backup, stage the SHA-verified prepared bundle,
  then publish the complete run atomically. Verify all public topics, completed
  coverage and preservation of accounts/personal data. No new model calls or source
  fetches are needed. This authorizes production code migration and full publication.
- **F-116 — Reviewed optimized import deployed and verified live.** Applied immutable
  image sha256:1f95cc1e1ab066abc854770fde0eff2033b8dc9fc27f30943f4db3af35951a68
  to existing Machine e823213f175598 in sjc, now 1 GB RAM, preserving volume
  vol_vp2eyql6gdqxgjj4. Startup backup/migration completed; schema 7. Transferred the
  SHA-verified reviewed bundle and staged it with zero model calls/source fetches;
  observed all old 32 topics available during staging. Atomic publication recorded
  2026-11-03T17:58:55.343Z for run 39574692-e798-4ae6-a679-7e72019917b5; all 65 live
  release IDs exactly match rehearsal. Public health 200, 2,912 posts, ten hidden
  sources excluded, no unavailable topics. Fresh before/after consistent production
  snapshots verify all 14 personal tables identical, including three accounts and
  passkeys; historical releases/renditions/source revisions/pulls preserved, SQLite
  integrity/FKs clean, import complete with no active run. Audit artifacts:
  work/optimized-live-public-audit.json and work/optimized-live-database-audit.json.
  Fresh Tigris backup completed 18:05:11Z with the new content, object/hash recorded
  in HANDOFF.md and work/optimized-live-off-volume-backup.log. Local draft remains
  an unpublished historical preparation; production is authoritative. Reviewed
  authorization commit 9484da2 and deployment operations: scoped credentials stayed
  private, bundle hash verified, no database replacement or security issue identified.
- **D-110 — Push completed work to GitHub.** User requests pushing all these changes.
  Push the committed main branch to the existing origin, ml-sudocode/zforum, without
  rewriting history. Fresh fetch shows main ahead by 50 commits with no divergence;
  working tree is clean. The outgoing paths contain no private work/ artifacts,
  SQLite databases, token files or environment credentials. Include this ledger entry.
- **D-111 — Restore source links and finish Zenzcash alpha branding.** User requests
  visible original-forum links on posts, all four selection actions together,
  sharing title “Zenzcash: A Calm, Personalized Zcash Community Forum”, consistent
  public name Zenzcash, and an alpha notice inviting feedback by forum DM. Group
  Listen/Export/Copy prompt/Copy links in one wrapping action group; keep explanatory
  help separate. Preserve internal storage/cookie identifiers and existing accounts.
  Forum DM recipient is requested; proceed with the other changes while awaiting it.
  Existing two-action layout assertions are superseded by the user's four-action
  requirement; retain behavioral export/selection checks and add source-link coverage.
- **D-112 — Alpha feedback recipients.** User specifies sudo_ml or earthrise on the
  Zcash Community Forum. Link both recipients in the alpha notice using the forum's
  new-message route; sending a DM remains the visitor's action.
- **F-117 — Zenzcash alpha presentation implemented and checked.** Restored explicit
  external source links for normal, collapsed, filtered, anonymous and privacy-mode
  posts; hidden posts do not gain source links. Grouped all four selection actions
  together, with explanatory help below. Updated document/social metadata, header,
  help/error messages, export/recovery labels and filenames, and passkey display name
  to Zenzcash. Added the alpha notice linking DM composers for sudo_ml and earthrise.
  Internal storage, cookies, RP ID/origin and data formats are unchanged. Shared export
  filename constant removes duplicated naming. Twenty-four focused tests pass;
  generated view-state combinations verify source links. Full bounded Chrome checks
  pass, including metadata, four adjacent desktop actions, mobile wrapping and exact
  export content. Desktop/home/mobile screenshots inspected. Rebuilt auth verifier
  and runtime smoke passes, including Zenzcash display name with the same RP ID.
  New source-link test needed the built thread fixture (raw fetch fixtures lack URL);
  assertions remain intact. Logs work/zenzcash-ui-tests.log,
  work/zenzcash-browser.log, and work/zenzcash-runtime.log. Local
  preview at localhost:8001 uses the separate review DB and a four-hour server bound.
  No deployment, data import or model calls. Reviewed D-111/D-112 ledger commits:
  public recipients and UI requirements only, no credentials or security issue.
- **D-113 — Repair passkey account flows and make pending requests visible.** User
  reports missing recovery codes after enrollment, failing returning-user sign-in,
  and ambiguous pending-request errors after repeated clicks. Reproduce with a real
  browser and the maintained verifier, then repair the demonstrated causes. Ensure
  one active passkey ceremony, visible progress/cancellation and actionable errors;
  prioritize recovery-code display after success. Preserve existing credentials,
  RP/origin validation, sessions and data. Add end-to-end virtual-authenticator
  coverage. Prepare local review; production deployment remains a separate step.
- **F-118 — Passkey flow repaired and exercised end to end.** Clean registration
  and returning sign-in already succeeded with Chrome's virtual authenticator and
  the real verifier; no verifier/DB change was needed. User confirmed the problem
  was on localhost preview. The preview contains copied production accounts, whose
  production passkeys cannot authenticate on localhost; the UI now explains this.
  Confirmed UI defects: codes were below the entire profile and withheld until
  profile/feedback requests finished; profile-load errors erased them. Repeated
  clicks could overwrite the challenge and compete for the browser credential API.
  Codes now render at the top immediately, with download first, and survive a failed
  profile load. A shared passkey ceremony lifecycle suppresses overlapping requests
  across rerenders; explicit pending/cancel/error states explain the browser prompt.
  Cancellation/navigation and a two-minute timeout abort start/prompt work; final
  verification cannot be cancelled and lose issued codes. No plaintext persistence.
  Eighteen focused/deployment tests pass, including exhaustive mode-pair/pending-phase
  overlap checks, cancellation/late completions, timeout and error paths. Bounded
  Chrome end-to-end tests pass using actual WebAuthn and the real verifier: signup,
  visible/downloaded codes on desktop/mobile, delayed/failed profile requests,
  logout/returning login, re-verification, second passkey, code replacement, recovery,
  used-code and revoked-key rejection. Existing full UI browser regression passes.
  Reused its bounded harness via --passkeys rather than duplicating infrastructure.
  Screenshots inspected: work/screenshots/passkey-waiting.png and
  passkey-recovery-{desktop,mobile}.png. Logs: work/passkey-unit-tests.log,
  work/passkey-browser.log, work/passkey-ui-regression.log. Physical device/password
  manager behavior awaits user verification. Preview serves updated files at
  localhost:8001; production untouched, no schema/import changes. Reviewed D-113:
  requirements only, no secrets or security issue. Existing security boundaries
  (RP/origin, CSRF, verifier, credential revocation) remain intact.
- **D-114 — Reopen unresolved passkey prompt and recovery behavior.** User reports
  returning login still waits without any browser prompt and recovery does not work.
  Inspect the actual browser request contract; virtual-authenticator success alone
  does not prove native prompt behavior. Found webauthn-rs 0.5.4 explicitly emits
  mediation=conditional from start_discoverable_authentication, intended for autofill;
  our button-driven flow has no autofill field. Set explicit required mediation at
  the browser invocation for login/re-verification and test the actual arguments.
  Clarify which recovery action fails while inspecting form/state handling. Browser
  access host is unavailable, so do not claim observation of the user's native prompt.
  Preserve credentials/security checks and keep changes in the local preview.
- **D-115 — Allow recovery to replace a pending sign-in.** User clarifies that the
  saved-code recovery button is greyed out, rather than reporting a rejected code.
  The stuck conditional login causes the existing busy gate to disable recovery.
  While login is starting/waiting, offer an explicit cancel-sign-in-and-recover
  action; abort and await its settlement before starting recovery. Keep final
  verification non-interruptible and suppress repeated recovery clicks. This
  resolves the disabled fallback without allowing simultaneous browser ceremonies.
- **F-119 — Fix the actual missing-dialog cause and recovery lockout.** The earlier
  F-118 virtual-authenticator success did not establish native prompt behavior.
  webauthn-rs explicitly returns conditional mediation; the page passed it through
  despite having no autofill input. Login/re-verification now explicitly uses
  required mediation at the browser call, preserving challenge/RP/user-verification
  parameters. User clarified recovery was disabled during pending login. Recovery
  now offers Cancel sign-in and recover, aborting and awaiting login settlement
  before issuing the recovery challenge. Repeated clicks are suppressed; final
  verification remains non-interruptible. Existing passkeys/codes remain valid.
  Twenty-two focused/deployment tests pass, including actual browser-argument
  assertions, exhaustive mediation values, recovery handoff at both cancellable
  phases, duplicate requests and non-interruptible phases. Both bounded browser
  suites pass; saved-code recovery replaces a pending login with the real verifier.
  The virtual presence flag must be enabled before the new create request; toggling
  it after an already-paused virtual create did not resume that test request. Kept
  all recovery/account assertions and adjusted that device simulation ordering.
  Inspected mobile recovery-action screenshot, work/screenshots/passkey-recovery-
  fallback.png. Logs work/passkey-dialog-{tests,browser,regression}.log. Actual preview
  serves the new module. Native user-browser observation unavailable (browser access
  host unavailable); user confirmation still required. No deployment or DB changes.
  Reviewed a6e9ea7 and 77d0e53 ledger commits: requirements only, no security issue.
- **D-116 — Remove manual browser-filter import; passkey fix confirmed.** User says
  the passkey/recovery flow now works and requests deleting the profile option to
  import this browser's filters into the account. Remove the button and its unused
  client handler; keep normal signed-in filter saving/sync. No deployment requested.
- **F-120 — Remove manual filter import.** Removed the profile button and sole
  importSettings handler; normal account preference saving remains. Updated design
  and handoff, including the user's confirmation that passkey/recovery now works.
  Nine existing personal tests and the complete bounded browser regression pass;
  inspected work/screenshots/batch004-profile.png, with no import control. Logs:
  work/remove-filter-import-{tests,browser}.log. Reviewed 97a34a4: requirements only,
  no security issue. No schema/data changes or deployment.
- **D-117 — Deploy reviewed account/UI fixes and push to GitHub.** User confirms
  the passkey/recovery flow works, requested removal of manual filter import, and
  now explicitly authorizes deployment and GitHub push. Deploy the committed alpha
  presentation/account fixes to existing Fly app zencash, Machine/volume unchanged,
  preserving the authoritative production SQLite and all imported content. Run the
  deployment gate, take a consistent pre-deploy backup, use the existing remote
  builder, verify live health/assets/content/auth challenge contract, and push main
  to origin without rewriting history. No importer/model calls or DB replacement.
- **F-121 — Reviewed UI/account release deployed and pushed.** D-117 executed:
  code commit 67cc310 built with the existing Fly remote builder (--depot=false),
  image sha256:4ed676d82680ab5e541bb67071a64f1e78976e154d6c5e2a95ad1ab3ffb7e23e,
  deployed to existing Machine e823213f175598 in sjc, 1 GB, same encrypted volume.
  Deployment gate passed (4 deployment + 21 importer + 41 Rust tests, Clippy,
  release/verifier builds and runtime smoke); both UI/passkey browser suites had
  passed on the reviewed edits. Fresh scoped token and clock/app-access preflight
  succeeded. Startup Tigris backup completed 22:50:26.991Z, key/hash in HANDOFF.
  Deployment briefly restarted the single Machine for its normal backup; final
  Fly checks pass. Public verification 22:50:45Z confirms health, exact reviewed
  asset bytes, unchanged RP/origin and new Zenzcash RP name; all 65 topics/2,912 posts
  match the pre-deploy catalog exactly, zero unavailable topics. Consistent pre/post
  snapshots prove all 26 tables identical (four accounts, four credentials, 40
  recovery codes), schema 7, integrity/FKs OK. No import, publication, schema change
  or model call. Audits work/account-ui-{live,database}-audit.json; deploy/build/gate
  logs and snapshot paths in HANDOFF. GitHub main advanced f7e781a→67cc310 and remote
  SHA matched. Reviewed authorization commit and outgoing paths: no private work,
  credentials, databases or security issues; scoped token remains ignored, mode 0600.
- **D-118 — Auditable incremental forum pull with estimates.** User requests the
  latest content since the last completed poll, plus calls/tokens/time broken down
  by work type so future runs can be optimized, and time estimates on every pull.
  Add durable private run auditing and estimates, including fetch/discovery/profile
  work, summaries, batched reply analysis, validation/retries, retained work and
  unknown usage. Measure elapsed durations monotonically; do not conflate concurrent
  model duration with wall time or report missing usage as zero. Use a fresh
  production backup for local preparation, preserve reply reuse and music exclusion,
  and stage new-thread classification for user confirmation before model work.
  Run the pull with estimates and progress; leave content unpublished for review.
  Audit collection/reporting uses existing run files, with no required schema change.
- **D-119 — Continue pull autonomously while user is away.** User requests progress
  without active input and will review in a couple of hours. Make conservative local
  staging decisions for new threads: include clearly substantive material, avoid
  paid analysis of clearly social-only/fun-only material, and flag all decisions for
  later review. Do not publish. Keep working through fetch/analysis/audit rather
  than waiting for interactive staging answers; surface remaining work and revised
  estimates when the user returns. This authorizes local scope preparation while
  retaining user review before any production publication.
- **F-122 — Pull instrumentation ready for use.** Added private aggregate/per-topic/
  per-attempt audit reports, raw operation timings and actual HTTP retry/backoff
  counts. New runner/stage timing uses a monotonic clock; failed and interrupted
  invocations persist as failed/unknown rather than disappearing. Summary and reply
  batch usage are separate; retained/cache hits are not recharged. Fetch planning
  ranges and analysis ETA updates use work counts and historical task durations,
  excluding the known oversized wall-clock sample. Thirty-three focused importer/
  audit/update tests pass; existing two missing-archive refresh failures remain
  unchanged. Fresh production snapshot copied to a separate local preparation DB;
  no production checkpoint or personal data replaced. Reviewed D-118/D-119 ledger
  commits: authorized local preparation only, no credentials or security issues.
- **F-123 — Audited pull started with frozen scope.** Run ec5e8754-a8ba-486a-952d-
  be419bc7d522 covers 2026-11-03T05:37:28.138Z→23:57:05.284Z from a fresh production
  backup. Discovery used 27 HTTP requests (6 listing pages across two matching
  passes, 21 short-opening reviews), no model calls. All 21 new openings concern
  substantive or mixed education/adoption work and are included with recorded
  reasons under D-119; music remains excluded. Total 86 topics. Baseline fetch
  estimate 16–47 minutes for 931 requests, with new histories/profiles extra.
  Refined reporting so incomplete scope never appears as zero remaining work,
  per-topic CSV includes retained/newly assessed reply counts, and reports/ETAs
  refresh after each completed analysis topic. Thirty-three focused tests pass.
  Reviewed 9cef71c: private atomic audit files, preserved sandbox/auth restrictions,
  no new dependency, no production data replacement or security issue identified.
- **F-124 — Audit repeated profile work during fetch.** Added unique-URL and repeated
  request counts separately from retry counts, with explicit HTTP rollups in the
  readable report. This measures avoidable repeated profile lookups without changing
  fetch/privacy behavior mid-run. Thirty-four focused tests pass. Reviewed e8f9e3a:
  audit-only reporting/state documentation, no new permissions or security issue.
- **F-125 — Fetch complete; measured analysis allowance started.** Audited pull
  fetched 86 topics / 3,260 posts in 19.0 minutes: 352 additions, five edits, four
  unavailable observations. One newly hidden published post was immediately
  restricted; production retains 65 online topics. 1,097 HTTP requests, no retries
  or 429s; profiles account for 751 requests / 400 unique URLs / 351 repeats.
  Frozen plan is 86 summaries + 69 reply batches for 357 replies, retaining 2,893
  unchanged assessments. Historical ETA 138–426 minutes, disclosed to user before
  starting bounded analysis with 210-call allowance, concurrency two and subscription
  authentication. Reports regenerated with the latest audit code after the fetch
  process (which loaded earlier code) exited. Existing localhost review DB has five
  accounts and matching full cutoff; preserve it through a separate rehearsal copy.
  Reviewed 4e26953: aggregate URL counts only, private run files, no new permissions,
  credentials or security issue identified.
- **F-126 — Clarify audit boundary in exported reports.** The spec already excludes
  conversational operator usage; repeat that limitation in audit.json/audit.txt so
  zero classification runner calls cannot be mistaken for zero chat/review tokens.
  Importer model attempts, HTTP work and stage durations remain directly measured.
  Reviewed e39f2d6 checkpoint: operational metadata only, no secrets/security issue.
- **F-127 — Analysis checkpoint and measured tuning candidates.** At 02:14 UTC
  Nov 4, 66/86 topics are complete: 98 accepted calls, nine rejected attempts,
  zero execution failures. All rejected jobs so far subsequently corrected;
  current two-reply batch is active. Most rejections involve claim-accounting
  coverage or unsupported claim categories. No validation rules weakened.
  Forty-eight topics have no detected content changes but still receive fresh
  summaries under the agreed policy. The 21 new threads account for 262 of 357
  assessed replies and 45 of 69 reply batches; already tracked topics account for
  the other 95 replies / 24 batches. These are optimization candidates and workload
  explanations, not an authorization to change the frozen run. Remaining estimate
  51–134 minutes; user receives regular progress and revised estimates. Reviewed
  9ea8a78: report wording only, no security issue; 34 focused tests passed again.
- **F-128 — Persist stage starts before execution.** The operator's bounded process
  window can end while model work is active. Individual attempts already persist
  before invocation; stage records now use the same audit lifecycle, so abrupt
  termination cannot silently omit the stage. Reports are regenerated after the
  stage is finalized. Added an integration test observing the running stage from
  inside the model call, then checking failed and resumed completion records.
  Thirty-five focused tests pass. The current process loaded earlier code; captured
  its Linux process-start uptime before its deadline to retain a process-lifetime
  measurement if continuation is necessary. Reviewed 4b7253a: checkpoint metadata
  only, no secrets or security issue identified.
- **F-129 — Resume after operator deadline with explicit unknown usage.** The
  initial 3h process window ended at 03:17:16 UTC with exit 124, after 77 topics,
  135 accepted calls and 16 rejected attempts. One summary (thread-57219) was
  interrupted; its usage/time remain explicitly unknown. Captured Linux process
  start ticks and observed uptime preserve the initial process duration: 180.6
  minutes including startup and about 36s post-exit observation delay, labeled
  linux_process_lifetime_observed in the stage audit. Saved DB/report elapsed state
  includes that interval. Resumed the 20 uncached jobs with a 35-call allowance and
  2h bound, estimate 20–51 minutes. The user was informed of the interruption and
  continuation; no accepted output is recharged. Reviewed 4e64c48: shared private
  audit lifecycle only, publication/auth boundaries intact, no security issue.
- **F-130 — Rehearsal caught floating-point round-trip mismatch.** All 86 candidates
  validate; 2,893 retained assessments/provenance records and 14 personal tables are
  unchanged. A separate local publication committed atomically, then exact response
  verification caught 55 sub-millisecond timing values changed by one floating-point
  unit during Rust JSON parsing/serialization. No content discrepancy or production
  publication occurred. Keep exact equality; enable the existing serde_json
  float_roundtrip feature (no new dependency), add generated finite-number and real
  publication regression coverage, rebuild and repeat the rehearsal from a fresh copy.
  Frozen analysis artifacts will remain unchanged; no additional model calls needed.
  Reviewed 7ff1e10: operational checkpoint metadata only, no security issue.
- **F-131 — Precision repair and fresh publication rehearsal pass.** Enabled the
  existing serde_json float_roundtrip feature, preserving exact numeric state rather
  than weakening publication equality or changing frozen artifacts. Added generated
  finite-bit coverage across exponent/sign/mantissa boundaries plus real failing
  timing values through the actual atomic publisher. Clippy and all 43 Rust tests
  pass; release rebuilt. Fresh rehearsal on a copy of the prior localhost preview
  succeeds: one atomic publication, 86 topics / 3,260 posts, schema 7, all 14 personal
  tables unchanged and all five local accounts retained. Draft verification also
  proves 2,893 retained analyses/provenance unchanged, hidden source redacted and the
  production baseline/cutoff untouched. No extra model calls. Deploy this server
  precision fix before later staging/publication on Fly. Reviewed de14b63: diagnosis
  only, no secrets/security issue. Rehearsal process peak RSS was 1.24 GiB with the
  workstation's default Node heap; verify a bounded heap before Fly publication.
- **D-120 — Prepare measured import memory headroom without a live resize.** The
  122 MiB prepared bundle exceeds a 384 MiB Node heap. A complete 512 MiB heap
  rehearsal passes at 782,272 KiB parent RSS and 165,036 KiB maximum publisher RSS;
  the rendered preview server holds 317,296 KiB RSS. Concurrent import plus reading
  therefore has insufficient headroom on the current 1 GiB Fly Machine. Prepare
  2 GiB in fly.toml and a 512 MiB Node heap limit in the image for the next reviewed
  deployment. Do not resize or deploy now. Keep this explicit in the handoff/final
  review; no schema/volume change or additional model call is involved.
- **F-132 — Prepare capacity and verify the review site.** Local Fly configuration
  now requests 2 GiB and the runtime image bounds Node heaps at 512 MiB. Forty Node
  importer/audit/update/deployment tests pass, plus runtime smoke; 43 Rust tests and
  Clippy passed for the precision repair. Full real-bundle rehearsal passes at the
  512 MiB heap cap with unchanged personal data, one atomic publication and no
  source/model calls. Inspected the rendered grants-page screenshot. HTTP checks:
  preview has 86 topics / 3,260 posts / zero unavailable / no privacy-review mode;
  production still has 65 / 2,912 / zero unavailable. Four newly unavailable source
  posts were restricted during fetch (the earlier one-post checkpoint was partial),
  so production currently shows original-discussion mode for thread-55267,
  thread-58733 and zcg until the reviewed publication. All remain online.
  Independent history checks preserve 102 releases, 450 renditions, 2,923 source
  revisions and 100 source pulls; all 2,893 retained source/rendition versions remain
  identical, while the five edited posts get new source versions. No live resize,
  deployment, publication or GitHub push. Reviewed e1e2cc8 and b654c0f: precision
  parsing and measured configuration only, no new dependency or security issue.
- **F-133 — Audited import ready for user review.** All 86 topics are analyzed and
  validated; the separate localhost preview serves 3,260 posts with five local
  accounts preserved. Frozen prepared bundle and per-category/topic/attempt audit
  are recorded in HANDOFF. Final measured counts: 175 attempts, 155 accepted,
  19 rejected then corrected, one interrupted with unknown usage; 3,494,329 known
  input tokens (1,461,504 cached subset), 814,079 output. Fetch took 19.0 minutes;
  analysis observed wall time 222.8 minutes, within the frozen 138–426 minute range.
  Operator setup/testing/chat usage remains outside importer measurements. No active
  model work remains. Review is pending; no production publication, deployment,
  resize or GitHub push. Reviewed ad0d804: fixed runtime resource configuration and
  exact contract tests only, no secrets, added privileges or security issue. Preview
  health remains OK. Handoff records precision-fix and memory prerequisites so the
  later deployment can publish this bundle without repeating model work.
- **D-121 — Stop production mutations during review-only pulls.** User reports
  the live featured title and filters changed without deployment authorization and
  objects to production changes. Do not treat the prior immediate-restriction
  workflow as authorization for further live writes during local preparation.
  No production repair, restriction removal, deployment or publication is authorized
  by the diagnostic question. Diagnose read-only, explain the actual writes, and
  keep any repair preparation local pending an explicit production instruction.
- **F-134 — Live degradation traced to the local pull's production-write hook.**
  work/run-audited-pull.mjs intercepted restrict and used Fly SSH to write four
  restrictions to /data/zforum.sqlite during fetch. Fresh public catalog compared
  with the pre-pull SQLite confirms unchanged release IDs but visibility_pending
  for thread-55267 (55267/30), thread-58733 (58733/2) and zcg (58611/53,
  58656/190). server/src/visibility.rs replaces affected titles with Original
  discussion and strips derived analysis; site/js/topic.js consequently omits
  filters. No code deploy or full-import publication was necessary to cause this
  visible production change. The operator incorrectly equated unchanged releases
  and online originals with an unchanged live experience. Earlier reporting was
  misleading; user was given a direct explanation and responsibility acknowledged.
  Diagnostic public response is private work/live-visibility-investigation.json.
  No production mutations made during this investigation. Reviewed 4b78c5c:
  documentation only, no credential contents or security issue identified.
- **D-122 — Enforce preparation without production changes.** User explicitly
  requires that production never change during a pull. Supersedes the immediate
  privacy-restriction exception in D-102 and earlier refresh instructions: hidden,
  deleted and unavailable source stays in private draft observations until explicit
  reviewed publication. Remove fetch-time restriction callbacks and generic server
  access from preparation, remove staging-time restrictions, remove the custom
  runner's Fly hook, and reject preparation against production storage/runtime.
  Apply the boundary to both maintained import and legacy refresh entry points;
  production operator commands must reject fetch. Test hidden/deleted/unavailable
  source, interruption/resume and preparation target aliases, plus unchanged live
  catalog/releases/restrictions until explicit publication. No live write, deployment,
  GitHub push, new forum pull or model call is authorized by this prevention task.
  Reviewed 23cc2e1: incident documentation only; no credentials or security issue.
- **F-135 — Enforce local preparation and defer visibility changes to publication.**
  Removed the custom runner's Fly/token/SSH hook and the shared fetcher's restriction
  callback. Import/legacy fetch no longer invokes server writes. Shared preparation
  guards reject production runtime/storage and symlink/hard-link aliases before
  preparation state changes; production command rejects fetch/analysis. Bundle staging
  now reconstructs private source/checkpoint state without invoking fetch or applying
  restrictions. Atomic publication records hidden/removed restrictions in the same
  transaction as all releases; failed publication rolls them back, while successful
  publication prevents unsafe older-release rollback. No schema/dependency change.
  Forty-five focused Node tests, two relevant legacy tests, all 44 Rust tests, Clippy
  and release build pass. Full real-bundle rehearsal with a 512 MiB heap passes:
  86 topics / 3,260 posts / five local accounts; all 14 personal tables preserved;
  86 source-history records, one atomic publication, zero restriction commands,
  network fetches or model calls. Evidence work/preparation-isolation-*. Existing
  prepared bundle/artifacts unchanged; preview still serves its prior rehearsal.
  No live repair, production write, deployment or push. The deployed image still has
  its older command; new production-side enforcement requires the next approved
  deployment. Reviewed 0f972a1: authorization ledger only, no security issue.
- **D-123 — Apply measured savings to future pulls.** User authorizes skipping
  summaries for unchanged topics, reducing rejected batches and caching repeated
  profile lookups. Freeze new policies into future run settings/snapshots; keep the
  already prepared import and its prompts/artifacts unchanged. Reuse only a checked
  published summary with identical full source and matching summary prompt, retaining
  generation provenance; changed/hidden/deleted source gets a fresh full summary.
  Add explicit claim-type/claim-preservation guidance and retry only invalid reply
  records where the envelope permits, preserving validated records across resume.
  Cache validated public profile results within one frozen pull, including resume,
  but not across later pulls; expose cache hits and retained summaries in audits and
  estimates. Tests must cover changed-source invalidation, malformed output, retries,
  cache lifetime/failure and existing frozen-artifact compatibility. No forum/model
  calls, production writes, deployment or GitHub push are part of this implementation.
  Reviewed de98a3c: guards fail closed, SQL remains parameterized, restrictions share
  atomic publication rollback, no secret exposure or security issue identified.
- **F-136 — Future-pull savings tested and ready for review.** Implemented checked
  summary reuse for unchanged full source/matching prompt, preserving generation
  provenance; changed source still receives a fresh full summary. Added explicit
  claim-type/preservation guidance and partial-batch repair with strict independent
  validation, durable accepted-record checkpoints, complete final validation and
  per-post actual-request provenance. Profile results cache within one frozen pull,
  including resume/concurrency, with fresh caches next run and no cached failures.
  Audit/CSV/preview report retained summaries, profile cache hits and salvaged reply
  records; estimates exclude retained work and small partial-repair timing samples.
  Sixty-three focused Node tests pass, including source mutations, per-profile scope,
  all three-reply valid/invalid subsets, malformed envelopes, interrupted resume,
  provenance rejection and real SQLite staging/publication. Integration fixture
  initially omitted the stored summary while copying a published baseline; tracing
  proved that omission, the fixture was corrected, and the strict production baseline
  check was preserved. All 86 already-prepared candidates still validate; prepared
  bundle SHA unchanged. Non-fetch CLI/private-runner stages use frozen run settings.
  No schema/dependency change, forum/model call, live write, deployment or push.
  Actual reduction in first-pass model rejections is not measured until a future pull.
  User asked about delay; explained partial-retry scope and committed to final delivery
  rather than further expansion. Reviewed ccfe0c2: ledger only, no security issue.
- **D-124 — Deploy reviewed audited import and push GitHub.** User explicitly
  authorizes deployment and push after confirming that restoring the live featured
  topic requires both code deployment and atomic publication of the prepared content.
  Deploy current committed code to zencash, including 2 GiB memory, precision repair,
  production-isolation guards and future-pull savings. Preserve the existing Machine,
  volume, SQLite and personal data. Take a consistent pre-deploy snapshot, run the
  deployment gate, transfer the exact reviewed prepared bundle, stage without changing
  public content, publish the whole run atomically and verify live topics/featured
  filters plus personal-state preservation. Push committed main without rewriting
  history. No new forum fetch or model analysis; frozen import policies remain intact.
  Reviewed ecf79c7: strict cache/baseline/repair validation, parameterized queries,
  private atomic files and production guards intact; no security issue identified.
- **D-125 — Upgrade the existing production Machine to a performance CPU.** User
  explicitly authorizes a performance CPU after seeing publication delays and
  intermittent health-check failures on shared-cpu-1x. Keep one Machine, one CPU,
  2 GiB RAM and the existing SQLite volume; change CPU kind to performance in both
  Fly configuration and the existing Machine. Wait for the committed import's
  reporting/lock to finish before restarting. Fly documentation lists shared CPUs
  at 6.25% sustained quota versus 100% for performance; published performance-1x
  2 GiB pricing starts at $33/month and varies by region, with storage/traffic extra.
  No new forum/model work. The reviewed import is already complete in SQLite:
  86 published topics, run ec5e8754-a8ba-486a-952d-be419bc7d522. GitHub main has
  already advanced to 53986a3; final configuration and verification notes follow.
- **F-137 — Publication committed; move reporting off the throttled shared CPU.**
  SQLite directly confirms all 86 topics published and the run complete; report.json
  also records complete with finished_at 2026-11-04T05:48:01.009Z. The remaining
  CLI process is rendering reports after commit. To apply D-125 promptly, stop only
  this reporting process, then restart the same Machine with performance CPU and
  regenerate the report from the completed run. This refines the reporting wait in
  D-125 without repeating publication, fetching content or analyzing replies. Preserve
  the explicit interruption in deployment evidence; verify database and reports after.
- **F-138 — Reviewed import live; performance CPU verified.** Deployment gate passed
  (Node deployment/import tests, 44 Rust tests, Clippy, release/auth builds and runtime
  smoke); five updated deployment-configuration tests pass. Deployed 53986a3 image
  sha256:35e1dea4ad91f9b0be72d7bdff3843e8404cf3d48a19f27457b45c992cb6124e.
  Exact prepared bundle hash verified; staging left public catalog byte-identical.
  Atomic publication completed all 86 topics / 3,260 posts, cutoff
  2026-11-03T23:57:05.284Z, zero forum/model calls. Shared CPU staging produced
  intermittent health failures; low-priority publication completed but reporting
  lingered. Confirmed persisted completion, terminated report renderer with SIGTERM
  (143), waited for lock release, then applied authorized one performance CPU / 2 GiB
  to the same Machine/volume. A subsequent SIGKILL attempt did not run because the
  Machine was already restarting. Completed reports regenerated on performance CPU;
  Fly checks and public health now pass. No publication replay or database replacement.
  Browser checks and inspected screenshot show restored featured title/filters;
  public catalog has zero unavailable/privacy-review topics. Consistent snapshots
  preserve five accounts, all credentials/recovery/preferences and all old history.
  Strict personal comparison flagged one concurrent visit: last_visit and active
  advanced together at 05:54:21, cutoff became previous active; all other fields and
  twelve other personal tables identical. Separate exact activity review passed.
  Ten hidden posts remain redacted, schema 7, integrity/foreign keys valid. Startup
  Tigris backup after publication completed 05:54:17.880. Evidence work/audited-release-*.
  GitHub application push to 53986a3 succeeded; final CPU/docs push follows. Reviewed
  67b7f7c/b374b8e documentation and 73d5ce7 config/tests: no secrets, new network access,
  authentication/database changes or security issue. User verification remains pending.
- **D-126 — Prepare the next pull for review, without deployment.** User requests
  another pull and analysis while away, with the CSV and readable comparison ready
  on return before separately authorizing deployment. Use a private local copy of
  the verified post-publication snapshot, cutoff 2026-11-03T23:57:05.284Z, current
  frozen optimization policies and subscription model. Review newly discovered
  openings conservatively as in D-118/D-119; leave exclusions for user review.
  Produce preview and usage audit artifacts; no production writes, deployment or push.
  Preliminary anonymous feed count was 113 new public posts across 37 threads at
  2026-11-05T00:30:49Z; full histories and edits can increase the actual import work.
- **D-127 — Preview the completed pull on localhost.** User asks to view the
  prepared content locally. Stage and atomically publish the validated bundle only
  into a new copy of the previous localhost preview database, preserving its
  personal state. Start bounded localhost server on port 8001. Production unchanged.
- **D-128 — Publish the localhost-reviewed November 4 pull.** User authorizes
  deployment after reviewing localhost. Transfer the exact validated prepared bundle
  for run 9c351205-9ad9-4307-a5c0-7b61d0874de8, stage privately and publish atomically
  on the existing production database. Take consistent pre/post backups, verify
  personal state and historical preservation and live content. No fresh forum/model
  calls or replacement of the live database. Application code is unchanged since
  the prior deployed build; content publication does not require an image restart.
- **F-139 — Reviewed pull published and verified.** D-128 completed content
  publication at 2026-11-05T04:01:53.287Z: 107 topics / 3,553 posts / six accounts.
  Remote bundle hash matched, staging left catalog unchanged, all published catalog
  entries exactly match reviewed localhost. No image restart or new model/forum work.
  All 14 personal tables identical; all previous releases/renditions/source history
  preserved; integrity/FKs pass. Backup first failed with disk full. Removed only
  the three redundant transfer copies created for this deployment after local copies
  were validated; offsite retry succeeded at 04:04:14.400Z. Fly SSH container detection
  panicked twice; explicit --no-container succeeded. Health checks pass. Evidence
  work/pull-20261104-*. Reviewed authorization/documentation diffs: no secrets or
  security changes. User live verification pending; no GitHub push requested.
- **D-129 — Run a direct, pinned Cloudflare security audit.** User authorizes
  downloading Cloudflare's skill without skills.sh, Vercel CLI, npm installation or
  global skill registration, and auditing a clean source copy with accessible
  explanations. Pin upstream c1c8a8c1471069fb0e188eeaff69b8e8db6564a8 and record
  hashes. Keep audit/reference artifacts outside this repo, exclude credentials,
  private work and databases, and enforce isolation before executing validators or
  target code. Source-only review remains permitted when execution is unavailable.
  No production access, deployment, application fixes or GitHub push authorized.
- **D-130 — First audit pass uses Cloudflare quick profile.** As explained to the
  user, use four reconnaissance assignments, one hunter wave, one final coverage
  critic and independent candidate verification. This is explicitly partial coverage,
  not a comprehensive security certification. Pinned files/source/report workspace:
  /home/zenzcash/security-audit-zforum-20261105. Source snapshot is a289384; 178
  tracked files included, archived prototype and binary/database artifacts excluded.
  Hunters inspect source only; validators use a no-network read-only bubblewrap
  environment with bounded CPU, address space, process count and wall time. Initial
  pre-namespace process limit failed because host UID thread count exceeds 64;
  applying the same limit inside the new namespace succeeds. No limits relaxed.
  Reviewed a289384 authorization-only diff: no credentials or executable changes.
- **F-140 — Pinned Cloudflare quick source audit reported.** Saved direct upstream
  reference and clean a289384 source snapshot outside repo at
  /home/zenzcash/security-audit-zforum-20261105, with verified SHA256 manifests.
  Four recon reviewers, five hunters, final coverage critic and fresh candidate
  verifier produced 31 source checks across 65 files. Ledger: 13 covered, one
  independently disposed candidate, three deferred units. No application runtime
  tests; zero confirmed findings. One needs-validation lead: empty/bookmark-clear
  updates can allocate own-account state for nonexistent post keys; meaningful
  shared-resource impact is unproven, no severity assigned. Final independent review
  preserves authentication/rate controls, intended unavailable-bookmark retention
  and account-deletion cleanup. Three deferred lifecycle paths: persisted speech,
  topic merging and partial model repair/resume. Both Cloudflare validators pass
  inside the restricted read-only/no-network environment. Reports include exact
  limits, source evidence, coverage gaps and bounded next validation steps. No
  installation/dependencies, source fixes, production access, deployment or push.
  Reviewed e01f13e documentation diff: no secrets or executable changes. User review
  of report remains pending; workflow completion is not a security certification.
- **D-131 — Standard security audit with dependencies; no deployment contact.**
  User authorizes standard Cloudflare review and dependency advisory review, but
  explicitly prohibits touching actual deployment. Review deployment definitions
  exclusively from source: no Fly/SSH/cloud API, production endpoint, credentials
  or production database access, even read-only. Use pinned Cloudflare instructions,
  clean source snapshot, isolated offline dummy-data tests where enforcement is
  verified, multi-wave coverage review and separate independent candidate/final
  verification. Public advisory lookups are allowed for dependency review; no
  installer or dependency downloads for target builds. No fixes or push authorized.
- **D-132 — Explain audit outcomes for an amateur.** User emphasizes education as
  a key deliverable. Final report and response must explain what was tested, why it
  matters, what results actually demonstrate, what remains unknown and practical
  priorities in plain language. Separate demonstrated security failures, correctness
  or hardening improvements, dependency maintenance and unverified live facts.
- **F-141 — Standard source/local security audit reported for owner review.**
  Pinned Cloudflare reference c1c8a8c1471069fb0e188eeaff69b8e8db6564a8; reviewed
  immutable source 70188e0 at /home/zenzcash/security-audit-zforum-20261105/source-2.
  All 178 source hashes and reference hashes verified unchanged. Run-2 REPORT.md,
  FINDINGS-DETAIL.md, NEEDS-VALIDATION.md, findings/coverage/dependency JSON and metadata
  retain the evidence. Standard workflow used 21 invocations with no strict budget:
  four recon reviews, execution-boundary follow-up, dependency review, ten hunters,
  three coverage critics and separate candidate/final-record reviewers. First critic
  added a database-migration boundary; source and dummy failure/reopen checks closed
  it. Post-wave2 and distinct final critic accepted no further coverage work.
  Ledger: 20 covered, one candidate-history unit finally rejected, one out-of-scope
  live-deployment unit; zero blocked/deferred, 66 owned checks across 87 source paths.
  Zero confirmed and zero retained needs-validation security records. The earlier
  reading-clear hypothesis was independently reproduced with three dummy keys:
  only owner rows allocated, repeat idempotent, other account unchanged, deletion
  cleans up. Security claim rejected for absent demonstrated meaningful shared harm;
  retain correctness/hardening and reopen only with new bounded security evidence.
  Saved speech can replay previously public local text after restriction-only cold
  reload; no new unauthorized reader established. Privacy/correctness improvement.
  Public dependency review checked 209 unique Rust name/version pairs and 66 matching
  RustSec records. WebAuthn core 0.5.4 matches GHSA-22w3-693w-x895, fixed in 0.5.5,
  but required allow_subdomains setting is absent; recommend tested maintenance,
  not a confirmed application vulnerability. OS/native/image inventory incomplete.
  Offline bubblewrap tests produced 91 passing executions including one independent
  repeat; catalog suite failed to load missing generated site/data/zcg.json. Initial
  compiler-alternative resolution failed; naming existing GCC fixed the environment
  without installing packages or weakening assertions. All target execution used
  read-only inputs, isolated network, explicit environment, ephemeral scratch and
  resource/time limits; parent safely retained bounded logs. Both report validators
  pass. Accessible report explains boundaries, experiments, classification and limits.
  No actual deployment contact (even read-only), production data/credential access,
  model/forum calls, application fixes, dependency updates, installer or GitHub push.
  Only external audit artifacts and repo documentation changed. Prior documentation
  commits 70188e0/284fda7 reviewed: no executable changes or credentials. Workflow
  artifacts are ready; owner review/acceptance remains pending.

- **D-133 — Implement scoped medium-report recommendations locally.** User requests
  fixes from audit-01 plausible/medium after a plain-language explanation, delivered
  before changes. Clarification: account alerts are instructions for the owner only;
  do not access or configure provider accounts. Preserve existing analyses and keep
  hidden-context reuse invalidation deferred. Implement the remaining eight reports
  (including the two coordinated Markdown findings) in tested logical commits.
  No production access, publication, deployment or GitHub push. Alert guidance must
  distinguish provider-visible usage from local observations and detection from
  prevention. Existing accepted analyses must not be discarded or regenerated.
- **F-142 — Bound both Markdown recursion paths and contain post failures.**
  Eight-level parser limits cover quotes and inline emphasis/link nesting; overflow
  stays literal. Rendering errors remain visible and logged, with retryable expansion.
  Bulk/direct-link requests are separate from successful expanded state. Generated
  nesting cases include 50,000 quote markers and 10,000 emphasis pairs; DOM/excerpt
  checks preserve text and bound trees. Initial new fixture omitted required transform;
  corrected its invocation without weakening assertions after reporting the failure.
  Focused Node checks and bounded Chrome integration pass; desktop screenshot inspected.
  No content analysis, account, production, or provider configuration changed. Scope
  ledger a1e9979 reviewed: documentation only, no security concern. User verification
  and final cross-batch review remain pending.
- **F-143 — Async bounded passkey verification implemented locally.** Removed
  blocking process/poll/thread work under the application lock. A two-permit async
  supervisor cleans up children and pipe futures on completion, timeout, cancellation
  and output failures. Challenges remain consumed; finish rechecks expiry, current
  credential data/ownership and add-passkey session validity. Existing recovery
  transaction remains authoritative. Forty-six Rust tests, strict Clippy, debug build
  and real browser WebAuthn registration/login/add/recovery/revocation flow pass.
  New helper tests cover excessive/malformed output, nonzero exit, request size,
  ten-second timeout, saturation, cancellation, process reaping and permit reuse.
  Single-worker delayed-login tests reject replay/deleted account/deleted or changed
  credentials; concurrent health calls measured 0.094–0.238 ms locally, not production.
  Initial route fixture used a too-short dummy account ID; corrected after reporting
  failure; assertions retained. Markdown commit c630f70 security diff reviewed: bounded
  parsing, DOM text rendering and explicit errors preserved; no new concern found.
  No live deployment or account access and no accepted analysis changes.
- **F-144 — Efficient progress query/cache and account-read throttling.** Schema 8
  replaces both correlated latest-row scans with window ranks and adds supporting
  index/cache with transactional invalidation triggers for all feedback/clear/mood
  mutations and account deletion. Existing progress semantics match the original
  query, including multiple renditions, moods, clears and empty accounts. Query-plan
  checks use the supporting index without correlated scans. SQLite 3.50.2 debug
  benchmark, three renditions/post: 500/1000/2000/3260 cold calculations measured
  15.2/26.9/57.2/89.8 ms; cached means 8.3–11.6 us. Not production measurements or
  a strict complexity guarantee. Per-account 120/min /api/me limit and outside-lock
  serialization added. Full history bounding/read isolation remain current work.
  All 49 Rust tests, strict Clippy and debug build pass. Fixture failures exposed
  duplicate dummy rendition and old-schema reconstruction retaining schema-8 objects;
  both reported before corrections; old-row preservation assertions remain and new
  cache emptiness is asserted separately. Tools accept schema 8. No analyses changed.
  Reviewed 9203d30 security diff: no shell construction or secret logging; verifier
  permit/cleanup ownership and post-await account checks retained, no new concern.
- **F-145 — Bounded reading state and browser pagination.** Schema 9 cleans only
  all-false rows and retains 64 latest device visits; 50,000 reading-entry quota
  preserves updates/removals and existing meaningful unavailable state. DB write path
  enforces visibility/empty-patch semantics transactionally. /api/me and personal
  write responses no longer contain reading history; reading write returns one entry.
  Indexed 200-entry keyset pages support topic and bookmarked scopes. Browser loads
  topic history independently, merges pages with local-write precedence, and explicitly
  loads additional saved pages. Shared read allowance raised from 120 to 600/minute
  to accommodate legitimate pagination. No silent bookmark eviction or analysis work.
  Fifty-four Rust tests, strict Clippy, 43 focused Node tests and Chrome integration
  pass. Real browser seeded 220 additional unavailable bookmarks, checked 200 then
  221 loaded entries and disappearance of Load more; inspected pagination screenshot.
  Oversized 50,001-entry fixture returned 200 rows / 8,802 bytes in 0.625 ms locally.
  Migration/reopen checks preserve meaningful hidden/missing state; API tests verify
  bounded account/history responses and nonexistent clear no-ops. Updated an incorrectly
  transcribed expected bookmark flag after reporting the failing test; assertions now
  check both exact flags. Read workload isolation remains in the next content batch.
  Reviewed 3546e7f: parameterized account filters, transactional cache invalidation and
  account-specific throttle preserved; no new security concern identified.
- **F-146 — Lightweight listings and independent read workers.** Schema 10 maintains
  publication/rollback metadata without regenerating analysis. Browser startup and
  directory navigation request only listings; per-topic content loads on navigation
  and current-topic refresh, with scoped ratings/feedback. Full-corpus helper exists
  only as a test oracle. Eight bounded SQLite workers perform heavy reads/serialization
  outside the app mutex; cancelled requests retain slots until worker completion.
  Fifty-six Rust tests, strict Clippy, 39 focused Node checks and Chrome pass; screenshot
  inspected. Actual listing statistics match original JS calculations exactly. Corrupting
  an unrelated release leaves listing/current-topic reads intact. Saturation returns
  503 while health measured 0.155 ms on a single runtime thread. These are local results.
  Tests exposed a wrong restriction fixture column and asynchronous navigation redraw
  cancelling an animation; reported before fixing, assertions retained. Navigation now
  completes reads before showing controls and rejects superseded responses. Full-content
  validation remains in the offline grouping tool. Reviewed eb76331: account-scoped
  history reads and bounded storage preserve meaningful state; no new concern found.
  Existing analyses and provider accounts unchanged. User verification remains pending.
- **D-134 — Preserve historical analysis identities while hardening new requests.**
  D-133 requires no discarded/regenerated analyses. Retain the old view serializer
  solely to reconstruct historical artifact hashes, with explicit frozen-format
  selection. New snapshots/jobs use structured input; every actual model invocation,
  including resumed old runs and retries, passes the structured serializer. Historical
  prompts/rubric hashes and retained-analysis provenance stay unchanged. Record actual
  request hashes separately as before; no behavioral model eval is claimed without
  running one. This is a compatibility exception required by the user's preservation
  instruction, not a second input format for new model calls.
- **F-147 — Structured model input with preserved accepted artifacts.** Initial job,
  refresh/import, bounded reply context and retry calls now use one JSON envelope.
  Targets are explicit; quote claims have available-source matching status; previous
  summaries and retries remain data. Fresh checked random delimiters are reading aids,
  not a security boundary. New snapshots carry the format; historical serialization
  is hash reconstruction only. Fifty focused Node tests pass, including hostile
  fields, line endings, quotes, hidden records, context, retries and retained analyses.
  All 11 existing accepted results match their original view hashes reconstructed
  from the local built corpus. No accepted result or rubric/prompt file was changed.
  Two older refresh tests cannot run: archived manifest.json is absent in this
  checkout and the searched original checkout; no substitute fixture was fabricated.
  An incomplete new test expectation was corrected after reporting it, to assert
  full original quote attribution and body. No behavioral model evaluation was run.
  Security review of ade4c10: SQL values parameterized, visibility snapshot retained,
  bounded permits outlive cancelled reads; no new concern found. ae0df2a is a scope
  record only. Operator-review and account-alert guidance remain active work.
- **F-148 — Structured human review and enforced publication evidence.** Labelled
  complete JSON packets/previews expose control/bidi/invisible characters without
  changing source values. Discovery scans full available openings; later/final scans
  cover full fetched bodies, quotes and staged candidate text. Versioned heuristics
  record coverage/offsets and bounded escaped excerpts. Only findings create a report;
  clean complete scans remove stale reports and need no acknowledgment. Findings
  require a human interactive acknowledgment, with exact digests and audit history.
  Scan regeneration invalidates it. Missing/stale/incomplete evidence blocks imports,
  refresh publication, production wrappers and direct publish/publish-import/merge.
  Rust validates exact file bytes and current scan/report/ack before opening the DB.
  Direct-file review supports existing analyses without rerunning them. The review
  boundary does not defend against an administrator rewriting files or the database.
  Schema 11 records exclusion reversals and prior decisions atomically; reinstated
  untracked threads enter the next full import even before the activity cutoff.
  Strict Clippy, debug/release builds, 56 Rust tests, browser and real WebAuthn flows
  pass. Broad Node run: 195/197 pass; the only two failures require the absent archived
  snapshot manifest. Integration tests exercise actual server CLI refusal/acceptance,
  tampering, stale reports, acknowledgment, publication blocking and reversal discovery.
  Updated the old excerpt-field assertion after reporting its failure; packet bounds
  unchanged. Reviewed 88f98b5: canonical string serialization, ownership and targets
  retained; historical serializer is not used for model requests. No new concern found.
  No live publication, provider account changes, accepted-analysis edits or model calls.
- **F-149 — Resolve measured concurrent cache-write contention.** Final review added
  an eight-reader cold-cache test; it reproduced SQLite database-is-locked errors after
  valid progress calculations. Reported before fixing. Cache-only busy/locked inserts
  now roll back and return the computed read snapshot; stale cache writes are not
  retried, and other errors still surface. The concurrency fixture has a nonzero head
  mean; a trigger-induced cache failure proves non-contention errors remain visible.
  Full 57-test Rust run plus the added error test, all four progress tests, strict
  Clippy and debug build pass. Schema/accepted analyses unchanged. Security review of
  18d190e: structured untrusted display, parameterized reversal transactions, exact
  publication byte checks and candidate/report acknowledgment binding verified; no
  new concern found. Workflow evidence assumes trusted operator filesystem access.
  Deterministic corpus rebuild was attempted and fails on the same missing archived
  manifest as the two Node tests; no input or accepted analysis was fabricated/replaced.
- **F-150 — Owner alert guidance and final handoff.** README explains supported
  Codex usage views and local telemetry/expiring work-window detection, GitHub Mobile
  authentication prompts/security-log review, Google security notifications and Fly's
  documented lack of customer-facing organization audit logs. Official sources checked;
  no universal away-period/token-use/login-attempt alert is claimed. No provider
  settings, credentials, notification destinations or services were changed. Guidance
  is detection only and does not implement the deferred sandbox redesign. Handoff now
  records implemented commits, schema/API/publication changes and missing-snapshot
  verification limits. Reviewed b4ae685: rollback on cache-only contention preserves
  read results without caching stale means; other errors remain visible. No new concern.
  Issues are not closed: user/expert verification and separately authorized deployment
  remain outstanding. Existing analyses and the hidden-context reuse policy preserved.
  Final aggregate Rust run: 58/58 passing; final release build and diff check pass.
- **D-135 — Integrate and verify the sister checkout's audit fixes.** User authorizes
  the recommended integration steps after explanation of schemas 8–11 and browser/
  server API changes. Import the 12 committed changes through 9fececf from the local
  zforum-fixes repository with Git history intact; preserve this checkout's databases,
  credentials and import/model artifacts. Review changes, rebuild/test in this checkout,
  rehearse migration on a disposable copy of an existing local snapshot and verify
  meaningful personal state and analyses. Investigate the missing archived fixture
  using existing local sources, never invent content or rerun analyses. Prepare a
  coordinated browser/server deployment and database-aware rollback procedure.
  Clarification of live deployment/GitHub scope is pending; meanwhile no production
  contact or push. Integration and tests are authorized independently. Preserve the
  deferred hidden-context policy and owner-only alert setup. User verification of
  fixes remains required before closing audit issues.
- **D-136 — Conditional deployment and GitHub authorization.** User clarifies that
  successful tests authorize coordinated Fly deployment and GitHub push. If tests
  reveal issues, report the exact failures/questions and wait for the user's response
  before deployment. Continue independent integration, review, local tests and migration
  rehearsal. A known missing-fixture failure is still an issue under this condition;
  do not silently waive it. No new forum pull or model analysis is authorized.
- **F-151 — Sister fixes integrated and migration rehearsed; conditional deployment held.**
  Recorded scope in da04b8d then merged 12 sister commits through 9fececf as 6d2b188.
  Only ledger append conflicted; preserved both histories and all entries. Source tree
  exactly matches sister checkout except integration ledger. Security review of merge:
  bounded verifier lifecycle/post-await checks, account-scoped parameterized SQL,
  structured source records and exact publication evidence retained; no new issue found.
  Offline debug/release/helper builds, strict Clippy and 58 Rust tests pass. Broad Node
  tests: 195/197 pass; two fail before execution on absent archived crawl manifest.
  Legacy rebuild independently reproduces that ENOENT. Runtime smoke, Chrome general
  UI/history pagination and real WebAuthn ceremonies using disposable virtual authenticators
  pass; screenshots inspected. Migration of a COPY of local after-pull-20261104.sqlite
  from 7 to 11 passed, including reopen/integrity/FKs; all original table rows unchanged,
  six accounts/107 topics/3,553 posts and existing analyses preserved. All 107 new
  listing rows agree with original cards/metadata/statistics; HTTP listing 95,846 bytes.
  Source snapshot hash unchanged; local migration about 81 ms. Evidence in
  work/fixes-integration-*; rehearsal work/rehearsals/fixes-qFR4Wr/zforum.sqlite.
  User was asked whether missing-input failures could be excepted, and instead requested
  a history investigation and explanation. No exception, deployment or push authorized
  while these failures remain. No production contact, forum request or model call.
- **F-152 — Historical crawl was untracked and absent at transfer, not removed by fixes.**
  Searched full non-shallow Git history at original data/crawls and archived paths,
  all fetched GitHub branches and reflog-reachable object names. No manifest or crawl
  payload found. d952f72 initially ignored data/; b89f207 retained that ignore and
  2ac8198 moved it into archive/research-prototype/.gitignore. Archived HANDOFF states
  the 36 MB snapshot 20261031T215141Z is gitignored and does not survive rebuild.
  Original transfer ZIP contains source, work and generated site/data, no crawl payload.
  Commit 7560222 (Nov 2) explicitly recorded the same missing manifest and failing
  refresh/rebuild checks immediately after restoration. There is no evidence of a Git
  deletion; original environment loss time is unknown. The two tests exercise resume,
  cache identity, comparison/tamper rejection and three-worker deterministic assembly
  with recorded mock outputs. Both stop during input loading, not failed behavioral
  assertions. Original backup recovery or an explicitly approved self-contained test
  fixture change is needed; new fixtures would not establish historical rebuild identity.
- **D-137 — Make verification reproducible without untracked historical files.** User
  authorizes a safe durable fix for tests after the missing-crawl investigation. Use
  explicit committed fixtures and deterministic mock model responses; preserve resume,
  identity, tamper, concurrency and exact-output assertions, and verify sensitivity.
  Check other tests for ignored-input dependencies and run the normal gate in a fresh
  tracked-files-only checkout. Build required binaries before integration tests. Keep
  historical corpus reconstruction an explicit separate operation that fails loudly
  without its original inputs; do not fabricate the lost crawl or silently skip failed
  checks. No accepted analysis or production data may be regenerated/replaced. Record
  the distinction between fixture verification and historical rebuild provenance.
  D-136 conditional deployment/push authorization continues only after the revised
  reproducible checks pass; report new failures before changing expectations.
- **D-138 — Correct deterministic test setup after restored tests execute.** User
  approves controlling request-delimiter randomness only inside the serial/parallel
  test, retaining exact artifact equality and production randomness. Also approves
  changing parsed source text in the new corruption check, rather than only its raw
  copy, because historical serialization reads parsed segments. Diagnostic evidence:
  two requests differ only by DATA UUID; changing a segment changes the historical
  view hash. Browser and real passkey tests already pass using the retained fixture.
- **F-153 — Reproducible checks pass from a source-only tree.** Retained parsed public
  source from the generated handoff corpus as tests/fixtures/zcg-source.json (355 KB),
  containing only original thread/post source and public profile creation/status fields.
  Re-parsing matches original source_sha256; all 11 recorded view hashes match and
  accepted-result validation/reassembly equals the preexisting generated corpus object.
  No model output, production database or legacy HTTP-crawl artifact changed. Tests
  now use this explicit fixture; browser seed is assembled in disposable storage.
  Shared historical result validator exported without changing its behavior. Both
  gates build binaries before tests; deployment gate includes the complete normal gate.
  In fresh work/reproducible-clean-7livqt3m, with no ignored inputs or initial binaries:
  locked offline builds/Clippy, 198 Node tests, 58 Rust tests, runtime smoke, Chrome UI
  and actual WebAuthn ceremonies all passed. No skipped tests. Test-only fixed UUID
  preserves exact serial/parallel artifacts; explicit job completion checks prove
  out-of-order execution and one call per job. Removing canonical result sorting in
  the disposable source tree made the test fail; source restored byte-identically.
  Logs work/reproducible-*.log. No forum/model calls or production mutations. Fresh
  Fly status access succeeds; D-136 conditional deploy/push work can proceed after
  commit/security review and fresh live-data backup. User verification remains pending.
- **F-154 — Audit fixes deployed with preserved live data and pushed to GitHub.**
  Commit 7594326 security review found no new issue: source fixture has public posts
  and creation/status metadata only, hidden text remains null, test nonce mock restores
  its builtin/ESM binding and is excluded from Docker. No production auth change in
  the fixture correction. All staged executable source matched the tested clean tree.
  Predeploy backup exposed existing root-owned private import artifacts for run
  9c351205-9ad9-4307-a5c0-7b61d0874de8: 215 directories, 3,751 files, no symlinks.
  Corrected only that run's ownership to service UID/GID 10001, preserving modes/content.
  Backup retry succeeded, as did new-image startup backup at 2026-11-06T03:22:14.297Z.
  Fresh downloaded schema-7 DB hash matched remote; local copy work/fixes-live-before.sqlite.
  Rehearsal of that copy preserved all original rows and migrated to schema 11 in
  about 128 ms. Removed temporary remote transfer only after verified local receipt.
  scripts/fly-deploy passed from clean committed source, using the existing one Machine,
  performance CPU/2 GB and volume. New image digest
  sha256:d7ce30059332ce76da13ffd63a046fc95425d408cd028bd48eca8d8de464d0c3.
  Live DB integrity/FKs pass; all 29 tables match rehearsal by row counts/hashes:
  107 topics, 3,553 posts, six accounts. Health and new catalog/static assets pass;
  featured-topic response is byte-identical to before, no unavailable topics. No
  import, forum request, model call or analysis regeneration. Old image and fresh
  pre-migration local/offsite backup identities recorded in HANDOFF. GitHub main
  verified at 7594326 after non-force push. This documentation checkpoint follows;
  user verification and audit issue closure remain pending.
- **D-139 — Repair the reported post-deploy catalog load failure.** User reports
  "Invalid topic data in catalog" after release. That literal exists only in the
  prior browser code. Live Cloudflare responses cache JS for 14,400 seconds while
  /data/topics.json is no-store; a fresh-session test missed mixed cached client/new
  API versions. Repair deployment asset identity with a content-derived URL prefix
  covering the entire JS module graph and stylesheet, and noncached entry HTML.
  Add a warm-cache browser regression and build/HTTP boundary checks; retain strict
  catalog validation. No data migration, reimport, account reset or model work.
  Existing authorization covers testing, deploying and pushing the corrective fix.
- **F-155 — Cached-client failure reproduced and fix verified locally.** Live
  Cloudflare /js responses showed max-age=14400 and HIT while topic API was no-store.
  Error literal belongs to pre-ade4c10 catalog parser. Added content-derived runtime
  JS/CSS namespace and uncached entry HTML, preserving relative imports and strict
  API validation. Static serving remains confined to generated assets and named public
  files. Build tests cover determinism, changes to each input, added modules and missing
  entry references; HTTP tests cover cache headers, misses and traversal isolation.
  Chrome test reproduces exact reported error twice, confirms old modules loaded only
  once, then loads current topic cards without clearing cache. Screenshot inspected.
  199 Node tests, 58 Rust tests, Clippy/builds/runtime smoke, complete UI and real
  passkey ceremonies passed. Logs work/cached-client-{gate,browser}.log. Deployment
  wrapper now runs the complete gate including both Chrome checks before Fly changes.
  No database or model changes. User verification remains pending.
- **F-156 — Corrective release live; entire asset graph checked through Cloudflare.**
  Security review of a8f149d found no new issue: only generated public JS/CSS served
  under hashed paths, entry substitutions contain fixed hexadecimal hashes, traversal
  tests preserve database privacy, test proxy stays local and outside Docker. The
  deployment wrapper ran and passed all gates before Fly changes. Same Machine/volume,
  no schema migration. Startup offsite backup passed at 03:42:05.854Z with schema 11,
  107 topics, 3,553 posts and six accounts. New image digest
  sha256:89512f1905de8fdab805c4ab152f75036e691ee6163c6554a5774e58c8d2c8c0.
  Live HTTP checks through Cloudflare verified generated no-store entry HTML and all
  29 versioned assets byte-for-byte against source, immutable asset headers, no-store
  catalog, all 107 topics available and unchanged featured payload. Warm-cache recovery
  is tested in actual local Chrome; live browser connector was unavailable, so no
  live visual-check claim. Normal page reload advised. Evidence in
  work/cached-client-live-verification.json and deployment logs. No forum/model calls,
  database replacement or account reset. User confirmation remains pending.
- **D-140 — Prepare the next forum pull using the deployed audit protections.** User
  authorizes the pull after reviewing the changed workflow. Take a fresh consistent
  production backup and prepare fetch/analysis against a separate local copy, using
  the last completed full-import cutoff with the normal five-minute overlap. Preserve
  accepted analysis reuse and frozen-run resume. Review newly discovered threads with
  the user before applying inclusion/exclusion decisions. Scan source and candidates,
  surface findings and require the documented human-only exact-report acknowledgment
  where applicable. Prepare a reviewable candidate and local rehearsal; no live content
  publication, code deployment or GitHub push is authorized by this pull request.
  Production backup creation/download is authorized preparation, not a content update.
- **D-141 — Batch pull decisions and findings for final review.** User explicitly
  directs collecting all decisions/findings at the end and not blocking on questions.
  This supersedes D-140's intermediate new-thread confirmation: proceed conservatively
  with provisional inclusion, preserve source excerpts and decision reasons, and collect
  proposed exclusions/uncertainties in the final review packet. Continue independent
  fetch/analysis/preparation without questions. Do not impersonate human acknowledgment
  or bypass publication checks; any findings requiring it remain for final user review.
  No production content publication is authorized. The saved preparation token failed
  authentication; the existing Fly CLI login succeeded, with 610,664 KiB available on
  /data and ample temporary filesystem space. No forum/model calls yet.
- **F-157 — Pull interrupted by redundant full-history job allocation.** On status
  inspection, the fetch process had exited with V8's 2 GiB heap-limit error. It saved
  the complete thread-16488 snapshot (7,457 stream entries, 7,441 ordinary visible
  posts, 1,896,845 raw-text characters) before failure; one topic is fully checkpointed,
  121 remain pending. No model calls or publication occurred. The reply-reuse planner
  calls marksJobs for job definitions while discarding its full-history view per batch:
  hundreds of redundant copies are materialized before bounded contexts are selected.
  Actual selected contexts measured at no more than 36 posts for this snapshot.
  Necessary recovery: extract shared job-definition planning, avoid discarded views,
  preserve exact job identities/requests, add bounded-memory and equivalence checks,
  then resume from the saved snapshot. Do not raise host memory limits or refetch the
  completed snapshot. D-141 keeps the finding and scope decisions for final review.
- **F-158 — Remove discarded full-history views and verify recovery.** Shared
  marksJobDefinitions now supplies reply-reuse planning directly; full-context consumers
  keep marksJobs and its existing views. No batching/context/prompt/model changes.
  All 201 Node tests pass. Generated partition checks cover budgets/post caps/hidden
  posts; a 4,000-post planner passes in a 128 MiB heap. Restoring the old planner in
  a disposable tracked-source tree makes that exact regression fail with heap exhaustion.
  The real saved price-discussion snapshot plans 951 jobs/7,441 targets under a 256 MiB
  heap, peaking at 182,776 KiB RSS. Twelve old/new comparisons over both source formats
  and batch boundaries prove exact equality of job objects, sources, views and hashes.
  Evidence: work/pull-20261106-{memory-tests,memory-sensitivity,node-tests}.log and
  memory-equivalence.json. A diagnostic script initially passed null as the historical
  format and was correctly rejected; rerun with the documented omitted format passes.
  No production code deployment, model calls, source alteration or memory-limit increase.
- **D-142 — Limit price-speculation history to approximately the past year.** User
  explicitly excludes the full historical price-speculation thread and asks whether
  the data is already available. Saved thread 16488 has 7,441 ordinary posts; 94 were
  created on/after 2025-11-06T00:00:00.000Z. Retain those 94 in this draft, archive the
  unchanged full download, and persist this fixed per-thread starting date for future
  pulls so older posts are not reintroduced. Other threads keep their existing scope.
  No new fetch is needed for the trimmed snapshot. Stop the waiting analysis supervisor
  before it can run; allow independent fetch to continue, then amend this explicitly
  authorized scope consistently in settings, snapshot, draft DB and report before any
  model calls. Preserve source metadata and hashes for both original and scoped data;
  annotate model source with the history limit. No live publication or deletion.
- **F-159 — Fixed history cutoff implemented and tested.** New explicit
  threadHistorySince setting applies a creation-date floor before source storage/job
  planning. Thread 16488 starts at 2025-11-06T00:00:00.000Z; other topics are unchanged.
  Scope metadata reaches summary/reply source records, including exact retained post
  identities and unverified cross-boundary quotes. Generated boundary/hidden/source
  preservation tests and actual importer fetch/resume/later-pull tests pass. All 205
  Node tests pass (work/pull-20261106-scope-node-tests.log). The memory regression now
  also inspects the final serialized model request. All 950 untrimmed real reply
  requests were checked locally: max 37 context posts and 47,096 request characters,
  no model calls; evidence work/pull-20261106-request-context-verification.json.
  Current fetch still uses its already-frozen settings. Waiting analysis continuation
  was stopped before analysis; apply the separately prepared D-142 scope amendment
  under the import lock after fetch exits, then restart bounded analysis.
  User asked the endpoint: complete local fetch/analysis/validation plus one consolidated
  review packet; no publication/deployment without separate approval.
- **D-143 — Pause while the user changes pull parameters.** User explicitly says
  to hold. Stopped scoped continuation before terminating the active fetch, preventing
  scope amendment or analysis from starting. Downloaded snapshots/checkpoints remain.
  Scope code ff832e0 is committed/tested locally, but D-142's frozen-snapshot amendment
  has not run. Await the user's new parameters before resuming any pull/model work.
  No model calls, publication, deployment or push occurred. ff832e0 security review:
  strict ID/UTC setting validation, original post metadata retained, source labels and
  quote verification preserved; no executable-data path or new security concern found.
- **D-144 — Keep full history while limiting new-topic reply analysis to one year.**
  User replaces D-142's source-history truncation with a general import policy: fetch,
  summarize and display every publicly available post, but when first importing a topic
  individually analyze only posts from the preceding calendar year. Freeze that boundary
  from the import cutoff; retain it on later pulls so previously omitted old replies do
  not unexpectedly trigger analysis. Preserve existing accepted analyses. Old unassessed
  posts retain original text/quotes/links and an explicit dated/not-analyzed status, with
  no fabricated assessment, score, rendition or model provenance. Recent reply requests
  may still use relevant older posts as context; summaries receive the full history.
  Replace the unused threadHistorySince implementation; its source amendment never ran.
  Update planning/build/validation/publication, browser rendering/filtering/citations and
  audit reporting together; verify full-history summary, target cutoff boundaries,
  resume/reuse, source-only display and personal-state preservation. Keep the pull and
  model execution paused during this implementation; no production deployment or publish.
- **D-145 — Resume and finish after the new algorithm is verified.** User authorizes
  completing implementation/tests, then resuming the saved pull through analysis and
  local validation while away. Document all decisions/findings for one return review,
  without blocking questions. This ends D-143's pause once the new algorithm is ready.
  Preserve downloaded full histories; do not run obsolete D-142 trimming scripts.
  Live publication/deployment and human-only findings acknowledgment remain outside scope.
- **F-160 — Full-history display and one-year reply planning verified.** D-144 replaces
  the unused D-142 source trimming with new-topics-one-year-v1. Full source/summary
  coverage is unchanged; dated originals have explicit validated omission metadata,
  no model marks/provenance/rendition, and remain usable in citations, reading controls,
  selection/export, speech and personal state. Initial cutoff is frozen by calendar
  subtraction and survives resume/later pulls; prior accepted analysis is preserved.
  Grouped baselines retain per-post dated status. Candidate identities include the
  reply cutoff; audits/CSV expose dated counts outside model-job estimates.
  All 208 Node tests and 60 Rust tests pass; Clippy, debug/release builds and actual
  Chrome warm-cache/UI checks pass. Desktop/mobile dated-original screenshots inspected.
  Real saved price snapshot retains all 7,441 posts for the summary, with 92 individual
  targets / 12 batches and 7,349 dated originals at 2025-11-06T03:51:56.235Z. The earlier
  94 count used midnight; the new general policy uses the exact frozen import time.
  No model call in this verification. Planning peak RSS 164,844 KiB under 256 MiB heap.
  First new Rust rejection test expected a different chrono error string; exact assertion
  corrected to its measured rejection after reporting. First browser run used stale
  generated assets; browser setup now builds current assets, then full checks pass.
  Logs work/pull-20261106-window-{final-gate,final-node,browser-verified}.log and real
  planning JSON. Prepared the recorded full-source-preserving active-run amendment.
  New dated content requires this coordinated code release before live publication;
  no deployment or production publication has occurred.
- **F-161 — Revised saved pull resumed without source loss.** The D-144/D-145
  amendment added reply-window metadata to eight downloaded new-topic snapshots;
  before/after source hashes match, all 7,441 price posts remain, and no model call
  preceded amendment. Frozen run settings now match the tested policy. Remaining
  new-topic snapshots receive the cutoff through ordinary fetch. The bounded
  full-history continuation runs fetch, analysis, preview, prepared export and isolated
  staging rehearsal; it contains no production publish/deploy or acknowledgment action.
  Post-commit review of 0c92813 found no new security issue: omission metadata is
  strictly validated at browser/server boundaries, hidden sources stay hidden, source
  strings remain DOM text, and candidate identity includes the frozen cutoff. No new
  dependency, executable-data path, credential access or trust-boundary relaxation.
- **F-162 — First live summary revealed an ambiguous task-scope instruction.**
  Full fetch completed: 12,064 records / 12,053 visible posts across 122 topics;
  7,968 dated originals, 3,539 retained reply assessments, 86 retained summaries,
  and 126 fresh jobs. The first model attempt explicitly interpreted the shared
  “Analyze only target_post_ids” instruction as applying to summaries, whose target
  list is intentionally empty. Validation rejected zero points/questions; the next
  attempt produced a valid substantive summary. Paused the continuation and analysis
  before further model work. Correct the shared instruction to distinguish marks
  (only target IDs) from summaries (all visible records; target IDs unused), add a
  full-history/hidden-source prompt regression, and resume saved valid artifacts.
  Exact request hashes preserve provenance of both old and corrected instructions;
  source/job identities and accepted summaries/replies remain unchanged. Do not
  weaken output validation or discard failed/interrupted-attempt audit evidence.
  D-145 authorizes this necessary correction without an intermediate question.
