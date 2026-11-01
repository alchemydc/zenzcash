import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accountAgeDays, accountAgeLabel, DEFAULT_SETTINGS, formatAverage, greyReasons, issueCoverage, unmatchedArguments, isUnanswered, maskMentions, noAnswers, parseAnswers, parseFeedbackList, parsePostRatings, parseRatingsList, parseSettings, participantNumbers, POSTS_PER_LOAD, pseudonym, ratingSummary, shortDate, shownToReach, sinceCutoff, topicStats, whatsNew } from "../site/js/logic.js";
import { ACCOUNT_AGE_MINIMUMS, FEEDBACK_IDS, FEEDBACK_MAX, RATING_IDS, RATINGS } from "../site/js/vocab.js";
import { FLAG_IDS, FUNCTIONS, SUPPORT_PRESETS, TONE_PRESETS, UNASSESSED_PRESETS, toneBand } from "../site/js/rubric.js";
import { goodMarks } from "./marks-fixture.mjs";
import { buildSiteData } from "../tools/build.mjs";
import { random, sampleThread } from "./helpers.mjs";

const SNAPSHOT = "2026-10-31T21:58:20Z";
const accounts = {
  alice: { created_at: "2016-01-01T00:00:00Z", status: "ok" },
  bob: { created_at: "2026-09-20T00:00:00Z", status: "ok" },
  carol: { created_at: null, status: "profile hidden" },
};
const marksResult = {
  task: "marks",
  backend: "subagent",
  model: "m",
  output: goodMarks(),
};
const summaryResult = {
  task: "summary",
  backend: "subagent",
  model: "m",
  output: {
    task: "summary",
    topic: "zcg",
    card: { title: "Sample", byline: "b", keywords: ["a", "b"], interests: ["grants"] },
    headline: "h",
    overview: [{ text: "o", cites: ["7/1"] }, { text: "o2", cites: ["7/2"] }],
    points: [{ id: "p1", text: "first", cites: ["7/1"] }, { id: "p2", text: "late", cites: ["7/4", "7/1"] }],
    issues: [{ id: "q1", issue: "A question?", points: ["p1", "p2"] }],
  },
};
const site = () => buildSiteData({ snapshotAt: SNAPSHOT, threads: [sampleThread()] }, accounts, [marksResult, summaryResult]);

test("the build is deterministic and joins posts, accounts and marks", () => {
  assert.equal(JSON.stringify(site()), JSON.stringify(site()));
  const data = site();
  const posts = data.topic.threads[0].posts;
  assert.deepEqual(posts.map((post) => [post.raw, post.own_text]), sampleThread().posts.map((post) => [post.raw, post.own_text]));
  assert.deepEqual(posts.map((post) => [post.key, post.author, post.analysis, post.hidden]), [["7/1", "alice", goodMarks().posts[0], false], ["7/2", "bob", goodMarks().posts[1], false], ["7/3", "carol", null, true], ["7/4", "alice", goodMarks().posts[2], false]]);
  assert.deepEqual(data.topic.points.map((point) => point.first_at), ["2026-10-30T10:00:00Z", "2026-10-31T20:00:00Z"]);
  assert.deepEqual(data.topic.issues, summaryResult.output.issues);
  assert.equal(data.topic.threads[0].url, "https://forum.zcashcommunity.com/t/sample-thread/7");
  assert.deepEqual(data.models, ["m (subagent)"]);
  assert.throws(() => buildSiteData({ snapshotAt: SNAPSHOT, threads: [sampleThread()] }, { alice: accounts.alice }, [marksResult, summaryResult]), { message: "no account record for @bob; run node tools/fetch-accounts.mjs" });
});

test("anonymous mode numbers authors by first appearance; mentions of them are masked", () => {
  const numbers = participantNumbers(site().topic);
  assert.deepEqual([...numbers], [["alice", 1], ["bob", 2], ["carol", 3]]);
  assert.equal(pseudonym(12), "Participant 12");
  assert.equal(maskMentions("Thanks @Alice and @bob. @dave, and mail@alice.example", numbers), "Thanks @Participant 1 and @Participant 2. @dave, and mail@alice.example");
  assert.equal(maskMentions("mail@alice (@alice)\n@carol", numbers), "mail@alice (@Participant 1)\n@Participant 3");
  assert.equal(maskMentions("@bob.", numbers), "@Participant 2.");
});

