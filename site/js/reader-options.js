export const TONE_BANDS = [{ id: "bad", label: "Bad" }, { id: "moderate", label: "Moderate" }, { id: "good", label: "Good" }];
export const SUPPORT_BANDS = [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }];
export const AGE_BANDS = [
  { id: "under6", label: "Under 6 months", min: 0, max: 6 },
  { id: "6to12", label: "6–12 months", min: 6, max: 12 },
  { id: "12to36", label: "1–3 years", min: 12, max: 36 },
  { id: "36plus", label: "3+ years", min: 36, max: null },
];
export const POST_VERSIONS = [{ id: "rewritten", label: "With re-writes" }, { id: "original", label: "Without re-writes" }];
export const READING_VERSIONS = [{ id: "neutral", label: "Show me the re-write first" }, { id: "original", label: "Show me original text first" }];
export const ids = (choices) => choices.map(({ id }) => id);
export const toneCategory = (score) => score < 2 ? "bad" : score === 2 ? "moderate" : "good";
export const supportCategory = (score) => score < 2 ? "low" : score === 2 ? "medium" : "high";
export function toggleChoice(current, id) { return current.includes(id) ? current.filter((value) => value !== id) : [...current, id]; }
