import assert from "node:assert/strict";
import test from "node:test";

import { chunkThread, marksJobs, postKey, summaryJob, threadView } from "../tools/lib/jobs.mjs";
import { ownText, parseQuoteParam, segments } from "../tools/lib/quotes.mjs";
import { parseStrictJson } from "../tools/lib/strict-json.mjs";
import { validateSummary } from "../tools/lib/validate.mjs";
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

test("jobs: structured views identify targets, quote claims, and hidden posts", () => {
  const thread = sampleThread();
  const [{ job, view }] = marksJobs(thread, 100000);
  assert.deepEqual(job, { task: "marks", name: "marks-7-1-4", topic_id: 7, expected: [1, 2, 4] });
  const source=JSON.parse(view);
  assert.deepEqual(source.target_post_ids,['7/1','7/2','7/4']);
  assert.deepEqual(source.threads[0].posts[1],{id:'7/2',author:'bob',timestamp:thread.posts[1].created_at,reply_target:'7/1',hidden:false,segments:[{type:'quote',text:'ZCG should end.',claimed_source:{name:'alice',username:'alice',topic:7,post:1},verification:{status:'matched_available_source',source_post_id:'7/1'}},{type:'text',text:'You are clearly paid to say that. ZCG funded 400 grants.'}]});
  assert.equal(source.threads[0].posts[2].hidden,true);
  assert.deepEqual(source.threads[0].posts[2].segments,[]);
  assert.equal(JSON.parse(threadView(thread, { focus: null, quoteLimit: 5 })).threads[0].posts[1].segments[0].text,'ZCG should end.');
  assert.deepEqual(summaryJob("zcg", [thread]).job, { task: "summary", name: "summary-zcg", topic: "zcg", citable: ["7/1", "7/2", "7/4"] });
  assert.equal(postKey(58515, 12), "58515/12");
});

const goodSummary = () => ({
  task: "summary",
  topic: "zcg",
  card: { title: "Sample", byline: "A sample debate.", keywords: ["a", "b"], interests: ["grants"] },
  headline: "Sample headline",
  overview: [{ text: "One.", cites: ["7/1"] }, { text: "Two.", cites: ["7/2", "7/4"] }],
  points: ["7/1", "7/2", "7/4", "7/1", "7/2", "7/4"].map((key, index) => ({ id: `p${index + 1}`, text: `Point ${index + 1}.`, cites: [key] })),
  issues: Array.from({ length: 5 }, (_, index) => ({
    id: `q${index + 1}`, issue: "A question?", description: { text: "The disagreement.", cites: ["7/1"] },
    decision_at_stake: { text: "The choice.", cites: ["7/1"] },
    positions_with_post_references: [{ label: "First", text: "For.", cites: ["7/1"] }, { label: "Second", text: "Against.", cites: ["7/2"] }],
    unresolved_status: { text: "Still open.", cites: ["7/2"] },
    points: index === 4 ? ["p5", "p6"] : [`p${index + 1}`], related_issues: [],
    shared_premises_if_actually_shared: [], disputed_factual_claims: [], disputed_values_or_authority: [],
    evidence_and_its_limits: [], strongest_material_objections: [], what_would_resolve_or_clarify: [],
  })),
});

test("validateSummary accepts a correct summary and rejects bad citations, ids and order", () => {
  const job = { topic: "zcg", citable: ["7/1", "7/2", "7/4"] };
  assert.deepEqual(validateSummary(goodSummary(), job, [sampleThread()]), []);
  const bad = goodSummary();
  bad.card.interests = ["grants", "cooking"];
  bad.overview[0].cites = ["7/3"];
  bad.points[1].id = "p1";
  bad.points[2].cites = ["7/4", "7/1"];
  bad.issues[1].points = ["p9"];
  assert.deepEqual(validateSummary(bad, job, [sampleThread()]), [
    'card.interests: unknown interest "cooking"; use governance, protocol, grants, developers',
    'overview[0].cites: "7/3" is not a visible post in this topic (use "topicId/postNumber")',
    "points[1].id: p1 is used twice",
    "points[2].cites: the first cite must be the earliest post making the point",
    'issues[1].points: unknown point "p9"',
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
