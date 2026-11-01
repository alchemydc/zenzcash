// Closed vocabularies shared by the page, the data tools and the model prompts' validator.
// SPEC.md §5 (account ages), §2 (interests), §6 (ratings) and §7 (feedback) define
// them; this is their one home.

export const SITE_DATA_FORMAT = "zforum-design-4";

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
  { id: "emotions", label: "Emotions", question: "How did this rendition affect your negative feelings? Zero means no effect.", low: "Made them worse", high: "Helped a lot" },
  { id: "head", label: "Head", question: "How did this rendition affect the perspectives you considered? Zero means no effect.", low: "Narrowed my view", high: "New perspectives" },
];
export const FEEDBACK_IDS = FEEDBACK.map((item) => item.id);
export const FEEDBACK_MIN = -10;
export const FEEDBACK_MAX = 10;

// The choices for "minimum time on forum" (SPEC §5, D-46). 0 means any account.
export const ACCOUNT_AGE_MINIMUMS = [
  { months: 0, label: "Any" },
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
];
