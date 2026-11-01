import assert from "node:assert/strict";
import test from "node:test";
import { validateMarks, collapseWhitespace } from "../tools/lib/validate-marks.mjs";
import { DIMENSION_IDS } from "../site/js/rubric.js";
import { goodMarks } from "./marks-fixture.mjs";
import { sampleThread } from "./helpers.mjs";

const validate = (output) => validateMarks(output, { topic_id: 7, expected: [1, 2, 4] }, sampleThread());

test("original evaluations accept independent scores, null with reason, allegations, audit and context", () => {
  assert.deepEqual(validate(goodMarks()), []);
  assert.equal(collapseWhitespace("  a \n\t b  "), "a b");
  const output = goodMarks();
  output.posts[0].dimensions.reasoning.evidence_spans[0] = "It costs 8%  of every block\nand $100M sits idle.";
  assert.deepEqual(validate(output), []);
  for (const id of DIMENSION_IDS) for (const score of [null, 0, 1, 2, 3]) {
    const output = goodMarks();
    output.posts[0].dimensions[id].score = score;
    output.posts[0].dimensions[id].null_reason = score === null ? "insufficient_context" : null;
    if (id === "tone") output.posts[0].tone_peak = score === null ? null : { ...output.posts[0].tone_peak, score };
    assert.deepEqual(validate(output), []);
  }
});

test("coverage and rubric version are mandatory and legacy marks are rejected", () => {
  const output = goodMarks(); output.posts.pop();
  assert.deepEqual(validate(output), ["output.posts: has 2 entries; expected 3 to 3", "output.posts: must cover exactly posts 1, 2, 4 in that order; got 1, 2"]);
  const legacy = { task: "marks", topic_id: 7, posts: [] };
  assert.deepEqual(validate(legacy), ["output: missing key(s) rubric_version"]);
  const wrong = goodMarks(); wrong.rubric_version = "old";
  assert.deepEqual(validate(wrong), ["output.rubric_version: must be reading-0.1-provisional"]);
  const badId = goodMarks(); badId.posts[0].claims[0].claim_id = "c1\n";
  assert.deepEqual(validate(badId), ["posts[0] (#1).claims[0].claim_id: must look like c1"]);
});

test("all numeric assessments require authored evidence; null requires an explicit reason", () => {
  for (const id of DIMENSION_IDS) {
    for (const score of [-1, 4, 1.5, NaN, Infinity, "2"]) {
      const output = goodMarks(); output.posts[0].dimensions[id].score = score;
      if (id === "tone") output.posts[0].tone_peak.score = 0;
      const expected = [`posts[0] (#1).dimensions.${id}.score: must be an integer 0–3; got ${JSON.stringify(score)}`];
      if (id === "tone" && score === -1) expected.push("posts[0] (#1).tone_peak.score: cannot be higher than assessed predominant tone");
      assert.deepEqual(validate(output), expected);
    }
    const missing = goodMarks(); missing.posts[0].dimensions[id].evidence_spans = [];
    assert.deepEqual(validate(missing), [`posts[0] (#1).dimensions.${id}.evidence_spans: has 0 entries; expected 1 to 50`]);
    const absent = goodMarks(); absent.posts[0].dimensions[id].score = null;
    if (id === "tone") absent.posts[0].tone_peak = null;
    assert.deepEqual(validate(absent), [`posts[0] (#1).dimensions.${id}.null_reason: must be one of not_applicable, insufficient_context; got null`]);
  }
});

test("quoted attacks cannot be used as authored evidence; available parents and visible refs are required", () => {
  const output = goodMarks();
  output.posts[1].flags[0].exact_span = "ZCG should end.";
  output.posts[1].context_refs = ["7/3"];
  assert.deepEqual(validate(output), [
    'posts[1] (#2).context_refs: unknown or hidden post "7/3"',
    'posts[1] (#2).context_refs: must include available parent 7/1',
    'posts[1] (#2).flags[0].exact_span: not verbatim authored text: "ZCG should end."',
  ]);
});

test("renditions account for every extracted claim and separate grounded interpretation", () => {
  const output = goodMarks();
  output.posts[1].rewrite_changes[0].preserved_claim_ids = ["c2"];
  output.posts[1].editor_analysis[0].evidence_spans = [];
  assert.deepEqual(validate(output), [
    "posts[1] (#2).editor_analysis[0].evidence_spans: has 0 entries; expected 1 to 50",
    "posts[1] (#2).rewrite_changes: does not account for claim c1",
  ]);
  const noRewrite = goodMarks(); noRewrite.posts[1].neutral_rendition = null;
  assert.deepEqual(validate(noRewrite), ["posts[1] (#2).rewrite_changes: has 1 entries; expected 0 to 0"]);
  const noPeak = goodMarks(); noPeak.posts[1].tone_peak = null;
  assert.deepEqual(validate(noPeak), ["posts[1] (#2).tone_peak: required when tone is assessed"]);
});

test("malformed nested records are reported at the boundary without throwing", () => {
  const replacements = [null, false, 0, "", [], {}];
  for (const key of Object.keys(goodMarks().posts[0])) for (const value of replacements) {
    const output = goodMarks(); output.posts[0][key] = value;
    const problems = validate(output);
    assert.equal(Array.isArray(problems), true, `${key}=${JSON.stringify(value)}`);
  }
  for (const key of ["claims", "flags", "editor_analysis", "rewrite_changes"]) for (const value of replacements) {
    const output = goodMarks(); output.posts[0][key] = [value];
    assert.notEqual(validate(output).length, 0, `${key}=[${JSON.stringify(value)}]`);
  }
  for (const id of DIMENSION_IDS) for (const value of replacements) {
    const output = goodMarks(); output.posts[0].dimensions[id] = value;
    assert.notEqual(validate(output).length, 0);
  }
});
