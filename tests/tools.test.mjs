import assert from "node:assert/strict";
import test from "node:test";

import { chunkThread, marksJobs, postKey, summaryJob, threadView } from "../tools/lib/jobs.mjs";
import { ownText, parseQuoteParam, segments } from "../tools/lib/quotes.mjs";
import { parseStrictJson } from "../tools/lib/strict-json.mjs";
import { cleanLengthLimit, collapseWhitespace, preservedTokens, validateMarks, validateSummary } from "../tools/lib/validate.mjs";
import { formatReport, summarizeFeedback } from "../tools/feedback-report.mjs";
import { post, random, sampleThread } from "./helpers.mjs";

test("strict JSON parses what JSON.stringify writes, for generated values", () => {
  const rng = random(1);
  const value = (depth) => {
    const kind = depth > 3 ? rng.int(0, 3) : rng.int(0, 5);
    switch (kind) {
      case 0: return null;
      case 1: return rng.next() < 0.5;
      case 2: return rng.pick([0, -1, 1.5, 1e21, -2.5e-7, 123456789]);
      case 3: return rng.pick(["", "plain", "quote \" and \\ backslash", "line\nbreak\ttab", "ünïcødé ✓", "\u0001"]);
      case 4: return Array.from({ length: rng.int(0, 4) }, () => value(depth + 1));
      default: return Object.fromEntries(Array.from({ length: rng.int(0, 4) }, (_, index) => [`k${index}${rng.pick(["", "x", "é"])}`, value(depth + 1)]));
    }
  };
  for (let run = 0; run < 500; run += 1) {
    const original = value(0);
    for (const text of [JSON.stringify(original), JSON.stringify(original, null, 2)]) assert.deepEqual(parseStrictJson(text, "generated"), original);
  }
});

test("strict JSON rejects duplicate keys and malformed input, naming the problem", () => {
  assert.throws(() => parseStrictJson('{"a":1,"a":2}', "f.json"), { message: 'f.json: invalid JSON at offset 7: duplicate key "a"' });
  assert.throws(() => parseStrictJson('{"a":{"b":1,"b":1}}', "f.json"), /duplicate key "b"/);
  assert.throws(() => parseStrictJson("[1,]", "f.json"), { message: 'f.json: invalid JSON at offset 3: unexpected "]"' });
  assert.throws(() => parseStrictJson('{"a":1} x', "f.json"), { message: "f.json: invalid JSON at offset 8: trailing content after the JSON value" });
  assert.throws(() => parseStrictJson('"\\x"', "f.json"), /bad string escape/);
  assert.throws(() => parseStrictJson("NaN", "f.json"), /unexpected "N"/);
  assert.throws(() => parseStrictJson('"a\nb"', "f.json"), /control character in string/);
  assert.equal(Object.getPrototypeOf(parseStrictJson('{"__proto__":{"x":1}}', "f.json")), Object.prototype);
  assert.deepEqual(Object.keys(parseStrictJson('{"__proto__":{"x":1}}', "f.json")), ["__proto__"]);
});

test("quotes: outermost blocks are split out with their source; unmatched tags stay text", () => {
  const raw = 'Intro\n[quote="alice, post:1, topic:7"]\nouter [quote="bob, post:2, topic:7"]inner[/quote] end\n[/quote]\nReply [quote] not closed';
  assert.equal(ownText(raw), "Intro\n\nReply [quote] not closed");
  assert.deepEqual(segments(raw), [
    { kind: "text", text: "Intro" },
    { kind: "quote", source: { name: "alice", username: "alice", post: 1, topic: 7 }, text: 'outer [quote="bob, post:2, topic:7"]inner[/quote] end' },
    { kind: "text", text: "Reply [quote] not closed" },
  ]);
  assert.deepEqual(parseQuoteParam('"Alice Smith, post:3, topic:9, username:alice"'), { name: "Alice Smith", username: "alice", post: 3, topic: 9 });
  assert.deepEqual(parseQuoteParam('"alice"'), { name: "alice", username: "alice", post: null, topic: null });
  assert.deepEqual(parseQuoteParam('"alice, post:03, topic:9"'), { name: "alice", username: "alice", post: null, topic: null });
});