test("topic stats count posts, people and account ages at the snapshot", () => {
  assert.deepEqual(topicStats(site().topic, SNAPSHOT), { threads: 1, posts: 4, participants: 3, medianYears: ((Date.parse(SNAPSHOT) - Date.parse("2016-01-01T00:00:00Z")) / 864e5 + (Date.parse(SNAPSHOT) - Date.parse("2026-09-20T00:00:00Z")) / 864e5) / 2 / 365.25, joinedRecently: 1, unknownAge: 1, lastPostAt: "2026-10-31T20:00:00Z" });
  assert.equal(accountAgeLabel(accounts.alice, SNAPSHOT), "10 years on the forum");
  assert.equal(accountAgeLabel(accounts.bob, SNAPSHOT), "41 days on the forum");
  assert.equal(accountAgeLabel({ created_at: "2026-10-30T22:00:00Z", status: "ok" }, SNAPSHOT), "0 days on the forum");
  assert.equal(accountAgeLabel({ created_at: "2026-10-30T21:00:00Z", status: "ok" }, SNAPSHOT), "1 day on the forum");
  assert.equal(accountAgeLabel({ created_at: "2025-06-01T00:00:00Z", status: "ok" }, SNAPSHOT), "16 months on the forum");
  assert.equal(accountAgeLabel(accounts.carol, SNAPSHOT), "profile hidden");
  assert.deepEqual([accounts.alice, accounts.bob, accounts.carol].map((account) => accountAgeDays(account, SNAPSHOT)), [3956, 41, null]);
  assert.equal(accountAgeDays({ created_at: "2026-10-30T22:00:00Z", status: "ok" }, SNAPSHOT), 0);
  assert.equal(accountAgeDays({ created_at: "2026-10-30T21:58:20Z", status: "ok" }, SNAPSHOT), 1);
});

test("independent tone, support, passage flags and account filters explain each exclusion", () => {
  const [first, second, hidden, fourth] = site().topic.threads[0].posts;
  const settings = { ...DEFAULT_SETTINGS, tonePreset: "restrained_and_pointed", filteredFlags: ["repetition"] };
  assert.deepEqual(greyReasons(first, settings, SNAPSHOT), []);
  assert.deepEqual(greyReasons(second, settings, SNAPSHOT), ["tone 0/3 is outside “Restrained and pointed”"]);
  assert.deepEqual(greyReasons(fourth, settings, SNAPSHOT), ["repetition"]);
  assert.deepEqual(greyReasons(hidden, { ...settings, minAccountMonths: 24 }, SNAPSHOT), []);
  const byAge = (minAccountMonths, anonymous = false) => greyReasons(second, { ...DEFAULT_SETTINGS, minAccountMonths, anonymous }, SNAPSHOT);
  assert.deepEqual(byAge(0), []);
  assert.deepEqual(byAge(1), []);
  assert.deepEqual(byAge(3), ["41 days on the forum, below your minimum of 3 months"]);
  assert.deepEqual(byAge(12), ["41 days on the forum, below your minimum of 1 year"]);
  assert.deepEqual(byAge(3, true), ["the account is newer than your minimum of 3 months on the forum"]);
  assert.deepEqual(greyReasons(second, { ...settings, supportPreset: "well_supported", minAccountMonths: 24, filteredFlags: ["unsupported_motive_attribution"] }, SNAPSHOT), ["tone 0/3 is outside “Restrained and pointed”", "argument support 1/3 is outside “Well-supported arguments”", "41 days on the forum, below your minimum of 2 years", "unsupported motive attribution"]);
});

