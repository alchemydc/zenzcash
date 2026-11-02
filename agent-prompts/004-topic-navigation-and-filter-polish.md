# Batch 004: topic navigation and filter polish

This batch implements the user's review of batch 003. It supersedes the age-band and
What's new controls in batch 003; unrelated account and content behavior stays intact.

- Provide Log out in authenticated header navigation, including individual topic pages.
- Replace account-age bands with a minimum-age slider in whole calendar months; zero
  means Any, unknown account dates remain included. Keep a precise numeric month input.
  Migrate saved settings explicitly to version 6; removed upper bounds/gaps cannot stay
  active invisibly. Map old age choices to their lowest selected minimum (empty -> Any).
- Preserve Highlights and author identities and new-point disclosure state across filter
  changes. Give each filter an accessible info button: hover/focus preview, click to pin
  explanation, Escape to dismiss. Keep focus and open state through re-renders.
- Add Expand all posts beside Collapse all posts. Expansion applies to the current
  combined/per-thread stream, including posts loaded later; filtered compact rows remain
  compact until explicitly shown, and forum-hidden posts remain unavailable.
- Replace the save star with an outlined/filled bookmark. Re-write feedback order is
  minus, zero, plus from left to right.
- What's new uses only trailing 1/3/7-day windows ending at the last successful forum
  pull, not wall-clock access or last visit. Show the pull timestamp and exact range
  adjacent to controls. Use existing checked point-first-appearance metadata; no fresh
  model call occurs on a filter change. Exclude hidden posts and timestamps beyond pull.
  If newer pulled data awaits analysis, explicitly say that counts cover checked data.
- Fix interest discovery: the four existing cards were all tagged with every interest.
  Provide reviewed primary-interest overrides in a maintainer-controlled configuration;
  future summary prompts should choose primary interests selectively. Retain multi-select
  OR behavior, show result count, and apply filters to both Featured and other topics.
- Add title-only keyword search and sorting by last forum-post timestamp or post count.
  Stable ties use topic id. Search/sort are directory UI state, not account preferences.
- Featured Topics is a manually ordered list of up to three topic ids, maintained in
  site/topic-curation.json through a validated local command. Feature ZCG only for now, as
  confirmed by the user (D-82); keep the other two slots empty. No
  reader-controlled global editing or new administrator authentication is introduced.
- Group identical re-write audit explanations once with their distinct source quotations,
  fixing the immediately preceding repetition report without changing accepted AI data.

Test filter semantics and preference migration; window boundaries and unchanged counts;
visible results and featured/search/sort interactions; disclosure persistence; info hover,
click, keyboard and Escape behavior; bookmark state; bulk expansion; logout; and mobile
layout. Keep original content, private data and historical analysis intact. Update SPEC,
HANDOFF and WORKLOG; restart the existing local server after a backup as already authorized.