test("quotes: own text never contains an outermost quote block, for generated posts", () => {
  const rng = random(2);
  for (let run = 0; run < 300; run += 1) {
    const pieces = Array.from({ length: rng.int(1, 6) }, () => rng.pick(["text", "more words", "\n\n", '[quote="x, post:1, topic:2"]q[/quote]', "[QUOTE]Q[/QUOTE]", "[/quote]", "[quote]"]));
    const raw = pieces.join(rng.pick(["", " ", "\n"]));
    const own = ownText(raw);
    const quoteTexts = segments(raw).filter((segment) => segment.kind === "quote").map((segment) => segment.text);
    for (const text of quoteTexts) assert.ok(!own.includes(`]${text}[/`), `own text ${JSON.stringify(own)} still holds quote ${JSON.stringify(text)}`);
    assert.equal(own, own.trim());
  }
});

test("jobs: chunks cover every visible post exactly once, in order, within the chunk count bound", () => {
  const rng = random(3);
  for (let run = 0; run < 200; run += 1) {
    const posts = Array.from({ length: rng.int(1, 80) }, (_, index) => post(index + 1, "u", "2026-10-30T10:00:00Z", "x".repeat(rng.int(1, 3000)), { hidden: rng.next() < 0.05 }));
    if (posts.every((candidate) => candidate.hidden)) continue;
    const thread = { id: 1, title: "t", posts };
    const budget = rng.int(500, 20000);
    const chunks = chunkThread(thread, budget);
    const visible = posts.filter((candidate) => !candidate.hidden).map((candidate) => candidate.number);
    assert.deepEqual(chunks.flat(), visible);
    assert.ok(chunks.every((chunk) => chunk.length > 0));
    const total = posts.filter((candidate) => !candidate.hidden).reduce((sum, candidate) => sum + candidate.raw.length, 0);
    assert.ok(chunks.length <= Math.max(1, Math.ceil(total / budget)));
  }
});

test("jobs: views mark the posts to write, show quotes as quotes, and say hidden posts need nothing", () => {
  const thread = sampleThread();
  const [{ job, view }] = marksJobs(thread, 100000);
  assert.deepEqual(job, { task: "marks", name: "marks-7-1-4", topic_id: 7, expected: [1, 2, 4] });
  assert.ok(view.startsWith("You write entries for the 3 posts marked ▶ (t/7 #1 to #4). Every other post is context only."));
  assert.ok(view.includes("## ▶ 7/2 · @bob · 2026-10-30 12:00 UTC · replying to #1\n\n[quoting @alice t/7#1]\n> ZCG should end.\n[end quote]\n\nYou are clearly paid to say that."));
  assert.ok(view.includes("## 7/3 · @carol · 2026-10-31 09:00 UTC\n[Hidden by the forum community. No text, and no entry needed.]"));
  assert.equal(threadView(thread, { focus: null, quoteLimit: 5 }).includes("> ZCG s …[quote clipped]"), true);
  assert.deepEqual(summaryJob("zcg", [thread]).job, { task: "summary", name: "summary-zcg", topic: "zcg", citable: ["7/1", "7/2", "7/4"] });
  assert.equal(postKey(58515, 12), "58515/12");
});

const goodMarks = () => ({
  task: "marks",
  topic_id: 7,
  posts: [
    { post_number: 1, maturity: 6, maturity_reason: "States a position with figures.", clean: null, traits: [{ trait: "unsupported", reason: "No source for $100M.", quote: "$100M sits   idle" }] },
    { post_number: 2, maturity: 3, maturity_reason: "Attacks motives.", clean: "That position may be influenced by payment. ZCG funded 400 grants.", traits: [{ trait: "motives", reason: "Imputes payment.", quote: "You are clearly paid to say that." }] },
    { post_number: 4, maturity: 4, maturity_reason: "Mostly agreement.", clean: null, traits: [{ trait: "repeats", reason: "Restates #1.", quote: "ZCG should end." }] },
  ],
});

