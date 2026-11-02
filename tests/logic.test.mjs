import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accountAgeDays, accountAgeLabel, DEFAULT_SETTINGS, formatAverage, greyReasons, migrateSettings, orderedPosts, relativeDate, isUnanswered, maskMentions, noAnswers, parseAnswers, parseFeedbackList, parsePostRatings, parseRatingsList, parseSettings, participantNumbers, POSTS_PER_LOAD, pseudonym, ratingSummary, shortDate, shownToReach, sinceCutoff, topicStats, whatsNew } from "../site/js/logic.js";
import { FEEDBACK_IDS, FEEDBACK_MAX, RATING_IDS, RATINGS } from "../site/js/vocab.js";
import { toneBand } from "../site/js/rubric.js";
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

test("multi-select filters independently match exact bands, including unknown scores", () => {
  const subsets = (values) => Array.from({ length: 2 ** values.length }, (_, bits) => values.filter((_, index) => bits & 2 ** index));
  for (const tone of [null, 0, 1, 2, 3]) for (const support of [null, 0, 1, 2, 3]) {
    for (const toneBands of subsets(["bad", "moderate", "good"])) for (const supportBands of subsets(["low", "medium", "high"])) {
      const post = structuredClone(site().topic.threads[0].posts[0]);
      post.analysis.dimensions.tone.score = tone; post.analysis.tone_peak = null;
      post.analysis.dimensions.reasoning.score = support;
      const expected = [];
      const t = ["bad", "bad", "moderate", "good"][tone];
      const r = ["low", "low", "medium", "high"][support];
      if (tone !== null && !toneBands.includes(t)) expected.push(`${t} tone`);
      if (support !== null && !supportBands.includes(r)) expected.push(`${r} argument support`);
      assert.deepEqual(greyReasons(post, { ...DEFAULT_SETTINGS, toneBands, supportBands }, SNAPSHOT), expected);
    }
  }
});
test("material isolated attacks participate in tone selection; removed flag filters do not", () => {
  const post = site().topic.threads[0].posts[0];
  post.analysis.dimensions.tone.score = 3;
  for (const score of [0, 1, 2, 3]) for (const severity of ["minor", "material", "severe"]) {
    post.analysis.tone_peak = { score, severity, scope: "isolated" };
    assert.deepEqual(greyReasons(post, { ...DEFAULT_SETTINGS, toneBands: ["good"] }, SNAPSHOT), severity !== "minor" && score < 3 ? [`${score < 2 ? "bad" : "moderate"} tone`] : []);
  }
});
test("rewrite and age selections combine, unknown ages remain available", () => {
  const post = site().topic.threads[0].posts[1];
  assert.deepEqual(greyReasons(post, { ...DEFAULT_SETTINGS, ageBands: ["36plus"], postVersions: ["original"] }, SNAPSHOT), ["41 days on the forum · outside your account-age selection", "has a re-write"]);
  assert.deepEqual(greyReasons(post, { ...DEFAULT_SETTINGS, ageBands: ["36plus"], anonymous: true }, SNAPSHOT), ["account age outside your selection"]);
  post.account.created_at = null;
  assert.deepEqual(greyReasons(post, { ...DEFAULT_SETTINGS, ageBands: [] }, SNAPSHOT), []);
});
test("merged and per-thread ordering is stable across equal timestamps and does not mutate the topic", () => {
  const post = (key, created_at) => ({ key, created_at });
  const topic = { threads: [{ id: 7, posts: [post("7/1", "2026-01-01"), post("7/2", "2026-01-02")] }, { id: 8, posts: [post("8/1", "2026-01-02")] }] };
  const original = structuredClone(topic);
  assert.deepEqual(orderedPosts(topic, DEFAULT_SETTINGS, 7).map(p => p.key), ["8/1", "7/2", "7/1"]);
  assert.deepEqual(orderedPosts(topic, { ...DEFAULT_SETTINGS, postOrder: "oldest" }, 7).map(p => p.key), ["7/1", "7/2", "8/1"]);
  assert.deepEqual(orderedPosts(topic, { ...DEFAULT_SETTINGS, threadView: "thread" }, 7).map(p => p.key), ["7/2", "7/1"]);
  assert.deepEqual(topic, original);
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
      assert.equal(greyReasons(post, { ...DEFAULT_SETTINGS, ageBands: ["custom"], customAge: { min: months, max: null } }, snapshot).length > 0, offset > 0);
      post.account.created_at = null;
      assert.deepEqual(greyReasons(post, { ...DEFAULT_SETTINGS, ageBands: ["custom"], customAge: { min: months, max: null } }, snapshot), []);
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

test("saved v5 settings round-trip and reject malformed choices and boundaries", () => {
  assert.deepEqual(parseSettings(JSON.stringify(DEFAULT_SETTINGS)), DEFAULT_SETTINGS);
  for (const toneBands of [[], ["good"], ["bad", "good"]]) {
    const value = { ...DEFAULT_SETTINGS, toneBands, ageBands: ["custom"], customAge: { min: 6, max: 12 } };
    assert.deepEqual(parseSettings(JSON.stringify(value)), value);
  }
  const reject = (patch, message) => assert.throws(() => parseSettings(JSON.stringify({ ...DEFAULT_SETTINGS, ...patch })), { message: `saved settings are invalid: ${message}` });
  reject({ version: 4 }, "version must be 5");
  reject({ preferredVersion: "diff" }, "preferredVersion must be neutral or original");
  reject({ anonymous: "yes" }, "anonymous must be true or false");
  reject({ toneBands: ["good", "good"] }, "toneBands must list distinct ids from bad, moderate, good");
  reject({ ageBands: ["old"] }, "ageBands must list distinct ids from under6, 6to12, 12to36, 36plus, custom");
  for (const customAge of [{ min: -1, max: null }, { min: 6, max: 6 }, { min: 6, max: 1201 }]) reject({ customAge }, "customAge must have min 0–1200 and max greater than min or null");
  reject({ since: { kind: "none", hours: 3 } }, 'since is {"kind":"none","hours":3}');
  reject({ extra: 1 }, `keys are ${[...Object.keys(DEFAULT_SETTINGS), "extra"].sort().join(", ")}`);
  assert.throws(() => parseSettings("[]"), { message: "saved settings are invalid: not an object" });
});
test("legacy settings migrate explicitly without retaining removed hidden filters", () => {
  const old = { anonymous: true, tonePreset: "restrained_only", supportPreset: "well_supported", unassessed: "arguments_only", includedFunctions: [], minAccountMonths: 12, filteredFlags: ["repetition"], preferredVersion: "original", flagAssumptions: false, showReframing: true, highlightNew: true, showRatings: true, since: { kind: "last-visit" }, interests: ["grants"] };
  assert.deepEqual(migrateSettings(old), { ...DEFAULT_SETTINGS, anonymous: true, toneBands: ["good"], supportBands: ["high"], ageBands: ["custom"], customAge: { min: 12, max: null }, preferredVersion: "original", flagAssumptions: false, since: { kind: "last-visit" }, interests: ["grants"] });
  assert.deepEqual(migrateSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.throws(() => migrateSettings({}), { message: "Unrecognized saved reading settings" });
});

test("tone bands distinguish unassessed and reject invalid scores", () => {
  assert.deepEqual([null, 0, 1, 2, 3].map(toneBand), ["unassessed", "low", "low", "mid", "high"]);
  for (const bad of [-1, 4, 2.5, NaN, Infinity, "3"]) assert.throws(() => toneBand(bad), { message: `tone must be 0–3 or null, got ${JSON.stringify(bad)}` });
});

test("dates use system locale and relative time; posts load in whole batches up to the one wanted", () => {
  assert.equal(shortDate("2026-10-26T23:02:00Z"), new Date("2026-10-26T23:02:00Z").toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }));
  assert.equal(relativeDate("2026-10-26T23:02:00Z", Date.parse("2026-10-27T01:02:00Z")), new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-2, "hour"));
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
  const answers = { emotions: -1, head: null };
  assert.deepEqual(parseFeedbackList({ mine: { "7/2": answers } }, keys), { mine: { "7/2": answers } });
  assert.deepEqual(parseAnswers({ emotions: 0, head: 1 }, "x"), { emotions: 0, head: 1 });
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
  assert.throws(() => parseFeedbackList({ mine: { "7/1": { emotions: 11, head: null } } }, keys), { message: 'feedback.mine["7/1"]: expected {emotions, head}, each -1–1 or null, got {"emotions":11,"head":null}' });
  assert.throws(() => parseAnswers({ emotions: 2.5, head: null }, "x"), { message: 'x: expected {emotions, head}, each -1–1 or null, got {"emotions":2.5,"head":null}' });
  assert.throws(() => parseAnswers({ emotions: 2 }, "x"), { message: 'x: expected {emotions, head}, each -1–1 or null, got {"emotions":2}' });
  assert.throws(() => parseFeedbackList([], keys), { message: "feedback: expected {mine}, got []" });
});

