import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateSummary } from "../tools/lib/validate.mjs";
import { parseAcceptanceArgs } from "../tools/accept.mjs";
import { ISSUE_DETAIL_IDS } from "../site/js/summary-fields.js";
import { random } from "./helpers.mjs";

const record = JSON.parse(readFileSync(new URL("../model/results/summary/summary-zcg.json", import.meta.url), "utf8"));
const summary = () => structuredClone(record.output);
// This catalog exercises structural validation without requiring the uncommitted crawl.
// The build separately checks the real snapshot, including citation chronology.
const refs = new Set();
function collect(value) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value.cites)) value.cites.forEach((key) => refs.add(key));
  Object.values(value).forEach(collect);
}
collect(record.output);
const job = { topic: "zcg", citable: [...refs] };
const threads = [...new Set([...refs].map((key) => Number(key.split("/")[0])))].map((id) => ({
  id, posts: [...refs].filter((key) => key.startsWith(`${id}/`)).map((key) => ({ number: Number(key.split("/")[1]), created_at: "2026-10-01T00:00:00Z" })),
}));
const validate = (output) => validateSummary(output, job, threads);

test("six concise question cards preserve all twenty argument identities and first citations", () => {
  const output = summary();
  assert.deepEqual(validate(output), []);
  assert.deepEqual(output.issues.map((issue) => [issue.id, issue.issue, issue.points]), [
    ["q1", "Who should control the funding?", ["p1", "p7"]],
    ["q2", "Is ZCG funding useful work?", ["p2", "p5", "p8"]],
    ["q3", "How much funding should continue?", ["p3", "p4", "p6", "p10", "p11"]],
    ["q4", "Where should the money go?", ["p9", "p12", "p13", "p14", "p15"]],
    ["q5", "What should adoption grants support?", ["p17", "p18", "p19", "p20"]],
    ["q6", "How should a change be decided?", ["p16"]],
  ]);
  const firstCites = ["58515/1", "58515/1", "58515/51", "58515/1", "58566/18", "58515/33", "58515/27", "58515/20", "58515/20", "58515/12", "58515/11", "58515/1", "58515/2", "58566/1", "58566/4", "58515/30", "58656/1", "58656/3", "58515/62", "58515/121"];
  assert.deepEqual(output.points.map((point) => [point.id, point.cites[0]]), firstCites.map((key, index) => [`p${index + 1}`, key]));
  assert.deepEqual(output.issues.map((issue) => [issue.decision_at_stake.text, ...issue.positions_with_post_references.map((position) => position.text), issue.unresolved_status.text].join(" ").split(/\s+/).length), [64, 66, 71, 71, 70, 66]);
  assert.equal(output.overview.length, 3);
  assert.equal(Object.hasOwn(output, "groupings"), false);
  assert.equal(record.backend, "primary-agent");
});

test("every citation-bearing field rejects unknown, hidden or duplicate references", () => {
  const statementFields = ["description", "decision_at_stake", "unresolved_status", ...ISSUE_DETAIL_IDS];
  for (const field of statementFields) {
    const output = summary();
    const invalid = { text: "A supported statement needs a real source.", cites: ["0/0"] };
    const array = ISSUE_DETAIL_IDS.includes(field);
    output.issues[0][field] = array ? [invalid] : invalid;
    assert.deepEqual(validate(output), [`issues[0].${field}${array ? "[0]" : ""}.cites: "0/0" is not a visible post in this topic (use "topicId/postNumber")`]);
  }
  const positions = summary();
  positions.issues[0].positions_with_post_references[0].cites = ["58515/1", "58515/1"];
  assert.deepEqual(validate(positions), ["issues[0].positions_with_post_references[0].cites: cites a post twice"]);
});

test("summary schema rejects missing fields, malformed objects, old groupings and invalid links", () => {
  const cases = [
    [(o) => { o.issues[0].description = null; }, ["issues[0].description: expected an object, got null"]],
    [(o) => { delete o.issues[0].evidence_and_its_limits; }, ["issues[0]: missing key(s) evidence_and_its_limits", "issues: point p1 has no home", "issues: point p7 has no home"]],
    [(o) => { o.issues[0].groupings = []; }, ["issues[0]: unexpected key(s) groupings"]],
    [(o) => { o.issues[0].description.text = " "; }, ["issues[0].description.text: must be a non-empty string"]],
    [(o) => { o.issues[0].description.text = "x".repeat(221); }, ["issues[0].description.text: is 221 characters; at most 220"]],
    [(o) => { o.issues[0].related_issues = ["q1", "q99"]; }, ["issues[0].related_issues: cannot refer to itself", 'issues[0].related_issues: unknown issue "q99"']],
    [(o) => { o.issues[0].related_issues = ["q2", "q2"]; }, ["issues[0].related_issues: repeats an issue"]],
    [(o) => { o.issues[0].positions_with_post_references = []; }, ["issues[0].positions_with_post_references: has 0 entries; expected 2 to 5"]],
    [(o) => { o.issues[0].evidence_and_its_limits = "guess"; }, ["issues[0].evidence_and_its_limits: must be an array"]],
    [(o) => { o.issues[0].decision_at_stake.cites = []; }, ["issues[0].decision_at_stake.cites: has 0 entries; expected 1 to 6"]],
  ];
  for (const [mutate, expected] of cases) {
    const output = summary();
    mutate(output);
    assert.deepEqual(validate(output), expected);
  }
});

test("coverage gate accepts generated partitions and detects any missing or repeated argument", () => {
  const rng = random(59);
  for (let trial = 0; trial < 80; trial++) {
    const output = summary();
    const shuffled = output.points.map((point) => point.id);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    output.issues.forEach((issue, index) => { issue.points = [shuffled[index]]; });
    shuffled.slice(output.issues.length).forEach((id) => output.issues[rng.int(0, output.issues.length - 1)].points.push(id));
    assert.deepEqual(validate(output), []);
    const home = output.issues.find((issue) => issue.points.length > 1);
    const missing = home.points.pop();
    assert.deepEqual(validate(output), [`issues: point ${missing} has no home`]);
    home.points.push(missing);
    output.issues[5].points.push(output.issues[0].points[0]);
    assert.deepEqual(validate(output), [`issues[5].points: ${output.issues[0].points[0]} already has a home; use related_issues to cross-reference it`]);
  }
});

test("acceptance records explicit backend provenance and rejects incomplete or ambiguous CLI inputs", () => {
  for (const backend of ["primary-agent", "subagent"]) assert.deepEqual(parseAcceptanceArgs(["job", "--model", "model", "--backend", backend]), { directory: "job", model: "model", backend });
  for (const args of [[], ["job", "--model", "model"], ["job", "--model", " ", "--backend", "primary-agent"], ["job", "--model", "model", "--backend", "unknown"], ["job", "--model", "model", "--backend", "subagent", "extra"]]) {
    assert.throws(() => parseAcceptanceArgs(args), { message: `invalid acceptance arguments ${JSON.stringify(args)}; usage: node tools/accept.mjs <job-directory> --model <model-id> --backend primary-agent|subagent` });
  }
});
