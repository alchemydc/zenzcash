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

// Current account feedback. Historical file feedback retains its original 0–10 scale.
export const FEEDBACK = [
  { id: "emotions", label: "Heart", question: "Did the neutral re-write help you maintain your emotional balance, compared to the original text?" },
  { id: "head", label: "Head", question: "Did the neutral re-write help you broaden your perspective, better than the original text?" },
];
export const FEEDBACK_IDS = FEEDBACK.map((item) => item.id);
export const FEEDBACK_MIN = -1;
export const FEEDBACK_MAX = 1;
export const REACTIONS = [{ score: 1, label: "+", meaning: "Helped" }, { score: 0, label: "0", meaning: "No change" }, { score: -1, label: "−", meaning: "This made things worse" }];
export const MOODS = [{ score: 1, label: "😄", meaning: "made me happy" }, { score: 0, label: "🙂", meaning: "no impact on mood" }, { score: -1, label: "😞", meaning: "made me sad" }];
