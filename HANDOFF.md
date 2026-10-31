# Handoff — resume state

Written 2026-10-31, before a container rebuild. Everything needed to pick this back up.

## Read these, in order

1. `README.md` — one-line product goal.
2. **`SPEC.md`** — the specification (11 sections). The substance lives here.
3. **`WORKLOG.md`** — the decision ledger: main session plus two addenda. Every decision
   (`D-n`), finding (`F-n`) and open question (`Q-n`) with its rationale. Read the addenda —
   they *supersede* parts of the main entry (`D-9`/`D-12` retired by `D-14`; `D-19` revised
   by `D-20`).

Nothing of substance is only in the chat transcript; it is all in those two files.

## What survives a rebuild, and what does not

| Thing | Survives? | Action |
|---|---|---|
| `SPEC.md`, `WORKLOG.md`, `HANDOFF.md`, `tools/` | **only if committed** | ⚠️ **commit before rebuilding** |
| 367-post research dataset (was in `/tmp/.../scratchpad/forum-raw/`) | **no** | regenerate: `.venv/bin/python -m zforum.crawl --out data/crawls --topics 58515 58566 58571 58610 53554` (~1 min, no auth) |
| Container global git identity | no | re-apply, see below |
| Forum API key | n/a | was never in this container, deliberately — keep it that way (`D-20`) |

### Git identity to re-apply
```
git config --global user.name  'sudo_ml'
git config --global user.email '29868543+ml-sudocode@users.noreply.github.com'
```
Taken from the repo's root commit (`D-1`). The value it replaced was
`Taylor Hornby <taylor@defuse.ca>`, recorded here so the change is reversible.

### Tooling the container needs
`git`, `curl`, `jq`, `python3`. Nothing else was used.

## Current state

- Repo had one commit (`ab8138a`, README only). `SPEC.md`, `WORKLOG.md`, `HANDOFF.md` and
  `tools/` are **new and uncommitted**.
- No application code written yet. Phase **P0** is the next build step.
- Research is complete and documented; the forum does not need re-reading to proceed.

## The five decisions that shape everything

Full rationale in `WORKLOG.md`; this is the index.

1. **No API key, anonymous read-only ingest** (`D-2`, `D-19`, `D-20`). The gated surfaces are
   gated on *privilege*, not authentication, and anonymous access is not rate-limited —
   measured ~4 req/s, full backfill ≈25 min. A read-only non-staff key confers nothing.
2. **Build the claim digest first, not the filters** (`D-4`). One card per distinct claim,
   not per post. It is the precondition for everything else.
3. **Identity filtering ships as claim-aware collapse, not erasure** (`D-3`). Five rules;
   the load-bearing one is that the first appearance of any distinct claim is never
   collapsed, whoever makes it.
4. **Rewriting is tone-only; no generated arguments** (`D-14`–`D-18`). "Plain restatement."
   Where a post is missing something, cite the post that already supplies it — never
   synthesise one (`D-15`). Provenance is a hard gate, not a label (`D-16`).
5. **Narrow named signals, never "low quality"** (`D-5`). No public per-author scores, ever.

## Key technical facts (so they need not be rediscovered)

- Discourse `2026.11.0-latest`. 12,271 topics / 248,541 posts / 14,706 users.
- `/t/{id}.json` returns **only the first 20 posts** plus `post_stream.stream` (all ids).
  Full threads require batched `/t/{id}/posts.json?include_raw=true&post_ids[]=` — see `zforum/crawl.py`.
- **Prefer `/raw/{topic_id}/{post_number}`** for post text: original markdown, no auth, and
  its `[quote="user, post:N, topic:M"]` syntax carries the argument graph more cleanly than
  the `cooked` HTML asides.
- The argument graph is free: 37% of posts carry an explicit quote attribution, 74% carry
  `reply_to_post_number`.
- `/posts.json` is a 50-post forum-wide firehose — use it for incremental sync.
- Hidden/flagged posts return a placeholder anonymously and `/raw/` 404s on them, so the
  ingest layer inherits the forum's moderation decisions for free. Keep it that way.
- `robots.txt` permits everything the project needs.

## Next actions

- **A-0** — Commit the four new paths before rebuilding the container.
- **A-1** — `python -m zforum.crawl --out data/crawls --topics 58515 58566 58571 58610 53554`, then promote it to a committed fixture /
  gold-set seed.
- **A-2** — **P0:** ingest + quote/reply graph builder, no model. Per `D-8` (reuse
  `alchemydc/synapse` `types.ts`, MIT; rewrite the fetch logic — four changes listed in
  `SPEC.md` §8.2).
- **A-3** — Hand-label ~300 posts against the `SPEC.md` §3 taxonomy; publish per-signal
  precision/recall; tune for precision.
- **A-4** — **Still outstanding:** check the forum ToS before any public mirror (`Q-5`).

## Open questions
In `SPEC.md` §11 and `WORKLOG.md` (`Q-1`…`Q-9`). The two that most affect build order:
- `Q-6` — does annotation capture most of the value of prose restatement? If yes, P6 never
  gets built and the project avoids its largest reputational risk.
- `Q-9` — is "strip contempt intensifiers, keep confidence intensifiers" separable under
  adversarial phrasing? The riskiest assumption in §7; first thing the gold set should test.

## Standing risk
The rubric becomes a governance object, and whoever ships this is a participant with a stake.
The defence is verifiability, not claimed neutrality: published versioned rubric, open prompts,
open gold set, every label carrying its quoted span, local scoring, no public scores, right of
reply. `SPEC.md` §9 has the full list.
