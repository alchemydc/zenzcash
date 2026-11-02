# Batch 003: reading experience and simple feedback

The user approved implementation of the review discussion, including its final changes.
This file identifies the batch independently of the older handoffs.

- Header: Home, Topics, How to use, Sign in; authenticated readers get Profile and Saved
  posts separately. Home explains the purpose/origin (Zcon 7, Cancún, October 2026).
  Public impact statistics are deferred. Account/saved panels leave the reading column.
- Top-right Zamagotchi has ten illustrated appearances, changing facial expressions,
  stars instead of bulbs, and brief positive/negative reactions; respect reduced motion.
  Reserve space on mobile so neither pet nor player covers reading text.
- Reading controls at the top, with desktop side-by-side controls/results and a compact
  mobile disclosure. Multi-select exact tone bands (Bad/Moderate/Good), support bands
  (Low/Medium/High), age bands (under 6 months/6–12/1–3 years/3+ years/custom), and posts
  with/without re-writes. Any means every band. Unknown/unassessed values stay included.
  Preference is single-choice: Show me the re-write first (default) / Show me original
  text first. Stop applying removed contribution-type/unassessed/flag filters.
- Fold nonmatching posts to a single reason row with Show. Live matching counts replace
  the removed coverage panel. Assumption/reframing switches expose relevant quoted notes;
  explain the intentional absence of author blocking. Keep filters and results nearby.
- Name included threads beneath topic title. What's new precedes a prominent Topic
  summary with its overview visible and questions expandable. All threads (default)
  combines posts; By thread is optional. Newest first is default; Oldest first available.
- One post action row: Expand, Mark read/unread, Bookmark icon, Listen icon. Local times
  plus relative ages. Anonymous author reveal is reversible. Mind-change feedback is
  near the top. Why this rating? holds brief explanations and original evidence; remove
  repeated rubric/claim-audit/editor-analysis blocks from the reading UI.
- Every post offers 😄 made me happy / 🙂 no impact on mood / 😞 made me sad, changeable
  and clearable. Re-write Heart and Head feedback uses +1 / 0 / -1, not sliders. Heart
  asks about emotional balance compared with original; Head about broader perspective.
  Minus explicitly means made things worse. Unanswered is distinct from zero.
- Persist new ternary feedback separately from historical signed answers. Emotional pet
  state uses the latest mood or Heart answer for each post (one contribution per post);
  Head uses the latest answered re-write per post. Clearing removes that channel's
  contribution; no replay farming. Every newly committed nonzero answer animates briefly.
  The persistent expression follows aggregate emotional benefit; stars show positive
  perspective benefit, with zero stars when there is no positive benefit.
- Reader-facing copy consistently says re-write, never rendition. Internal immutable
  model/source schema names need not change merely for wording.
- Expert tools collapsed: exactly Listen to selected posts and Export selected posts.
  One original-source file plus one shared prompt works for chat AIs and NotebookLM.
  Optional Copy prompt uses the same text. Selection shortcuts: individual posts, current
  time window, thread, topic. Time-window selection is explicit and uses forum creation
  timestamps; changing the window doesn't silently mutate a selection. Preserve original
  text/links, split large files between posts, and disclose usernames in exports.
- How to use is problem-oriented and includes a separate selected-export walkthrough.
- No AI regeneration, paid provider calls, scheduled import, public stats, or deployment
  is part of this change. Preserve authentication, content restrictions and historical data.

Verify multi-select intersections, calendar boundaries, sorted merged streams/citations,
time-window selection, exact source exports, ternary feedback migration/ownership/counts,
clear/retry behavior, accessible tooltips, narrow layout, and account navigation.