test("tone and support presets cover every score and null independently", () => {
  for (const tone of [null, 0, 1, 2, 3]) for (const support of [null, 0, 1, 2, 3]) {
    for (const tonePreset of TONE_PRESETS) for (const supportPreset of SUPPORT_PRESETS) for (const unassessed of UNASSESSED_PRESETS) {
      const post = structuredClone(site().topic.threads[0].posts[0]);
      post.analysis.dimensions.tone.score = tone;
      post.analysis.tone_peak = tone === null ? null : { ...post.analysis.tone_peak, score: tone };
      post.analysis.dimensions.reasoning.score = support;
      const reasons = greyReasons(post, { ...DEFAULT_SETTINGS, tonePreset: tonePreset.id, supportPreset: supportPreset.id, unassessed: unassessed.id }, SNAPSHOT);
      const expected = Number(tone !== null && tone < tonePreset.minimum) + Number(support !== null && support < supportPreset.minimum) + Number(support === null && unassessed.id === "arguments_only");
      assert.equal(reasons.length, expected, JSON.stringify({ tone, support, tonePreset, supportPreset, unassessed }));
    }
  }
});

test("material isolated attacks are included in tone filtering and summary issues remain covered", () => {
  const topic = site().topic;
  const post = topic.threads[0].posts[0];
  for (const score of [0, 1, 2, 3]) for (const severity of ["minor", "material", "severe"]) for (const preset of TONE_PRESETS) {
    post.analysis.tone_peak = { ...post.analysis.tone_peak, score, severity, scope: "isolated" };
    const reasons = greyReasons(post, { ...DEFAULT_SETTINGS, tonePreset: preset.id }, SNAPSHOT);
    assert.deepEqual(reasons, score < preset.minimum && severity !== "minor" ? [`a passage (isolated, ${severity}) has tone ${score}/3`] : []);
  }
  assert.deepEqual(issueCoverage(topic, DEFAULT_SETTINGS, SNAPSHOT), [{ id: "q1", label: "A question?", total: 2, matching: 2 }]);
  assert.deepEqual(issueCoverage(topic, { ...DEFAULT_SETTINGS, supportPreset: "well_supported", unassessed: "arguments_only" }, SNAPSHOT), [{ id: "q1", label: "A question?", total: 2, matching: 0 }]);
  assert.equal(topic.points.length, 2);
  assert.deepEqual(unmatchedArguments(topic, DEFAULT_SETTINGS, SNAPSHOT), []);
  assert.deepEqual(unmatchedArguments(topic, { ...DEFAULT_SETTINGS, supportPreset: "well_supported", unassessed: "arguments_only" }, SNAPSHOT), topic.points);
});

test("calendar age boundaries clamp month ends and include unknown profiles", () => {
  for (const [snapshot, months, cutoff] of [
    ["2024-03-31T12:00:00Z", 1, "2024-02-29T12:00:00Z"],
    ["2025-03-31T12:00:00Z", 1, "2025-02-28T12:00:00Z"],
    ["2024-02-29T12:00:00Z", 12, "2023-02-28T12:00:00Z"],
    ["2026-11-01T00:00:00Z", 6, "2026-05-01T00:00:00Z"],
  ]) {
    for (let offset = -100; offset <= 100; offset++) {
      const post = { hidden: false, analysis: goodMarks().posts[0], account: { created_at: new Date(Date.parse(cutoff) + offset * 1000).toISOString(), status: "ok" } };
      assert.equal(greyReasons(post, { ...DEFAULT_SETTINGS, minAccountMonths: months }, snapshot).length > 0, offset > 0);
      post.account.created_at = null;
      assert.deepEqual(greyReasons(post, { ...DEFAULT_SETTINGS, minAccountMonths: months }, snapshot), []);
    }
  }
});

test("what's new: posts after the cutoff, and points first made after it", () => {
  const topic = site().topic;
  assert.equal(sinceCutoff({ kind: "hours", hours: 6 }, SNAPSHOT, null), "2026-10-31T15:58:20.000Z");
  assert.equal(sinceCutoff({ kind: "last-visit" }, SNAPSHOT, "2026-10-31T00:00:00.000Z"), "2026-10-31T00:00:00.000Z");
  assert.equal(sinceCutoff({ kind: "last-visit" }, SNAPSHOT, null), null);
  assert.equal(sinceCutoff({ kind: "none" }, SNAPSHOT, "2026-10-31T00:00:00.000Z"), null);
  assert.throws(() => sinceCutoff({ kind: "soon" }, SNAPSHOT, null), { message: 'unknown "since" kind "soon"' });
  const sixHours = whatsNew(topic, sinceCutoff({ kind: "hours", hours: 6 }, SNAPSHOT, null));
  assert.deepEqual([[...sixHours.posts], sixHours.threads, sixHours.points], [["7/4"], [{ id: 7, title: "Sample thread", count: 1 }], ["p2"]]);
  const day = whatsNew(topic, sinceCutoff({ kind: "hours", hours: 24 }, SNAPSHOT, null));
  assert.deepEqual([...day.posts], ["7/3", "7/4"]);
  assert.deepEqual(whatsNew(topic, null), { posts: new Set(), threads: [], points: [] });
  assert.deepEqual(whatsNew(topic, "2026-10-31T20:00:00Z").posts, new Set());
});

