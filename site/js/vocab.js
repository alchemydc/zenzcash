// Closed vocabularies shared by the page, the data tools and the model prompts' validator.
// SPEC.md §5 (traits, account ages), §2 (interests), §6 (ratings) and §7 (feedback) define
// them; this is their one home.

export const TRAITS = [
  { id: "contempt", label: "Contempt", meaning: "insults, name-calling, sarcasm, mockery, shouting" },
  { id: "motives", label: "Questions motives", meaning: "attacks hidden motives or alleged conflicts instead of the argument" },
  { id: "repeats", label: "Repeats", meaning: "restates a point already made in the thread, adding nothing new" },
  { id: "unsupported", label: "Unsupported", meaning: "asserts facts or numbers with no source or reasoning" },
  { id: "one-sided", label: "One-sided", meaning: "argues one side without acknowledging any cost or counterpoint" },
  { id: "strawman", label: "Strawman/simplistic", meaning: "misstates the other side, or reduces the issue to a slogan" },
  { id: "no-content", label: "No content", meaning: "agreement or reaction with nothing to add" },
];
export const TRAIT_IDS = TRAITS.map((trait) => trait.id);

export const INTERESTS = [
  { id: "governance", label: "Governance" },
  { id: "protocol", label: "Protocol" },
  { id: "grants", label: "Grants" },
  { id: "developers", label: "Developer work" },
];
export const INTEREST_IDS = INTERESTS.map((interest) => interest.id);

// The Rust server (server/src/main.rs, `Level`) must list the same ids; a test checks it.
export const RATINGS = [
  { id: "dug-in", value: -1, label: "Dug me in", meaning: "Inflammatory; made me hold my old view harder" },
  { id: "no-change", value: 0, label: "No change", meaning: "Didn't move me" },
  { id: "new-light", value: 1, label: "New light", meaning: "Made me see something differently" },
  { id: "changed-mind", value: 2, label: "Changed my mind", meaning: "Flipped my position" },
];
export const RATING_IDS = RATINGS.map((rating) => rating.id);

// Restatement feedback (SPEC §7, D-50), for the zforum team only. The Rust server
// (server/src/feedback.rs, `Answers` and `SCORE_MAX`) must agree; a test checks it.
export const FEEDBACK = [
  { id: "emotions", label: "Emotions", question: "This restatement helped me avoid negative feelings.", low: "Not at all", high: "A lot" },
  { id: "head", label: "Head", question: "I got something out of this that I wouldn't have had if it wasn't restated.", low: "Nothing", high: "A lot" },
];
export const FEEDBACK_IDS = FEEDBACK.map((item) => item.id);
export const FEEDBACK_MIN = 0;
export const FEEDBACK_MAX = 10;

// The choices for "minimum time on forum" (SPEC §5, D-46). 0 means any account.
export const ACCOUNT_AGE_MINIMUMS = [
  { days: 0, label: "Any" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
];

export const MATURITY_MIN = 1;
export const MATURITY_MAX = 10;

// 1–3 red, 4–6 amber, 7–10 green (SPEC §5).
export function maturityBand(score) {
  if (!Number.isInteger(score) || score < MATURITY_MIN || score > MATURITY_MAX) throw new Error(`maturity score must be an integer ${MATURITY_MIN}–${MATURITY_MAX}, got ${JSON.stringify(score)}`);
  if (score <= 3) return "low";
  if (score <= 6) return "mid";
  return "high";
}
