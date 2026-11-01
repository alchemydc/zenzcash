// Everything the page decides, as pure functions over the site data and the reader's
// settings. No DOM here; tests/logic.test.mjs covers it under node.

import { ACCOUNT_AGE_MINIMUMS, FEEDBACK_IDS, FEEDBACK_MAX, FEEDBACK_MIN, INTEREST_IDS, RATING_IDS, RATINGS } from "./vocab.js";
import { FLAG_IDS, FUNCTIONS, flagLabel, TONE_PRESETS, SUPPORT_PRESETS, UNASSESSED_PRESETS } from "./rubric.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const RECENT_ACCOUNT_DAYS = 90;
export const SINCE_HOURS = [6, 12, 24];
export const POSTS_PER_LOAD = 20;

const time = (iso) => {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new Error(`not a timestamp: ${JSON.stringify(iso)}`);
  return value;
};

const allPosts = (topic) => topic.threads.flatMap((thread) => thread.posts);

// Anonymous mode numbers the topic's authors by first appearance: author -> 1, 2, 3…
export function participantNumbers(topic) {
  const numbers = new Map();
  for (const post of allPosts(topic)) if (!numbers.has(post.author)) numbers.set(post.author, numbers.size + 1);
  return numbers;
}

export const pseudonym = (number) => `Participant ${number}`;

// Replaces @mentions of the topic's participants with their stand-in names. Like Discourse,
// a mention starts at a word boundary (so email addresses are left alone), is
// case-insensitive, and stops at characters a username cannot hold.
export function maskMentions(text, numbers) {
  const byLower = new Map([...numbers].map(([author, number]) => [author.toLowerCase(), number]));
  return text.replace(/(?<![\w@])@([A-Za-z0-9_.-]*[A-Za-z0-9_])/g, (mention, username) => {
    const number = byLower.get(username.toLowerCase());
    return number === undefined ? mention : `@${pseudonym(number)}`;
  });
}

export const shortDate = (iso) => new Date(time(iso)).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).concat(" UTC");

// How many posts of a thread must be on the page for the post at `index` to be there, given
// that `shown` already are. Posts load in whole batches.
export const shownToReach = (index, shown) => Math.max(shown, Math.ceil((index + 1) / POSTS_PER_LOAD) * POSTS_PER_LOAD);

export function topicStats(topic, snapshotAt) {
  const posts = allPosts(topic);
  const accounts = new Map(posts.map((post) => [post.author, post.account]));
  const ages = [...accounts.values()].filter((account) => account.created_at !== null).map((account) => (time(snapshotAt) - time(account.created_at)) / DAY_MS).sort((a, b) => a - b);
  const middle = Math.floor(ages.length / 2);
  const medianDays = ages.length === 0 ? null : ages.length % 2 === 1 ? ages[middle] : (ages[middle - 1] + ages[middle]) / 2;
  return {
    threads: topic.threads.length,
    posts: posts.length,
    participants: accounts.size,
    medianYears: medianDays === null ? null : medianDays / 365.25,
    joinedRecently: ages.filter((days) => days < RECENT_ACCOUNT_DAYS).length,
    unknownAge: accounts.size - ages.length,
    lastPostAt: posts.map((post) => post.created_at).sort().at(-1),
  };
}

// Whole days from account creation to the snapshot, or null when the profile is hidden.
export function accountAgeDays(account, snapshotAt) {
  return account.created_at === null ? null : Math.floor((time(snapshotAt) - time(account.created_at)) / DAY_MS);
}