test("the feedback ids and score range in vocab.js match the Rust server's", () => {
  const rust = readFileSync(new URL("../server/src/feedback.rs", import.meta.url), "utf8");
  const ids = /const FEEDBACK_IDS: \[&str; 2\] = \[([^\]]*)\];/.exec(rust);
  assert.notEqual(ids, null, "FEEDBACK_IDS not found in server/src/feedback.rs");
  assert.deepEqual(ids[1].split(",").map((id) => id.trim().replace(/^"|"$/g, "")), FEEDBACK_IDS);
  const max = /pub const SCORE_MAX: u8 = (\d+);/.exec(rust);
  assert.notEqual(max, null, "SCORE_MAX not found in server/src/feedback.rs");
  assert.equal(Number(max[1]), 10, "historical file format remains 0–10");
  assert.equal(FEEDBACK_MAX, 1, "new account feedback is ternary");
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

test("removed contribution and passage controls cannot filter posts through v5 preferences", () => {
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, "includedFunctions"), false);
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, "filteredFlags"), false);
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, "unassessed"), false);
});

test("age bands partition calendar boundaries and multi-select unions without overlap", () => {
  const post = structuredClone(site().topic.threads[0].posts[0]);
  for (const [boundary, younger, older] of [["2026-04-30T21:58:20Z", "under6", "6to12"], ["2025-10-31T21:58:20Z", "6to12", "12to36"], ["2023-10-31T21:58:20Z", "12to36", "36plus"]]) {
    for (let offset=-10; offset<=10; offset++) {
      post.account.created_at=new Date(Date.parse(boundary)+offset*1000).toISOString();
      const matches=["under6","6to12","12to36","36plus"].filter(band=>greyReasons(post,{...DEFAULT_SETTINGS,ageBands:[band]},SNAPSHOT).length===0);
      assert.deepEqual(matches,[offset>0?younger:older]);
      assert.deepEqual(greyReasons(post,{...DEFAULT_SETTINGS,ageBands:[younger,older]},SNAPSHOT),[]);
    }
  }
});