test("validateMarks accepts a correct output, comparing quotes with whitespace collapsed", () => {
  assert.deepEqual(validateMarks(goodMarks(), { topic_id: 7, expected: [1, 2, 4] }, sampleThread()), []);
  assert.equal(collapseWhitespace("  a \n\t b  "), "a b");
});

test("validateMarks reports every problem with its location", () => {
  const output = goodMarks();
  output.posts[0].maturity = 11;
  output.posts[0].traits.push({ trait: "unsupported", reason: "again", quote: "ZCG should end." }, { trait: "rude", reason: "r", quote: "ZCG" });
  output.posts[1].traits[0].quote = "ZCG should end.";
  output.posts[1].clean = "That position may be influenced by payment.";
  output.posts[2].extra = true;
  assert.deepEqual(validateMarks(output, { topic_id: 7, expected: [1, 2, 4] }, sampleThread()), [
    "posts[0] (#1).maturity: must be an integer 1–10",
    "posts[0] (#1).traits[1].trait: unsupported appears twice on this post",
    'posts[0] (#1).traits[2].trait: unknown trait "rude"; use one of contempt, motives, repeats, unsupported, one-sided, strawman, no-content',
    "posts[1] (#2).clean: drops the number 400",
    'posts[1] (#2).traits[0].quote: is not verbatim in the author\'s own words: "ZCG should end."',
    "posts[2] (#4): unexpected key(s) extra",
  ]);
});

