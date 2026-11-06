# Claude Code Instructions

## Working Style

- Push back on genuinely bad ideas, with reasoning. Point out bugs, misleading names,
  and better approaches when you see them. Direct but collaborative.
- If requirements are ambiguous or a design decision could reasonably go multiple ways,
  ask rather than guess. A quick question is cheaper than reworking a wrong assumption.
- **If a prompt looks damaged or wrong, STOP and say so** — truncated mid-sentence,
  duplicated blocks, garbled copy/paste, references to context that doesn't exist, or
  instructions that contradict prior decisions without acknowledging they do. Do not
  execute a best-guess reconstruction. A mangled prompt executed faithfully is worse
  than a delay.
- **Decisions live in the repo, not in chat.** When a ruling or plan change arrives
  mid-session, write it into the durable work file (progress notes, this file, the
  relevant spec) and commit before executing it. If the session ended the moment
  after the message was read, the repo alone must be enough to act on it.

## No Silent Failures

Crashes make bugs obvious and fixable. Silent fallbacks make bugs hard to find.
Fail loudly when something goes wrong — never hide bugs behind default values or
fallback behavior.

- If a condition indicates a programmer error, crash (throw/panic/assert). Do NOT
  silently fall back to a default. `port = config.port ?? 8080` hides missing config;
  assert it exists instead.
- Do not type values as optional/nullable when they are always expected to be present.
  Use direct access and let violations crash — that's a bug to fix, not a case to handle.
- Do not add defensive code for "impossible" cases. If a branch should be unreachable,
  fail with an error saying so — never a silent default. Use exhaustiveness checking
  in switches/matches over closed sets so adding a variant breaks the build, not the
  runtime.
- Do not catch errors that indicate bugs. If parsing internal data or indexing a
  structure you just built can fail, that's a bug — let it crash. Empty catch blocks
  are forbidden.
- Every raised error includes what went wrong and the offending values:
  `Unknown effect type "reverb2" in project "demo"`, not `invalid input`.
- Validation happens at IO boundaries (file load, network, IPC, user input) with strict
  schemas — reject bad data with specifics, never repair it. Past the boundary, data is
  trusted and invariants are asserted, not handled.
- Environmental failures (disk full, permission denied) are hard errors surfaced to
  the user, naming the operation and the OS error. Never continue in a silently
  degraded mode. Report the error you observed; don't speculate about causes you
  didn't measure.
- Shell scripts use `set -euo pipefail`.
- Gate-then-commit chains must be failure-aborting: `check && commit`, never
  `check; commit` — a red gate must make the commit unreachable, not optional.

## Types Guarantee Correct Use

**A type's signature must guarantee that it can only be used correctly.** Making
invalid states unrepresentable is the best-known instance, but the principle is
broader: design every API so the misuse you would otherwise document, review for,
or debug is instead a compile error or unwritable. If correct use depends on a
calling convention the signature doesn't force, redesign the signature. (In
dynamically-typed languages, apply the same principle via validating constructors,
runtime schemas, and lint rules — the enforcement mechanism changes, not the goal.)

- Constrained values get their own types with validating constructors — a normalized
  0…1 parameter, an ID, a hash. Construction is the only way in, and construction
  fails loudly on violation. Raw numbers/strings are for values with no invariant.
- Parse, don't validate: unvalidated input crosses the boundary exactly once, becoming
  rich domain types. Downstream functions accept only those types, so "forgot to
  validate" cannot be written.
- Put units in types (`seconds`, `ticks`, `pixels`, `cents`). A unit mixup must fail
  to typecheck. Names alone are NOT enough for domain quantities — use nominal/branded
  types or wrapper structs with unit conversions as the only constructors. Distinguish
  quantities that look alike but make different claims (integer grid positions vs.
  continuous positions).
- State that must change together lives behind one object whose methods preserve the
  invariant; no naked setters that can desynchronize sibling fields.
