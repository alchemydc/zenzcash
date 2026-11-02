# Batch 005: explicit Zcash funding topic grouping

User request: combine forum threads 58515, 58566, 58571, 58610, 58611 and 58656 into
one topic. Suggested working title: "The future of Zcash funding". Use id `zcg` so the
existing Featured Topics selection applies. The title is a suggestion, not recorded user
approval of its exact wording.

The current database is the completed 35-topic MVP import, not the old four-topic demo.
Four requested threads are published individually; 58571 and 58610 were absent from the
24-hour discovery. Do not restore the old database or overwrite newer posts/account data.
Fetch those two explicitly, respecting forum visibility. Reuse checked post assessments
where the exact source still matches, preserving provenance and original assessment
context. Generate/validate one combined topic summary; avoid reprocessing unchanged
posts merely because membership changed. Any new/changed source needs checked analysis.

Publish the grouping atomically: remove superseded individual topic listings, retain
all original post identities and user data, and register the six-thread membership for
future imports. Keep other topics untouched. Preserve old thread-topic deep links where
possible. Back up first; test refusal/rollback and personal-data preservation. Verify all
six thread titles/source links and combined content in the running local UI. Document
actual model usage and checks in WORKLOG/HANDOFF; user acceptance remains pending.
