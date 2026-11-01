// Everything the page decides, as pure functions over the site data and the reader's
// settings. No DOM here; tests/logic.test.mjs covers it under node.

import { MATURITY_MAX, MATURITY_MIN, RATINGS, TRAITS, TRAIT_IDS, INTEREST_IDS } from "./vocab.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const RECENT_ACCOUNT_DAYS = 90;
export const SINCE_HOURS = [6, 12, 24];

const time = (iso) => {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new Error(`not a timestamp: ${JSON.stringify(iso)}`);
  return value;
};

const allPosts = (topic) => topic.threads.flatMap((thread) => thread.posts);

// Consistent stand-in names for anonymous mode, numbered by first appearance in the topic.
export function pseudonyms(topic) {
  const names = new Map();
  for (const post of allPosts(topic)) if (!names.has(post.author)) names.set(post.author, `Participant ${names.size + 1}`);
  return names;
}

// Replaces @mentions of the topic's participants with their stand-in names. Like Discourse,
// a mention starts at a word boundary (so email addresses are left alone), is
// case-insensitive, and stops at characters a username cannot hold.
export function maskMentions(text, names) {
  const byLower = new Map([...names].map(([author, alias]) => [author.toLowerCase(), alias]));
  return text.replace(/(?<![\w@])@([A-Za-z0-9_.-]*[A-Za-z0-9_])/g, (mention, username) => {
    const alias = byLower.get(username.toLowerCase());
    return alias === undefined ? mention : `@${alias}`;
  });
}

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

export function accountAgeLabel(account, snapshotAt) {
  if (account.created_at === null) return account.status;
  const days = Math.floor((time(snapshotAt) - time(account.created_at)) / DAY_MS);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} on the forum`;
  if (days < 730) return `${Math.floor(days / 30.44)} months on the forum`;
  return `${Math.floor(days / 365.25)} years on the forum`;
}

// Why a post is greyed out for this reader; an empty list means it is not.
export function greyReasons(post, settings) {
  if (post.hidden) return [];
  const reasons = [];
  if (post.maturity < settings.minMaturity) reasons.push(`maturity ${post.maturity} is below your minimum of ${settings.minMaturity}`);
  for (const mark of post.traits) if (settings.greyTraits.includes(mark.trait)) reasons.push(TRAITS.find((trait) => trait.id === mark.trait).label);
  return reasons;
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
  minMaturity: 4,
  greyTraits: [],
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
  if (!Number.isInteger(value.minMaturity) || value.minMaturity < MATURITY_MIN || value.minMaturity > MATURITY_MAX) fail(`minMaturity must be ${MATURITY_MIN}–${MATURITY_MAX}`);
  const idList = (list, allowed, name) => {
    if (!Array.isArray(list) || list.some((id) => !allowed.includes(id)) || new Set(list).size !== list.length) fail(`${name} must list distinct ids from ${allowed.join(", ")}`);
  };
  idList(value.greyTraits, TRAIT_IDS, "greyTraits");
  idList(value.interests, INTEREST_IDS, "interests");
  const since = value.since;
  const sinceOk = since !== null && typeof since === "object" && (
    (since.kind === "none" && Object.keys(since).length === 1)
    || (since.kind === "last-visit" && Object.keys(since).length === 1)
    || (since.kind === "hours" && Object.keys(since).length === 2 && Number.isInteger(since.hours) && since.hours >= 1 && since.hours <= 24 * 30));
  if (!sinceOk) fail(`since is ${JSON.stringify(since)}`);
  return value;
}