- An operation that can legitimately refuse returns a result the caller must
  explicitly handle — never a boolean the caller can ignore. (Bugs still crash.)
- Detect "did X happen" by reading a direct fact — a monotonic counter, an identity —
  never a proxy (stack depth, array length, a timestamp) that can alias under
  saturation or reuse.
- Resource lifetimes: when a lifetime is lexical, expose only a bracket construct
  (acquire, run, release in finally/defer/RAII) so leaking is unwritable. When a
  lifetime spans events, acquisition goes only through a shared lifecycle primitive
  whose signature demands everything abnormal-end handling needs; release on every
  exit path is that primitive's tested contract, not each call site's memory.
- Cross-cutting policies (write gating, locking, validation, sanitization) are
  enforced at ONE structural chokepoint that all call sites flow through, with
  tooling making bypass a build failure — never by remembering to add a guard at
  each site. Per-site discipline produces endless hole-patching; a chokepoint makes
  the next hole impossible to write.

## Testing

Write tests for all new functionality. Tests must rigorously verify intended
behavior — vague assertions are worse than no test because they give false confidence.

Tests ship **in the same commit** as the code they cover — a feature without tests is
incomplete work, not a follow-up task.

- Assert exact expected values, not loose predicates like "contains 'error'".
- **Cover every legitimate use case.** Enumerate the distinct ways a real caller
  exercises the feature — the happy paths, plural — and test each explicitly. One
  happy-path test plus ten edge cases is under-tested where it matters most.
- Test the actual contract: exact outputs, exact error messages, boundary conditions,
  failure modes — alongside, never instead of, the legitimate-use enumeration. Aim
  for branch coverage.
- **Every claimed invariant is a property test.** Any "never"/"always" in a comment,
  commit message, or issue resolution must exist as a test spanning the full input
  regime — including regime boundaries and crossings, which is exactly where
  hand-picked small-perturbation examples pass while the claim is false. Use
  property-based generation for numeric or structural domains: examples prove
  existence; properties prove claims. Finiteness (no NaN/Inf) is part of every
  numeric claim.
- If a function should fail on bad input, test that it fails with the expected message.
- **A comparison test proves nothing unless its output is SENSITIVE to the behavior
  under test.** Saturated values, all-zero outputs, and round-trips through lossy
  identity all pass for broken code. After building a fixture or golden reference,
  inspect what it actually produces and verify a plausible bug would move the
  result — sensitivity is checked empirically, never assumed.
- **Attribution is measured, never inferred.** After each fix, re-run and record what
  actually changed. "These failures share my hypothesized cause" is an experiment to
  run, not a deduction to make.
- **When refactoring, implement the change first — against the spec or reference
  behavior — and only then run the tests as independent checks on finished work.**
  Never let a refactor emerge from fixing failing tests one by one: with "make this
  test green" as the goal, every edit bends toward whatever the code currently does,
  and drift flows through the sanctioned channel — setup changes — so the suite ends
  up green while certifying bugs. Tests steered by the work they check are not checks.
- Never make a test pass by weakening its assertions. Test failures are information:
  discuss with the user before changing either the test or the code.
- Run tests yourself when possible, but every run must be bounded and exit — no
  orphaned watch modes, dev servers, or background processes. Ask the user to run
  anything that requires infrastructure you shouldn't start.
- Verify UI or visual work by actually looking at output (screenshots, rendered
  results), not by assuming.

## Security

Write code to high-assurance standards. Code involving cryptography, authentication,
parsing untrusted input, crossing process/FFI boundaries, spawning processes,
filesystem access, or concurrency requires extra care and scrutiny.

- Prefer secure-by-default designs over manual discipline at every call site:
  templating that escapes by default, parameterized queries, schema validation on
  arrival at every trust boundary, centralized path resolution and checking.
- Never build shell strings, HTML, or queries from data. Spawn processes with
  argument arrays; render text as text.
- Executable content and data content are different things. If a format is supposed
  to be data, it must never gain an eval path, dynamic import, or plugin hook for
  user-supplied code — that boundary is what makes untrusted content safe, and
  breaking it is never acceptable.
