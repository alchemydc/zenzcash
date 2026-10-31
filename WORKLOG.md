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
