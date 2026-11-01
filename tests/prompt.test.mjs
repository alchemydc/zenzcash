import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { promptHash } from "../tools/lib/prompt.mjs";
import { sha256 } from "../tools/lib/jobs.mjs";

test("marks provenance hashes both instructions and authoritative rubric; summary remains independent", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const prompt = read("../model/marks.md"), rubric = read("../site/js/rubric.js");
  assert.equal(promptHash("marks"), sha256(`${prompt}\n${rubric}`));
  assert.notEqual(promptHash("marks"), sha256(prompt));
  assert.notEqual(promptHash("marks"), sha256(`${prompt}\n${rubric}changed`));
  assert.equal(promptHash("summary"), JSON.parse(read("../model/results/summary/summary-zcg.json")).prompt_sha256);
});