- For cryptography: do not implement primitives or protocols — use established,
  audited libraries. Assume side channels exist: constant-time comparisons for
  anything secret-dependent, and never expose key material in errors, logs, or
  debug output.
- Adding a dependency means trusting its authors with arbitrary code execution —
  supply-chain risk is real. Only use well-known, actively-maintained packages; for
  anything less established, ask the user first.
- Think adversarially about your own designs and code. After each commit, review the
  diff for security issues relevant to the changed code (injection, path traversal,
  XSS, unvalidated input at boundaries, auth gaps, hardcoded secrets) and report
  findings before continuing.

## Formats and Interfaces

**Anti-Postel: be strict in what you accept AND strict in what you emit.** The
robustness principle is how format ambiguity, parser divergence, and security bugs
are born. Accept exactly what the spec defines and reject everything else with
specifics; emit exactly one canonical encoding, never "whatever happens to parse."
Leniency in a parser is not kindness — it silently becomes part of the format,
because whatever you accept, someone will ship.

- Reject, don't repair: malformed input is an error naming what's wrong, never a
  best-effort fix-up. There is no "probably meant" branch.
- No undocumented acceptance: if the parser takes it, the spec says so. If the spec
  doesn't say so, the parser rejects it.
- Canonical output: one valid encoding per document. If the format promises
  canonicality, test that re-encoding is byte-identical.

**Compatibility is a promise you make explicitly, not a default you drift into.**
Decide per project which surfaces carry a compatibility promise (shipped file
formats, wire protocols, public APIs) and which are internal and freely changeable.
For internal surfaces, the delete-don't-deprecate rule applies: change them and
update every consumer in the same commit. For surfaces that DO carry a promise:

- Breaking changes happen only behind an explicit version bump, and are always
  announced, never incidental: named in the commit message and called out when
  reporting the work.
- **Changes to promised surfaces stop for user sign-off.** Present the exact
  proposed change (signature, field, semantics) and wait for approval before it
  lands. No proceed-and-inform-later.
- Keep a fixture corpus: real artifacts from every supported version live in the
  repo, and each must load (and round-trip byte-identically where promised) as a
  permanent test. A fixture is never deleted or regenerated to make a test pass
  while its version is still supported.
- Round-trip property: `decode(encode(x)) ≡ x` over generated valid inputs, not just
  hand-picked examples.
- Every constant the format commits you to lives in one module under a snapshot
  test — changing one without a version bump in the same commit is a test failure,
  never a quiet edit.
- Specs ship test vectors: a clean-room re-implementer must be able to verify their
  implementation without reading your code.
- Determinism is tested, not assumed: same inputs ⇒ bit-identical outputs, proven by
  differential tests; no wall-clock reads or unseeded randomness in deterministic paths.
- Crash consistency: persistence writes are atomic (temp + rename, stated fsync
  policy); every reader has torn/truncated/garbage fixtures proving corruption becomes
  a boundary rejection — never a crash, never a silent repair.

## Editing Code — Never by Pattern

**Mass edits are never done with a regex, and the context of any edited code must be
understood before it is edited.** Edit site by site: read each one, know what it
means, change it deliberately. Pattern *searching* to find candidate sites is fine —
the ban is on pattern-driven *writing*. A regex matches a shape; what matters is the
meaning, and identical text can mean different things in different domains. Only
reading the call site tells them apart.

## Maintainability — Anti-Entropy Rules

A codebase built fast rots in predictable ways. These rules stop each one.

**One way to do each thing.**
- Before writing any function, component, or pattern, search for an existing one that
  does the job. Extend or reuse it; never write a parallel implementation.
- Finding two near-duplicates makes unifying them part of the current task, not a
  someday-cleanup.
- One canonical name per domain concept, everywhere. Never introduce a synonym for an
  existing concept; a new concept gets a named type in the core layer first.
