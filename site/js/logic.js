// Everything the page decides, as pure functions over the site data and the reader's
// settings. No DOM here; tests/logic.test.mjs covers it under node.

import { FEEDBACK_IDS, FEEDBACK_MAX, FEEDBACK_MIN, INTEREST_IDS, RATING_IDS, RATINGS } from "./vocab.js";
import { AGE_BANDS, POST_VERSIONS, TONE_BANDS, SUPPORT_BANDS, ids, toneCategory, supportCategory } from "./reader-options.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_ACCOUNT_DAYS = 90;
export const PULL_DAYS = [1, 3, 7];
export const POSTS_PER_LOAD = 20;

const time = (iso) => {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new Error(`not a timestamp: ${JSON.stringify(iso)}`);
  return value;
};

// Exactly the form Date#toISOString emits, so each instant has one accepted spelling.
export const isCanonicalTimestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

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

export const shortDate = (iso) => new Date(time(iso)).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
export function relativeDate(iso, now = Date.now()) {
  const seconds = Math.round((time(iso) - now) / 1000);
  const [unit, size] = Math.abs(seconds) < 60 ? ["second", 1] : Math.abs(seconds) < 3600 ? ["minute", 60] : Math.abs(seconds) < 86400 ? ["hour", 3600] : ["day", 86400];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(seconds / size), unit);
}

export const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
export const topicCountLabel = (stats) => `${countLabel(stats.posts, "post")} · ${countLabel(stats.threads, "thread")} · ${countLabel(stats.participants, "person", "people")}`;

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

export function calendarCutoff(iso, months) {
  if (!Number.isInteger(months) || months < 0 || months > 1200) throw new Error(`invalid calendar months ${months}`);
  const date = new Date(time(iso));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}
// Why a post is greyed out for this reader; an empty list means it is not. An account
// whose age is unknown requires explicit inclusion. In anonymous mode the
// reason does not state the age, which the page hides there.
export function greyReasons(post, settings, snapshotAt) {
  if (post.hidden) return [];
  const reasons = [];
  if(post.analysis!==null){
    const { dimensions, tone_peak: peak } = post.analysis;
    const tone = dimensions.tone.score === null ? null : peak !== null && peak.severity !== "minor" ? Math.min(dimensions.tone.score, peak.score) : dimensions.tone.score;
    if (tone !== null && !settings.toneBands.includes(toneCategory(tone))) reasons.push(`${toneCategory(tone)} tone`);
    if (dimensions.reasoning.score !== null && !settings.supportBands.includes(supportCategory(dimensions.reasoning.score))) reasons.push(`${supportCategory(dimensions.reasoning.score)} argument support`);
  }
  if (post.account.created_at === null && !settings.includeHiddenAge) reasons.push("profile age hidden · excluded by your account-age selection");
  if (settings.minAccountMonths > 0 && post.account.created_at !== null) {
    const joined = time(post.account.created_at);
    if (joined > calendarCutoff(snapshotAt, settings.minAccountMonths)) reasons.push(settings.anonymous ? "account age outside your selection" : `${accountAgeLabel(post.account, snapshotAt)} · outside your account-age selection`);
  }
  const version = post.analysis===null || post.analysis.neutral_rendition === null ? "original" : "rewritten";
  if (!settings.postVersions.includes(version)) reasons.push(version === "original" ? "no re-write" : "has a re-write");
  return reasons;
}

export function orderedPosts(topic, settings, threadId) {
  const posts = topic.threads.filter((thread) => settings.threadView === "all" || thread.id === threadId).flatMap((thread) => thread.posts);
  return posts.sort((a, b) => {
    const order = time(a.created_at) - time(b.created_at) || a.key.localeCompare(b.key, "en", { numeric: true });
    return settings.postOrder === "newest" ? -order : order;
  });
}

// A trailing window ending at the last successful forum pull, independent of access time.
export function sinceCutoff(since, pulledAt) {
  if (since.kind !== "pull-days" || !PULL_DAYS.includes(since.days)) throw new Error(`invalid pull window ${JSON.stringify(since)}`);
  return new Date(time(pulledAt) - since.days * DAY_MS).toISOString();
}