test("rating summaries: counts per level, average on the −1…+2 scale", () => {
  assert.deepEqual(ratingSummary({}).total, 0);
  assert.equal(ratingSummary({}).average, null);
  const summary = ratingSummary({ "dug-in": 1, "no-change": 1, "new-light": 2, "changed-mind": 1 });
  assert.deepEqual(summary.levels.map((level) => [level.id, level.count]), [["dug-in", 1], ["no-change", 1], ["new-light", 2], ["changed-mind", 1]]);
  assert.equal(summary.total, 5);
  assert.equal(summary.average, 0.6);
  assert.equal(formatAverage(0.6), "+0.6");
  assert.equal(formatAverage(-1), "−1.0");
  assert.equal(formatAverage(0), "0.0");
  assert.throws(() => ratingSummary({ loved: 1 }), { message: 'unknown rating "loved"' });
});

test("rating averages always lie between the lowest and highest rating value, and are finite", () => {
  const rng = random(4);
  const values = RATINGS.map((rating) => rating.value);
  for (let run = 0; run < 1000; run += 1) {
    const counts = Object.fromEntries(RATING_IDS.filter(() => rng.next() < 0.7).map((id) => [id, rng.int(0, rng.next() < 0.1 ? 1e6 : 20)]));
    const { total, average } = ratingSummary(counts);
    if (total === 0) assert.equal(average, null);
    else {
      assert.ok(Number.isFinite(average));
      assert.ok(average >= Math.min(...values) && average <= Math.max(...values), `${average} out of range for ${JSON.stringify(counts)}`);
    }
  }
});

test("saved settings: the defaults round-trip; anything else is rejected with the reason", () => {
  assert.deepEqual(parseSettings(JSON.stringify(DEFAULT_SETTINGS)), DEFAULT_SETTINGS);
  const saved = { ...DEFAULT_SETTINGS, anonymous: true, tonePreset: "restrained_only", minAccountMonths: 12, filteredFlags: ["personal_belittling"], since: { kind: "last-visit" }, interests: ["grants"] };
  assert.deepEqual(parseSettings(JSON.stringify(saved)), saved);
  for (const choice of ACCOUNT_AGE_MINIMUMS) assert.equal(parseSettings(JSON.stringify({ ...DEFAULT_SETTINGS, minAccountMonths: choice.months })).minAccountMonths, choice.months);
  const reject = (patch, message) => assert.throws(() => parseSettings(JSON.stringify({ ...DEFAULT_SETTINGS, ...patch })), { message: `saved settings are invalid: ${message}` });
  reject({ tonePreset: "unknown" }, "tonePreset must be one of all, restrained_and_pointed, restrained_only");
  reject({ preferredVersion: "diff" }, "preferredVersion must be neutral or original");
  reject({ anonymous: "yes" }, "anonymous must be true or false");
  reject({ minAccountMonths: 1201 }, "minAccountMonths must be an integer from 0 to 1200");
  reject({ minAccountMonths: "90" }, "minAccountMonths must be an integer from 0 to 1200");
  reject({ filteredFlags: ["repetition", "repetition"] }, `filteredFlags must list distinct ids from ${FLAG_IDS.join(", ")}`);
  reject({ interests: ["cooking"] }, "interests must list distinct ids from governance, protocol, grants, developers");
  reject({ since: { kind: "hours", hours: 0 } }, 'since is {"kind":"hours","hours":0}');
  reject({ since: { kind: "none", hours: 3 } }, 'since is {"kind":"none","hours":3}');
  reject({ extra: 1 }, `keys are ${[...Object.keys(DEFAULT_SETTINGS), "extra"].sort().join(", ")}`);
  const { minAccountMonths: _dropped, ...withoutAge } = DEFAULT_SETTINGS;
  assert.throws(() => parseSettings(JSON.stringify(withoutAge)), { message: `saved settings are invalid: keys are ${Object.keys(withoutAge).sort().join(", ")}` });
  assert.throws(() => parseSettings("[]"), { message: "saved settings are invalid: not an object" });
});

