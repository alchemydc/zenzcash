# Handoff — resume state

Updated 2026-10-31, session 3.

## Where things stand
- The first prototype is archived in `archive/research-prototype/` (`D-35`). It still runs
  from that directory: its test gate passes and its site builds. Its crawl snapshot (the 30
  days to 2026-10-31, which includes the six ZCG threads) and its receipt signing key are
  there too, gitignored.
- The new design comes from the recorded design conversation,
  `Oct-31-07-26-PM-zforum-spec-a1d3ae28-24b4.md` (the user's file, not committed).
- **Now:** the user is correcting our summary of that design. Nothing is built until they
  reply. The corrected summary becomes the new `SPEC.md`.
- **Next:** a simple design prototype of the ZCG controversy, as an HTML and JavaScript
  page with a Rust backend only if it needs one, to iterate on the design before the first
  real prototype is written.

## Before building
`CLAUDE.md`'s "How these rules apply to zforum" section describes the archived prototype's
stack (Python, receipts as a promised surface). Revise it for the new stack first.