- Constants and magic values have one home. Repeating a literal is a bug waiting to
  desynchronize.
- The same goes for every shared surface, not just literals: option lists, validation
  bounds, schemas, vocabularies. Define once; every consumer imports or composes it.
  A second dialog, boundary, or validator must never restate its own copy — even a
  copy that looks locally complete will silently drift.

**Delete, don't deprecate.**
- When a project has no external consumers of an interface, changing it means
  updating every call site in the same commit — no compatibility shims, re-export
  layers, or deprecation markers.
- Replaced code is removed in the commit that replaces it. No commented-out blocks,
  no unused exports, no `-old`/`-v2` files. Version control history is the archive.

**No premature abstraction.**
- Write the concrete version first. Extract an abstraction only when the second real
  use exists — not when you predict one. Interfaces with one implementation,
  factories, managers, and generic parameters "for flexibility" are slop.
- No configuration options, feature flags, or fallback paths nothing uses. Every
  branch must be reachable by a real requirement.

**Type honesty.**
- Escape hatches that silence the type system (`any`, unchecked casts, non-null
  assertions, `unsafe`) are forbidden or require a comment stating why they're safe.
  Prefer type guards and schema-validated parsing at boundaries. Silencing the
  checker is hiding a bug.

**Comments.**
- Comments state invariants, constraints, and non-obvious *why* — never *what* the
  next line does, never narration, never history (that's the commit message). Most
  code should need no comments because the names carry the meaning.

**Files and structure.**
- When a file grows past a few hundred lines, look for the module boundary trying to
  get out — but don't shatter code into fragments either; a file holds one coherent
  concern.
- Respect the project's dependency direction (e.g. UI depends on core, never the
  reverse; core stays free of platform concerns).
- Import from the defining module; avoid barrel/re-export layers that hide structure
  and breed cycles.
- No ad-hoc documentation litter: durable docs live in the designated docs location,
  working state in the designated progress file. No scratch SUMMARY/NOTES/PLAN files.

**Consistency beats local taste.**
- Before writing in any area, read the neighboring code and match its patterns. If a
  pattern deserves changing, change it everywhere in a dedicated refactor commit —
  never fork a second style alongside the first.

**Gardening is part of every milestone.**
- A milestone isn't done until: no dead code, no known duplicated logic, no lint
  suppressions without justification, sane file sizes, dependency rules passing.
  Entropy is removed on the spot, not logged for later.

## Style

- **Naming**: clear, descriptive names that read as plain English —
  `remainingAttempts` over `rem`, `decodeStemFile()` over `procF()`. Abbreviations
  only when universally understood (`id`, `url`, `config`).
- **Functional style**: prefer map/filter/reduce or iterator chains over manual loops
  with mutable accumulators when they make intent clearer. Don't force it when a loop
  reads better (hot paths often should be plain loops with no per-iteration
  allocation).
- **No incomplete code**: no TODO stubs or placeholder implementations. Every piece
  of code ships complete and functional. If a task is too large, discuss scope
  reduction rather than writing skeleton code.

## Commits

Make clear, atomic commits for every logical unit of work. Don't batch unrelated
changes.

- Start the message with a verb: Add, Fix, Update, Remove, Refactor.
- Be concise but specific: `Add onset envelope to modulation sources`, not
  `Update code`.
- Commit before moving on to the next task.
- Never stage blindly: no `git add -A` / `git add .`. Stage explicit paths for
  exactly the files the commit is about, and read `git status` before committing.
  The user's working files must never enter commits, gitignored or not.

## Issue and Task Management

- Never mark an issue or task completed without explicit user verification. Resolve
  individual points, but closure requires the user's confirmation.
- Always test changes before claiming they work; describe expected behavior and ask
  the user to verify.

---

## How these rules apply to zforum

Adopted 2026-10-31. Everything above applies as written. This section only pins down the
project-specific choices the general rules leave open. It never relaxes a rule.