export function accountAgeLabel(account, snapshotAt) {
  const days = accountAgeDays(account, snapshotAt);
  if (days === null) return account.status;
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} on the forum`;
  if (days < 730) return `${Math.floor(days / 30.44)} months on the forum`;
  return `${Math.floor(days / 365.25)} years on the forum`;
}

// Why a post is greyed out for this reader; an empty list means it is not. An account
// whose age is unknown (hidden profile) is never greyed for its age. In anonymous mode the
// reason does not state the age, which the page hides there.
export function greyReasons(post, settings, snapshotAt) {
  if (post.hidden) return [];
  const reasons = [];
  const { dimensions, tone_peak: peak, flags } = post.analysis;
  const tone = TONE_PRESETS.find((preset) => preset.id === settings.tonePreset);
  const support = SUPPORT_PRESETS.find((preset) => preset.id === settings.supportPreset);
  if (dimensions.tone.score !== null && dimensions.tone.score < tone.minimum) reasons.push(`tone ${dimensions.tone.score}/3 is outside “${tone.label}”`);
  else if (peak !== null && peak.score < tone.minimum && peak.severity !== "minor") reasons.push(`a passage (${peak.scope}, ${peak.severity}) has tone ${peak.score}/3`);
  if (dimensions.reasoning.score !== null && dimensions.reasoning.score < support.minimum) reasons.push(`argument support ${dimensions.reasoning.score}/3 is outside “${support.label}”`);
  if (dimensions.reasoning.score === null && settings.unassessed === "arguments_only") reasons.push("argument support is unassessed; you selected assessed arguments only");
  if (!post.analysis.function.some((kind) => settings.includedFunctions.includes(kind))) reasons.push(`contribution type (${post.analysis.function.map(flagLabel).join(", ")}) is outside your selection`);
  const days = accountAgeDays(post.account, snapshotAt);
  if (days !== null && days < settings.minAccountDays) {
    const minimum = ACCOUNT_AGE_MINIMUMS.find((choice) => choice.days === settings.minAccountDays).label;
    reasons.push(settings.anonymous ? `the account is newer than your minimum of ${minimum} on the forum` : `${accountAgeLabel(post.account, snapshotAt)}, below your minimum of ${minimum}`);
  }
  for (const code of new Set(flags.map((flag) => flag.code))) if (settings.filteredFlags.includes(code)) reasons.push(flagLabel(code));
  return reasons;
}

export function issueCoverage(topic, settings, snapshotAt) {
  const posts = allPosts(topic).filter((post) => !post.hidden);
  return topic.issues.map((issue) => {
    const cited = new Set(topic.points.filter((point) => issue.points.includes(point.id)).flatMap((point) => point.cites));
    const sources = posts.filter((post) => cited.has(post.key) || post.analysis.issue_ids.includes(issue.id));
    return { id: issue.id, label: issue.issue, total: sources.length, matching: sources.filter((post) => greyReasons(post, settings, snapshotAt).length === 0).length };
  });
}

export function unmatchedArguments(topic, settings, snapshotAt) {
  const matching = new Set(allPosts(topic).filter((post) => !post.hidden && greyReasons(post, settings, snapshotAt).length === 0).map((post) => post.key));
  return topic.points.filter((point) => !point.cites.some((key) => matching.has(key)));
}

// The moment "what's new" counts from, or null when there is nothing to compare with.
export function sinceCutoff(since, snapshotAt, lastVisit) {
  switch (since.kind) {
    case "none": return null;
    case "hours": return new Date(time(snapshotAt) - since.hours * HOUR_MS).toISOString();
    case "last-visit": return lastVisit;
    default: throw new Error(`unknown "since" kind ${JSON.stringify(since.kind)}`);
  }
}

export function whatsNew(topic, cutoff) {
  if (cutoff === null) return { posts: new Set(), threads: [], points: [] };
  const after = (iso) => time(iso) > time(cutoff);
  const threads = topic.threads
    .map((thread) => ({ id: thread.id, title: thread.title, count: thread.posts.filter((post) => after(post.created_at)).length }))
    .filter((thread) => thread.count > 0);
  return {
    posts: new Set(allPosts(topic).filter((post) => after(post.created_at)).map((post) => post.key)),
    threads,
    points: topic.points.filter((point) => after(point.first_at)).map((point) => point.id),
  };
}

// counts: {ratingId: n} for the ratings this post has received (absent ids count as 0).
export function ratingSummary(counts) {
  for (const id of Object.keys(counts)) if (!RATINGS.some((rating) => rating.id === id)) throw new Error(`unknown rating ${JSON.stringify(id)}`);
  const levels = RATINGS.map((rating) => ({ ...rating, count: counts[rating.id] ?? 0 }));
  const total = levels.reduce((sum, level) => sum + level.count, 0);
  const average = total === 0 ? null : levels.reduce((sum, level) => sum + level.value * level.count, 0) / total;
  return { total, average, levels };
}

export const formatAverage = (average) => `${average > 0 ? "+" : average < 0 ? "−" : ""}${Math.abs(average).toFixed(1)}`;

export const DEFAULT_SETTINGS = Object.freeze({
  anonymous: false,
  tonePreset: "all",
  supportPreset: "all",
  unassessed: "include",
  includedFunctions: FUNCTIONS,
  minAccountDays: 0,
  filteredFlags: [],
  preferredVersion: "neutral",
  flagAssumptions: true,
  showReframing: true,
  highlightNew: true,
  showRatings: true,
  since: { kind: "hours", hours: 24 },
  interests: [],
});

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).sort();

// Settings saved by this page in localStorage. Anything else is rejected with the reason,
// and the page says so rather than quietly guessing.
export function parseSettings(text) {
  const value = JSON.parse(text);
  const fail = (message) => {
    throw new Error(`saved settings are invalid: ${message}`);
  };
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("not an object");
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(SETTING_KEYS)) fail(`keys are ${keys.join(", ")}`);
  if (typeof value.anonymous !== "boolean") fail("anonymous must be true or false");
  if (typeof value.showRatings !== "boolean") fail("showRatings must be true or false");
  for (const [key, choices] of [["tonePreset", TONE_PRESETS], ["supportPreset", SUPPORT_PRESETS], ["unassessed", UNASSESSED_PRESETS]]) {
    if (!choices.some((choice) => choice.id === value[key])) fail(`${key} must be one of ${choices.map((choice) => choice.id).join(", ")}`);
  }
  if (!["neutral", "original"].includes(value.preferredVersion)) fail("preferredVersion must be neutral or original");
  for (const key of ["flagAssumptions", "showReframing", "highlightNew"]) if (typeof value[key] !== "boolean") fail(`${key} must be true or false`);
  if (!ACCOUNT_AGE_MINIMUMS.some((choice) => choice.days === value.minAccountDays)) fail(`minAccountDays must be one of ${ACCOUNT_AGE_MINIMUMS.map((choice) => choice.days).join(", ")}`);
  const idList = (list, allowed, name) => {
    if (!Array.isArray(list) || list.some((id) => !allowed.includes(id)) || new Set(list).size !== list.length) fail(`${name} must list distinct ids from ${allowed.join(", ")}`);
  };
  idList(value.filteredFlags, FLAG_IDS, "filteredFlags");
  idList(value.includedFunctions, FUNCTIONS, "includedFunctions");
  idList(value.interests, INTEREST_IDS, "interests");
  const since = value.since;
  const sinceOk = since !== null && typeof since === "object" && (
    (since.kind === "none" && Object.keys(since).length === 1)
    || (since.kind === "last-visit" && Object.keys(since).length === 1)
    || (since.kind === "hours" && Object.keys(since).length === 2 && Number.isInteger(since.hours) && since.hours >= 1 && since.hours <= 24 * 30));
  if (!sinceOk) fail(`since is ${JSON.stringify(since)}`);
  return value;
}

// Responses from the ratings and feedback API, checked where they arrive. `keys` is the set
// of posts the server may answer about.
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sameKeys = (value, expected) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

function postMap(value, keys, where, parseEntry) {
  if (!isPlainObject(value)) throw new Error(`${where}: expected an object, got ${JSON.stringify(value)}`);
  for (const [key, entry] of Object.entries(value)) {
    if (!keys.has(key)) throw new Error(`${where}: ${JSON.stringify(key)} is not a post this page knows`);
    parseEntry(entry, `${where}[${JSON.stringify(key)}]`);
  }
  return value;
}

function parseLevel(value, where) {
  if (!RATING_IDS.includes(value)) throw new Error(`${where}: unknown rating ${JSON.stringify(value)}`);
  return value;
}

function parseCounts(value, where) {
  if (!isPlainObject(value) || !sameKeys(value, RATING_IDS) || !RATING_IDS.every((id) => Number.isSafeInteger(value[id]) && value[id] >= 0)) throw new Error(`${where}: expected a count for each of ${RATING_IDS.join(", ")}, got ${JSON.stringify(value)}`);
  return value;
}

export function parseRatingsList(value, keys) {
  if (!isPlainObject(value) || !sameKeys(value, ["posts", "mine"])) throw new Error(`ratings: expected {posts, mine}, got ${JSON.stringify(value)}`);
  return { posts: postMap(value.posts, keys, "ratings.posts", parseCounts), mine: postMap(value.mine, keys, "ratings.mine", parseLevel) };
}

export function parsePostRatings(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["counts", "mine"])) throw new Error(`rating: expected {counts, mine}, got ${JSON.stringify(value)}`);
  return { counts: parseCounts(value.counts, "rating.counts"), mine: value.mine === null ? null : parseLevel(value.mine, "rating.mine") };
}

export function parseAnswers(value, where) {
  const isScore = (score) => score === null || (Number.isInteger(score) && score >= FEEDBACK_MIN && score <= FEEDBACK_MAX);
  if (!isPlainObject(value) || !sameKeys(value, FEEDBACK_IDS) || !FEEDBACK_IDS.every((id) => isScore(value[id]))) throw new Error(`${where}: expected {${FEEDBACK_IDS.join(", ")}}, each ${FEEDBACK_MIN}–${FEEDBACK_MAX} or null, got ${JSON.stringify(value)}`);
  return value;
}

export function parseFeedbackList(value, keys) {
  if (!isPlainObject(value) || !sameKeys(value, ["mine"])) throw new Error(`feedback: expected {mine}, got ${JSON.stringify(value)}`);
  return { mine: postMap(value.mine, keys, "feedback.mine", parseAnswers) };
}

export const noAnswers = () => Object.fromEntries(FEEDBACK_IDS.map((id) => [id, null]));
export const isUnanswered = (answers) => FEEDBACK_IDS.every((id) => answers[id] === null);