export function whatsNew(topic, cutoff, pulledAt) {
  const within = (iso) => time(iso) > time(cutoff) && time(iso) <= time(pulledAt);
  const visible = allPosts(topic).filter((post) => !post.hidden);
  const visibleKeys = new Set(visible.map((post) => post.key));
  const threads = topic.threads
    .map((thread) => ({ id: thread.id, title: thread.title, count: thread.posts.filter((post) => !post.hidden && within(post.created_at)).length }))
    .filter((thread) => thread.count > 0);
  return {
    posts: new Set(visible.filter((post) => within(post.created_at)).map((post) => post.key)),
    threads,
    points: topic.points.filter((point) => within(point.first_at) && point.cites.some((key) => visibleKeys.has(key))).map((point) => point.id),
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
  version: 7,
  anonymous: false,
  toneBands: ids(TONE_BANDS),
  supportBands: ids(SUPPORT_BANDS),
  minAccountMonths: 0,
  includeHiddenAge: false,
  postVersions: ids(POST_VERSIONS),
  threadView: "all",
  postOrder: "newest",
  preferredVersion: "neutral",
  flagAssumptions: true,
  showReframing: true,
  highlightNew: true,
  showRatings: true,
  since: { kind: "pull-days", days: 1 },
  interests: [],
});

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).sort();

// Settings saved by this page in localStorage. Anything else is rejected with the reason,
// and the page says so rather than quietly guessing.
function parseSettingsVersion(text, version = 7) {
  const legacy = version === 5;
  const value = JSON.parse(text);
  const fail = (message) => {
    throw new Error(`saved settings are invalid: ${message}`);
  };
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("not an object");
  const keys = Object.keys(value).sort();
  const expected = version === 7 ? SETTING_KEYS : SETTING_KEYS.filter(key => key !== "includeHiddenAge");
  if (JSON.stringify(keys) !== JSON.stringify(legacy ? expected.filter((key) => key !== "minAccountMonths").concat("ageBands", "customAge").sort() : expected)) fail(`keys are ${keys.join(", ")}`);
  if (value.version !== version) fail(`version must be ${version}`);
  if (version === 7 && typeof value.includeHiddenAge !== "boolean") fail("includeHiddenAge must be true or false");
  if (typeof value.anonymous !== "boolean") fail("anonymous must be true or false");
  if (typeof value.showRatings !== "boolean") fail("showRatings must be true or false");
  if (!["all", "thread"].includes(value.threadView)) fail("threadView must be all or thread");
  if (!["newest", "oldest"].includes(value.postOrder)) fail("postOrder must be newest or oldest");
  if (!["neutral", "original"].includes(value.preferredVersion)) fail("preferredVersion must be neutral or original");
  for (const key of ["flagAssumptions", "showReframing", "highlightNew"]) if (typeof value[key] !== "boolean") fail(`${key} must be true or false`);
  const age = value.customAge;
  if (legacy && (!age || Object.keys(age).sort().join(",") !== "max,min" || !Number.isInteger(age.min) || age.min < 0 || age.min > 1200 || !(age.max === null || Number.isInteger(age.max) && age.max > age.min && age.max <= 1200))) fail("customAge must have min 0–1200 and max greater than min or null");
  const idList = (list, allowed, name) => {
    if (!Array.isArray(list) || list.some((id) => !allowed.includes(id)) || new Set(list).size !== list.length) fail(`${name} must list distinct ids from ${allowed.join(", ")}`);
  };
  idList(value.toneBands, ids(TONE_BANDS), "toneBands");
  idList(value.supportBands, ids(SUPPORT_BANDS), "supportBands");
  if (legacy) idList(value.ageBands, [...ids(AGE_BANDS), "custom"], "ageBands");
  else if (!Number.isInteger(value.minAccountMonths) || value.minAccountMonths < 0 || value.minAccountMonths > 1200) fail("minAccountMonths must be 0–1200 whole months");
  idList(value.postVersions, ids(POST_VERSIONS), "postVersions");
  idList(value.interests, INTEREST_IDS, "interests");
  const since = value.since;
  const sinceOk = since !== null && typeof since === "object" && (legacy ? (
    (since.kind === "none" && Object.keys(since).length === 1)
    || (since.kind === "last-visit" && Object.keys(since).length === 1)
    || (since.kind === "hours" && Object.keys(since).length === 2 && Number.isInteger(since.hours) && since.hours >= 1 && since.hours <= 24 * 30)) : since.kind === "pull-days" && Object.keys(since).length === 2 && PULL_DAYS.includes(since.days));
  if (!sinceOk) fail(`since is ${JSON.stringify(since)}`);
  return value;
}