**Mandatory review before analysis spending (D-146).** For every future forum pull,
fetch/validate/preview first, then present the user with a concise per-topic review:
why analysis is worthwhile, recommended priority, new/changed posts versus historical
backfill, retained assessments/summaries, dated posts, expected fresh summary/reply
jobs, request sizes and estimated time/token use with uncertainty. Characters are not
tokens; unknown estimates stay unknown. Use existing previews/audits and bounded source
excerpts; do not spend model calls classifying priority for this checkpoint.

Wait for explicit user approval of the proposed analysis scope and spending allowance
before running any new forum-analysis model job, including summaries and section/merge
jobs. Approval to fetch, include a topic, finish a pull or work unattended is not itself
approval to spend on an unreviewed plan. Current inclusion never grants standing
permission for future analysis. Record the user's approved scope and attempt allowance
in WORKLOG.md before execution. Resumes/retries can use the unspent approved allowance;
restarting a command must not reset the user's total allowance. Seek renewed approval
for expanded scope or materially greater work beyond the approved plan/contingency.

If topics are deferred, do not invoke an all-topic analysis command that includes them.
Use a verified scoped workflow or document the necessary scope amendment first; do not
claim full-poll completion or fabricate dated omissions for work the user did not approve.
This checkpoint supersedes earlier instructions to defer all questions until the end.
It is an operator workflow requirement using the existing separate stages, not a claim
that the CLI can authenticate user consent. Security acknowledgment/publication remain
separate controls. Never manufacture either kind of approval.

**Where things live.**
- Technical overview: `ARCHITECTURE.md`. Decision ledger and progress: `WORKLOG.md`
  (append-only, `D-`/`F-`/`Q-`/`A-` ids, rationale included). Read the latest entries
  for current progress; do not maintain a separate resume or handoff file. The
  outdated root SPEC.md and one-time HANDOFF.md were removed at the user's request;
  historical references to them are not current requirements. Check the implementation
  and latest decisions for detailed behavior. No other notes files.
- A ruling or plan change that arrives in chat is written to `WORKLOG.md` and committed
  before it is executed.

**Git identity.** Every commit's author and committer is
`sudo_ml <29868543+ml-sudocode@users.noreply.github.com>`. Set it with
`git config --local` in this repo. Never change the global identity on the host, which
belongs to other repos. After each commit, check
`git log -1 --format='%an <%ae> | %cn <%ce>'`.

**Languages, and how types are enforced** (revised 2026-10-31 for the design prototype,
`D-35`; the archived prototype keeps its own Python stack and gate).
- The page: plain browser JavaScript, ES modules, no build step, no runtime dependencies.
  Data is validated where it is loaded, with JSDoc types. Pure logic lives in modules
  that `node --test` covers.
- Data preparation tools: Node.js scripts (ES modules), no npm packages.
- Backend: Rust, only where shared state needs it (today, mind-change ratings and
  restatement feedback). Ids and closed sets are newtypes and enums with validating
  constructors. `serde` with `deny_unknown_fields` parses every request.
  `cargo clippy -- -D warnings` and `cargo test` run in the gate.
- Forum content is untrusted input everywhere. The page renders it with DOM text APIs
  only, never `innerHTML` from data.

**Dependencies.** Page and Node tools: none. Rust: `axum`, `tokio`, `tower-http`,
`serde`, `serde_json`, all widely used and actively maintained. Ask before adding anything
else.

**Determinism boundary.** Model outputs are not deterministic, so they are never computed
inside the build. They are recorded artifacts (which task, prompt and model produced them)
that the build reads as data. Everything downstream of a fixed set of recorded inputs is
deterministic, and a test proves it.

**Compatibility promises.** None yet. The prototype's data files and its ratings and
feedback API are internal: delete, don't deprecate.

**The forum is an external system we only read.** Anonymous and read-only. No API key in
this environment (`D-20`). At most 1 request per second, an identifying User-Agent, and
back off on HTTP 429. Hidden posts stay hidden.