test("tone bands distinguish unassessed and reject invalid scores", () => {
  assert.deepEqual([null, 0, 1, 2, 3].map(toneBand), ["unassessed", "low", "low", "mid", "high"]);
  for (const bad of [-1, 4, 2.5, NaN, Infinity, "3"]) assert.throws(() => toneBand(bad), { message: `tone must be 0–3 or null, got ${JSON.stringify(bad)}` });
});

test("dates show day, month and time in UTC; posts load in whole batches up to the one wanted", () => {
  assert.equal(shortDate("2026-10-26T23:02:00Z"), "26 Oct, 23:02 UTC");
  assert.throws(() => shortDate("yesterday"), { message: 'not a timestamp: "yesterday"' });
  assert.equal(POSTS_PER_LOAD, 20);
  assert.equal(shownToReach(0, 20), 20);
  assert.equal(shownToReach(19, 20), 20);
  assert.equal(shownToReach(20, 20), 40);
  assert.equal(shownToReach(57, 20), 60);
  assert.equal(shownToReach(5, 60), 60);
  for (let index = 0; index < 400; index += 1) {
    for (const shown of [20, 40, 140]) {
      const result = shownToReach(index, shown);
      assert.ok(result > index && result >= shown && result % POSTS_PER_LOAD === 0, `index ${index}, shown ${shown} gave ${result}`);
      assert.ok(result === shown || result - POSTS_PER_LOAD <= index, `index ${index}, shown ${shown} loaded a needless batch: ${result}`);
    }
  }
});

test("API responses: ratings and feedback are accepted exactly as the server sends them", () => {
  const keys = new Set(["7/1", "7/2"]);
  const counts = { "dug-in": 0, "no-change": 1, "new-light": 2, "changed-mind": 0 };
  assert.deepEqual(parseRatingsList({ posts: { "7/1": counts }, mine: { "7/1": "new-light" } }, keys), { posts: { "7/1": counts }, mine: { "7/1": "new-light" } });
  assert.deepEqual(parseRatingsList({ posts: {}, mine: {} }, keys), { posts: {}, mine: {} });
  assert.deepEqual(parsePostRatings({ counts, mine: null }), { counts, mine: null });
  assert.deepEqual(parsePostRatings({ counts, mine: "dug-in" }), { counts, mine: "dug-in" });
  const answers = { emotions: 7, head: null };
  assert.deepEqual(parseFeedbackList({ mine: { "7/2": answers } }, keys), { mine: { "7/2": answers } });
  assert.deepEqual(parseAnswers({ emotions: 0, head: 10 }, "x"), { emotions: 0, head: 10 });
  assert.deepEqual(noAnswers(), { emotions: null, head: null });
  assert.equal(isUnanswered(noAnswers()), true);
  assert.equal(isUnanswered({ emotions: null, head: 0 }), false);
});

test("API responses: anything else is rejected with what was wrong", () => {
  const keys = new Set(["7/1"]);
  const counts = { "dug-in": 0, "no-change": 1, "new-light": 2, "changed-mind": 0 };
  assert.throws(() => parseRatingsList({ posts: {} }, keys), { message: 'ratings: expected {posts, mine}, got {"posts":{}}' });
  assert.throws(() => parseRatingsList({ posts: { "7/9": counts }, mine: {} }, keys), { message: 'ratings.posts: "7/9" is not a post this page knows' });
  assert.throws(() => parseRatingsList({ posts: { "7/1": { ...counts, "dug-in": -1 } }, mine: {} }, keys), { message: 'ratings.posts["7/1"]: expected a count for each of dug-in, no-change, new-light, changed-mind, got {"dug-in":-1,"no-change":1,"new-light":2,"changed-mind":0}' });
  assert.throws(() => parseRatingsList({ posts: {}, mine: { "7/1": "loved" } }, keys), { message: 'ratings.mine["7/1"]: unknown rating "loved"' });
  assert.throws(() => parsePostRatings({ counts: { "dug-in": 0 }, mine: null }), /^Error: rating\.counts: expected a count for each of/);
  assert.throws(() => parseFeedbackList({ mine: { "7/1": { emotions: 11, head: null } } }, keys), { message: 'feedback.mine["7/1"]: expected {emotions, head}, each -10–10 or null, got {"emotions":11,"head":null}' });
  assert.throws(() => parseAnswers({ emotions: 2.5, head: null }, "x"), { message: 'x: expected {emotions, head}, each -10–10 or null, got {"emotions":2.5,"head":null}' });
  assert.throws(() => parseAnswers({ emotions: 2 }, "x"), { message: 'x: expected {emotions, head}, each -10–10 or null, got {"emotions":2}' });
  assert.throws(() => parseFeedbackList([], keys), { message: "feedback: expected {mine}, got []" });
});

