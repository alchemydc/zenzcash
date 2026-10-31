import assert from "node:assert/strict";
import test from "node:test";

import { UNSURE, answeredCount, answersFor, holderCount, relevantIssues, threadAlignment, viewAlignment, widthClass } from "../js/alignment.js";

const issues = [
  { issue_id: "i1", stances: [{ stance_id: "s1" }, { stance_id: "s2" }], mapping: [{ topic_id: 100, view_id: "v1", stance_id: "s1" }, { topic_id: 100, view_id: "v2", stance_id: "s2" }, { topic_id: 200, view_id: "v1", stance_id: "s2" }] },
  { issue_id: "i2", stances: [{ stance_id: "s1" }, { stance_id: "s2" }], mapping: [{ topic_id: 100, view_id: "v1", stance_id: "s2" }, { topic_id: 300, view_id: "v1", stance_id: "s1" }] },
];

const brief = {
  views: [
    { view_id: "v1", holders: ["a", "b", "c"], best_against: { post_number: 7, quote: "no", author: "d" } },
    { view_id: "v2", holders: ["d", "a"], best_against: null },
    { view_id: "v3", holders: ["e"], best_against: null },
  ],
};

test("viewAlignment covers matches, opposes, mixed and unknown", () => {
  assert.equal(viewAlignment(issues, { i1: "s1" }, 100, "v1"), "matches");
  assert.equal(viewAlignment(issues, { i1: "s1" }, 100, "v2"), "opposes");
  assert.equal(viewAlignment(issues, { i1: "s1", i2: "s1" }, 100, "v1"), "mixed");
  assert.equal(viewAlignment(issues, { i1: "s1", i2: "s2" }, 100, "v1"), "matches");
  assert.equal(viewAlignment(issues, { i1: "s1" }, 100, "v3"), "unknown");
  assert.equal(viewAlignment(issues, { i1: UNSURE }, 100, "v1"), "unknown");
  assert.equal(viewAlignment(issues, {}, 100, "v1"), "unknown");
});

test("threadAlignment counts who stands with the reader and finds the best point against", () => {
  const result = threadAlignment(issues, { i1: "s1" }, 100, brief);
  assert.deepEqual(result.statuses.map((item) => item.status), ["matches", "opposes", "unknown"]);
  assert.equal(result.known, true);
  assert.equal(result.withReader, 3);
  assert.equal(result.sided, 5);
  assert.deepEqual(result.against, [{ view: brief.views[0], quote: { post_number: 7, quote: "no", author: "d" } }]);
});

test("threadAlignment with no answers knows nothing", () => {
  const result = threadAlignment(issues, {}, 100, brief);
  assert.equal(result.known, false);
  assert.deepEqual(result.against, []);
});

test("relevantIssues, answeredCount and answersFor", () => {
  assert.deepEqual(relevantIssues(issues, 300).map((issue) => issue.issue_id), ["i2"]);
  assert.deepEqual(relevantIssues(issues, 999), []);
  assert.equal(answeredCount(issues, { i1: UNSURE }), 1);
  assert.deepEqual(answersFor({ snapshot: "A", answers: { i1: "s1" } }, "A"), { i1: "s1" });
  assert.deepEqual(answersFor({ snapshot: "A", answers: { i1: "s1" } }, "B"), {});
  assert.deepEqual(answersFor(null, "A"), {});
});

test("holderCount counts distinct people across views", () => {
  assert.equal(holderCount(brief), 5);
});

test("widthClass rounds to tens, never shows a non-zero share as empty", () => {
  assert.equal(widthClass(0, 10), "w-0");
  assert.equal(widthClass(1, 100), "w-10");
  assert.equal(widthClass(5, 10), "w-50");
  assert.equal(widthClass(10, 10), "w-100");
  assert.equal(widthClass(3, 0), "w-0");
  for (let part = 0; part <= 37; part += 1) {
    const percent = Number(widthClass(part, 37).slice(2));
    assert.ok(percent >= 0 && percent <= 100 && percent % 10 === 0);
    if (part > 0) assert.ok(percent >= 10);
  }
});