export const parseSettings = (text) => parseSettingsVersion(text);
function migrateWindow(since) {
  if (since.kind === "hours") return { kind: "pull-days", days: since.hours <= 24 ? 1 : since.hours <= 72 ? 3 : 7 };
  if (["none", "last-visit"].includes(since.kind)) return { kind: "pull-days", days: 1 };
  throw new Error(`Invalid legacy time window ${JSON.stringify(since)}`);
}
export function migrateSettings(value) {
  if (value?.version === 7) return parseSettings(JSON.stringify(value));
  if (value?.version === 6) return parseSettings(JSON.stringify({ ...parseSettingsVersion(JSON.stringify(value), 6), version: 7, includeHiddenAge: false }));
  if (value?.version === 5) {
    const old = parseSettingsVersion(JSON.stringify(value), 5);
    const { ageBands, customAge, ...rest } = old;
    const minimums = ageBands.map((id) => id === "custom" ? customAge.min : AGE_BANDS.find((band) => band.id === id).min);
    return parseSettings(JSON.stringify({ ...rest, version: 7, includeHiddenAge: false, minAccountMonths: minimums.length ? Math.min(...minimums) : 0, since: migrateWindow(old.since) }));
  }
  const legacyKeys = ["anonymous", "tonePreset", "supportPreset", "unassessed", "includedFunctions", "minAccountMonths", "filteredFlags", "preferredVersion", "flagAssumptions", "showReframing", "highlightNew", "showRatings", "since", "interests"].sort();
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(legacyKeys)) throw new Error("Unrecognized saved reading settings");
  const tones = { all: ids(TONE_BANDS), restrained_and_pointed: ["moderate", "good"], restrained_only: ["good"] };
  const supports = { all: ids(SUPPORT_BANDS), reasoned: ["medium", "high"], well_supported: ["high"] };
  if (!Object.hasOwn(tones, value.tonePreset) || !Object.hasOwn(supports, value.supportPreset) || !Number.isInteger(value.minAccountMonths) || value.minAccountMonths < 0 || value.minAccountMonths > 1200) throw new Error("Invalid legacy reading filters");
  const migrated = { ...DEFAULT_SETTINGS, toneBands: tones[value.tonePreset], supportBands: supports[value.supportPreset], minAccountMonths: value.minAccountMonths };
  for (const key of ["anonymous", "preferredVersion", "flagAssumptions", "showReframing", "highlightNew", "showRatings", "since", "interests"]) migrated[key] = value[key];
  const legacySince = value.since;
  if (!legacySince || !((legacySince.kind === "hours" && Object.keys(legacySince).length === 2 && Number.isInteger(legacySince.hours) && legacySince.hours >= 1 && legacySince.hours <= 720) || (["none", "last-visit"].includes(legacySince.kind) && Object.keys(legacySince).length === 1))) throw new Error(`Invalid legacy time window ${JSON.stringify(legacySince)}`);
  migrated.since = migrateWindow(legacySince);
  return parseSettings(JSON.stringify(migrated));
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

export function parseAnswers(value, where, minimum = FEEDBACK_MIN, maximum = FEEDBACK_MAX) {
  const isScore = (score) => score === null || (Number.isInteger(score) && score >= minimum && score <= maximum);
  if (!isPlainObject(value) || !sameKeys(value, FEEDBACK_IDS) || !FEEDBACK_IDS.every((id) => isScore(value[id]))) throw new Error(`${where}: expected {${FEEDBACK_IDS.join(", ")}}, each ${minimum}–${maximum} or null, got ${JSON.stringify(value)}`);
  return value;
}

export function parseFeedbackList(value, keys) {
  if (!isPlainObject(value) || !sameKeys(value, ["mine"])) throw new Error(`feedback: expected {mine}, got ${JSON.stringify(value)}`);
  return { mine: postMap(value.mine, keys, "feedback.mine", parseAnswers) };
}

export const noAnswers = () => Object.fromEntries(FEEDBACK_IDS.map((id) => [id, null]));
export const isUnanswered = (answers) => FEEDBACK_IDS.every((id) => answers[id] === null);