test("the feedback ids and score range in vocab.js match the Rust server's", () => {
  const rust = readFileSync(new URL("../server/src/feedback.rs", import.meta.url), "utf8");
  const ids = /const FEEDBACK_IDS: \[&str; 2\] = \[([^\]]*)\];/.exec(rust);
  assert.notEqual(ids, null, "FEEDBACK_IDS not found in server/src/feedback.rs");
  assert.deepEqual(ids[1].split(",").map((id) => id.trim().replace(/^"|"$/g, "")), FEEDBACK_IDS);
  const max = /pub const SCORE_MAX: u8 = (\d+);/.exec(rust);
  assert.notEqual(max, null, "SCORE_MAX not found in server/src/feedback.rs");
  assert.equal(Number(max[1]), FEEDBACK_MAX);
});

test("the rating ids in vocab.js match the Rust server's", () => {
  const rust = readFileSync(new URL("../server/src/ratings.rs", import.meta.url), "utf8");
  const declared = /const LEVEL_IDS: \[&str; 4\] = \[([^\]]*)\];/.exec(rust);
  assert.notEqual(declared, null, "LEVEL_IDS not found in server/src/ratings.rs");
  assert.deepEqual(declared[1].split(",").map((id) => id.trim().replace(/^"|"$/g, "")), RATING_IDS);
});

test("feedback corpus identity changes with rendition text, not review scores or result ordering", () => {
  const original = site();
  const changed = structuredClone(marksResult);
  changed.output.posts[1].neutral_rendition += " A revised sentence.";
  const build = (marks) => buildSiteData({ snapshotAt: SNAPSHOT, threads: [sampleThread()] }, accounts, [summaryResult, marks]);
  assert.notEqual(build(changed).feedback_version, original.feedback_version);
  changed.output.posts[1].neutral_rendition = marksResult.output.posts[1].neutral_rendition;
  changed.output.posts[1].dimensions.tone.score = 1;
  changed.output.posts.reverse();
  assert.equal(build(changed).feedback_version, original.feedback_version);
});

test("contribution types are independent choices and mixed posts match any selected kind", () => {
  const post = site().topic.threads[0].posts[0];
  for (const first of FUNCTIONS) for (const second of FUNCTIONS) for (const selected of FUNCTIONS) {
    post.analysis.function = [...new Set([first, second])];
    const excluded = selected !== first && selected !== second;
    assert.equal(greyReasons(post, { ...DEFAULT_SETTINGS, includedFunctions: [selected] }, SNAPSHOT).length, Number(excluded));
  }
  assert.equal(greyReasons(post, { ...DEFAULT_SETTINGS, includedFunctions: [] }, SNAPSHOT).length, 1);
});

test("provisional presets pin the adopted independent cutoffs", () => {
  assert.deepEqual(TONE_PRESETS.map(({ id, minimum }) => [id, minimum]), [["all", 0], ["restrained_and_pointed", 2], ["restrained_only", 3]]);
  assert.deepEqual(SUPPORT_PRESETS.map(({ id, minimum }) => [id, minimum]), [["all", 0], ["reasoned", 2], ["well_supported", 3]]);
  assert.equal(DEFAULT_SETTINGS.unassessed, "include");
  assert.deepEqual(DEFAULT_SETTINGS.includedFunctions, ["argument", "question", "proposal", "correction", "preference", "experience", "social_reply", "mixed"]);
});