test("validateMarks requires exact coverage and keeps links and numbers in restatements", () => {
  const output = goodMarks();
  output.posts.pop();
  assert.deepEqual(validateMarks(output, { topic_id: 7, expected: [1, 2, 4] }, sampleThread()), [
    "output.posts: has 2 entries; expected 3 to 3",
    "output.posts: must cover exactly posts 1, 2, 4 in that order; got 1, 2",
  ]);
  const dropsLink = goodMarks();
  dropsLink.posts[0].clean = "ZCG should end. It costs 8% of every block and $100M sits idle.";
  assert.deepEqual(validateMarks(dropsLink, { topic_id: 7, expected: [1, 2, 4] }, sampleThread()), ["posts[0] (#1).clean: drops the link https://example.org/report"]);
  assert.deepEqual(preservedTokens("Pay 1,000,000 ZEC by 2028 (item 1), see https://a.example/x?y=1."), { urls: ["https://a.example/x?y=1."], numbers: ["1,000,000", "2028"] });
  assert.equal(cleanLengthLimit("x".repeat(100)), 330);
  const tooLong = goodMarks();
  tooLong.posts[1].clean = `${tooLong.posts[1].clean} ${"y".repeat(400)}`;
  assert.match(validateMarks(tooLong, { topic_id: 7, expected: [1, 2, 4] }, sampleThread())[0], /^posts\[1\] \(#2\)\.clean: is \d+ characters; at most \d+$/);
});

const goodSummary = () => ({
  task: "summary",
  topic: "zcg",
  card: { title: "Sample", byline: "A sample debate.", keywords: ["a", "b"], interests: ["grants"] },
  headline: "Sample headline",
  overview: [{ text: "One.", cites: ["7/1"] }, { text: "Two.", cites: ["7/2", "7/4"] }],
  points: ["7/1", "7/2", "7/4", "7/1"].map((key, index) => ({ id: `p${index + 1}`, text: `Point ${index + 1}.`, cites: [key] })),
  groupings: { disclaimer: "Approximate.", groups: [{ label: "G", note: "N", points: ["p1", "p2"] }] },
});

test("validateSummary accepts a correct summary and rejects bad citations, ids and order", () => {
  const job = { topic: "zcg", citable: ["7/1", "7/2", "7/4"] };
  assert.deepEqual(validateSummary(goodSummary(), job, [sampleThread()]), []);
  const bad = goodSummary();
  bad.card.interests = ["grants", "cooking"];
  bad.overview[0].cites = ["7/3"];
  bad.points[1].id = "p1";
  bad.points[2].cites = ["7/4", "7/1"];
  bad.groupings.groups[0].points = ["p9"];
  assert.deepEqual(validateSummary(bad, job, [sampleThread()]), [
    'card.interests: unknown interest "cooking"; use governance, protocol, grants, developers',
    'overview[0].cites: "7/3" is not a visible post in this topic (use "topicId/postNumber")',
    "points[1].id: p1 is used twice",
    "points[2].cites: the first cite must be the earliest post making the point",
    'groupings.groups[0].points: unknown point "p9"',
  ]);
});

const readerId = (n) => n.toString(16).padStart(32, "0");

test("the feedback report counts each reader once per post and averages the answers given", () => {
  const store = {
    format: "zforum-feedback-1",
    entries: {
      "58566/3": { [readerId(1)]: { emotions: 10, head: null } },
      "58515/22": { [readerId(1)]: { emotions: 7, head: 2 }, [readerId(2)]: { emotions: 4, head: null }, [readerId(3)]: { emotions: null, head: 9 } },
      "58515/100": { [readerId(2)]: { emotions: 0, head: 0 } },
    },
  };
  const summary = summarizeFeedback(store);
  assert.deepEqual(summary, {
    posts: [
      { key: "58515/22", readers: 3, emotions: { count: 2, mean: 5.5 }, head: { count: 2, mean: 5.5 } },
      { key: "58515/100", readers: 1, emotions: { count: 1, mean: 0 }, head: { count: 1, mean: 0 } },
      { key: "58566/3", readers: 1, emotions: { count: 1, mean: 10 }, head: { count: 0, mean: null } },
    ],
    overall: { emotions: { count: 4, mean: 21 / 4 }, head: { count: 3, mean: 11 / 3 } },
  });
  assert.equal(formatReport(summary), [
    "post       readers  emotions     head",
    "58515/22   3        5.5/10 (2)   5.5/10 (2)",
    "58515/100  1        0.0/10 (1)   0.0/10 (1)",
    "58566/3    1        10.0/10 (1)  —",
    "all posts           5.3/10 (4)   3.7/10 (3)",
    "",
    "Each answer cell is the mean score (number of readers who answered).",
    "Emotions: This restatement helped me avoid negative feelings.",
    "Head: I got something out of this that I wouldn't have had if it wasn't restated.",
  ].join("\n"));
  assert.equal(formatReport(summarizeFeedback({ format: "zforum-feedback-1", entries: {} })), "No restatement feedback yet.");
});

test("the feedback report refuses a store it does not understand, naming the problem", () => {
  const reject = (store, message) => assert.throws(() => summarizeFeedback(store), { message });
  reject({ format: "zforum-feedback-0", entries: {} }, 'feedback store is invalid: format is "zforum-feedback-0", expected "zforum-feedback-1"');
  reject({ format: "zforum-feedback-1" }, 'feedback store is invalid: expected {format, entries}, got keys ["format"]');
  reject({ format: "zforum-feedback-1", entries: { "58515/022": { [readerId(1)]: { emotions: 1, head: 1 } } } }, 'feedback store is invalid: "58515/022" is not a post key');
  reject({ format: "zforum-feedback-1", entries: { "58515/22": {} } }, "feedback store is invalid: 58515/22 has no readers; the server never writes that");
  reject({ format: "zforum-feedback-1", entries: { "58515/22": { someone: { emotions: 1, head: 1 } } } }, 'feedback store is invalid: 58515/22: "someone" is not a reader id');
  assert.throws(() => summarizeFeedback({ format: "zforum-feedback-1", entries: { "58515/22": { [readerId(1)]: { emotions: 11, head: 1 } } } }), { message: `58515/22/${readerId(1)}: expected {emotions, head}, each 0–10 or null, got {"emotions":11,"head":1}` });
});
