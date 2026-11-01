import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accountAgeLabel, DEFAULT_SETTINGS, formatAverage, greyReasons, maskMentions, parseSettings, pseudonyms, ratingSummary, sinceCutoff, topicStats, whatsNew } from "../site/js/logic.js";
import { RATING_IDS, RATINGS, maturityBand } from "../site/js/vocab.js";
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
  output: {
    task: "marks",
    topic_id: 7,
    posts: [
      { post_number: 1, maturity: 7, maturity_reason: "r1", clean: null, traits: [] },
      { post_number: 2, maturity: 3, maturity_reason: "r2", clean: "That view may be paid for. ZCG funded 400 grants.", traits: [{ trait: "motives", reason: "m", quote: "You are clearly paid to say that." }] },
      { post_number: 4, maturity: 4, maturity_reason: "r4", clean: null, traits: [{ trait: "repeats", reason: "x", quote: "ZCG should end." }, { trait: "no-content", reason: "y", quote: "+1 to everything I said before." }] },
    ],
  },
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
    groupings: { disclaimer: "d", groups: [{ label: "g", note: "n", points: ["p1"] }] },
  },
};
const site = () => buildSiteData({ snapshotAt: SNAPSHOT, threads: [sampleThread()] }, accounts, [marksResult, summaryResult]);

test("the build is deterministic and joins posts, accounts and marks", () => {
  assert.equal(JSON.stringify(site()), JSON.stringify(site()));
  const data = site();
  const posts = data.topic.threads[0].posts;
  assert.deepEqual(posts.map((post) => [post.key, post.author, post.maturity, post.traits.length, post.hidden]), [["7/1", "alice", 7, 0, false], ["7/2", "bob", 3, 1, false], ["7/3", "carol", null, 0, true], ["7/4", "alice", 4, 2, false]]);
  assert.deepEqual(data.topic.points.map((point) => point.first_at), ["2026-10-30T10:00:00Z", "2026-10-31T20:00:00Z"]);
  assert.equal(data.topic.threads[0].url, "https://forum.zcashcommunity.com/t/sample-thread/7");
  assert.deepEqual(data.models, ["m (subagent)"]);
  assert.throws(() => buildSiteData({ snapshotAt: SNAPSHOT, threads: [sampleThread()] }, { alice: accounts.alice }, [marksResult, summaryResult]), { message: "no account record for @bob; run node tools/fetch-accounts.mjs" });
});

test("pseudonyms number authors by first appearance; mentions of them are masked", () => {
  const names = pseudonyms(site().topic);
  assert.deepEqual([...names], [["alice", "Participant 1"], ["bob", "Participant 2"], ["carol", "Participant 3"]]);
  assert.equal(maskMentions("Thanks @Alice and @bob. @dave, and mail@alice.example", names), "Thanks @Participant 1 and @Participant 2. @dave, and mail@alice.example");
  assert.equal(maskMentions("mail@alice (@alice)\n@carol", names), "mail@alice (@Participant 1)\n@Participant 3");
  assert.equal(maskMentions("@bob.", names), "@Participant 2.");
});

test("topic stats count posts, people and account ages at the snapshot", () => {
  assert.deepEqual(topicStats(site().topic, SNAPSHOT), { threads: 1, posts: 4, participants: 3, medianYears: ((Date.parse(SNAPSHOT) - Date.parse("2016-01-01T00:00:00Z")) / 864e5 + (Date.parse(SNAPSHOT) - Date.parse("2026-09-20T00:00:00Z")) / 864e5) / 2 / 365.25, joinedRecently: 1, unknownAge: 1, lastPostAt: "2026-10-31T20:00:00Z" });
  assert.equal(accountAgeLabel(accounts.alice, SNAPSHOT), "10 years on the forum");
  assert.equal(accountAgeLabel(accounts.bob, SNAPSHOT), "41 days on the forum");
  assert.equal(accountAgeLabel({ created_at: "2026-10-30T22:00:00Z", status: "ok" }, SNAPSHOT), "0 days on the forum");
  assert.equal(accountAgeLabel({ created_at: "2026-10-30T21:00:00Z", status: "ok" }, SNAPSHOT), "1 day on the forum");
  assert.equal(accountAgeLabel({ created_at: "2025-06-01T00:00:00Z", status: "ok" }, SNAPSHOT), "16 months on the forum");
  assert.equal(accountAgeLabel(accounts.carol, SNAPSHOT), "profile hidden");
});

test("grey reasons: below the minimum score, or carrying a chosen trait; hidden posts never", () => {
  const [first, second, hidden, fourth] = site().topic.threads[0].posts;
  const settings = { ...DEFAULT_SETTINGS, minMaturity: 4, greyTraits: ["repeats", "contempt"] };
  assert.deepEqual(greyReasons(first, settings), []);
  assert.deepEqual(greyReasons(second, settings), ["maturity 3 is below your minimum of 4"]);
  assert.deepEqual(greyReasons(fourth, settings), ["Repeats"]);
  assert.deepEqual(greyReasons(fourth, { ...settings, minMaturity: 5, greyTraits: ["no-content", "repeats"] }), ["maturity 4 is below your minimum of 5", "Repeats", "No content"]);
  assert.deepEqual(greyReasons(hidden, { ...settings, minMaturity: 10 }), []);
  assert.deepEqual(greyReasons(first, { ...settings, minMaturity: 1, greyTraits: [] }), []);
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
  const saved = { ...DEFAULT_SETTINGS, anonymous: true, minMaturity: 10, greyTraits: ["contempt"], since: { kind: "last-visit" }, interests: ["grants"] };
  assert.deepEqual(parseSettings(JSON.stringify(saved)), saved);
  const reject = (patch, message) => assert.throws(() => parseSettings(JSON.stringify({ ...DEFAULT_SETTINGS, ...patch })), { message: `saved settings are invalid: ${message}` });
  reject({ minMaturity: 0 }, "minMaturity must be 1–10");
  reject({ minMaturity: 4.5 }, "minMaturity must be 1–10");
  reject({ anonymous: "yes" }, "anonymous must be true or false");
  reject({ greyTraits: ["contempt", "contempt"] }, "greyTraits must list distinct ids from contempt, motives, repeats, unsupported, one-sided, strawman, no-content");
  reject({ interests: ["cooking"] }, "interests must list distinct ids from governance, protocol, grants, developers");
  reject({ since: { kind: "hours", hours: 0 } }, 'since is {"kind":"hours","hours":0}');
  reject({ since: { kind: "none", hours: 3 } }, 'since is {"kind":"none","hours":3}');
  reject({ extra: 1 }, "keys are anonymous, extra, greyTraits, interests, minMaturity, showRatings, since");
  assert.throws(() => parseSettings("[]"), { message: "saved settings are invalid: not an object" });
});

test("maturity bands follow SPEC §5 and reject anything outside 1–10", () => {
  assert.deepEqual([1, 3, 4, 6, 7, 10].map(maturityBand), ["low", "low", "mid", "mid", "high", "high"]);
  for (const bad of [0, 11, 5.5, null]) assert.throws(() => maturityBand(bad), /maturity score must be an integer 1–10/);
});

test("the rating ids in vocab.js match the Rust server's", () => {
  const rust = readFileSync(new URL("../server/src/ratings.rs", import.meta.url), "utf8");
  const declared = /const LEVEL_IDS: \[&str; 4\] = \[([^\]]*)\];/.exec(rust);
  assert.notEqual(declared, null, "LEVEL_IDS not found in server/src/ratings.rs");
  assert.deepEqual(declared[1].split(",").map((id) => id.trim().replace(/^"|"$/g, "")), RATING_IDS);
});
