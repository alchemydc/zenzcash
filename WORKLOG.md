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
