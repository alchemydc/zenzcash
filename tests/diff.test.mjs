import assert from "node:assert/strict";
import test from "node:test";
import { wordDiff } from "../site/js/diff.js";
import { random } from "./helpers.mjs";

test("diff identifies edits, preserves whitespace, and handles empty and unchanged posts", () => {
  assert.deepEqual(wordDiff("You fool. Fund it!", "Fund it!"), [{ kind: "delete", text: "You fool. " }, { kind: "equal", text: "Fund it!" }]);
  assert.deepEqual(wordDiff("Cost: 10.", "Cost: 20."), [{ kind: "equal", text: "Cost: " }, { kind: "delete", text: "10" }, { kind: "insert", text: "20" }, { kind: "equal", text: "." }]);
  assert.deepEqual(wordDiff("", ""), []);
  assert.deepEqual(wordDiff("", "Hello\n"), [{ kind: "insert", text: "Hello\n" }]);
  assert.deepEqual(wordDiff("Hello\n", ""), [{ kind: "delete", text: "Hello\n" }]);
  assert.deepEqual(wordDiff("café 🌱\n", "café 🌱\n"), [{ kind: "equal", text: "café 🌱\n" }]);
  assert.deepEqual(wordDiff("x", "a x b"), [{ kind: "insert", text: "a " }, { kind: "equal", text: "x" }, { kind: "insert", text: " b" }]);
});

test("diff reconstructs both inputs across generated insertions, deletions, repeats and Unicode", () => {
  const rng = random(5649);
  const words = ["a", "b", "", " ", "\n", "\t", "α", "💬", "<script>", "```", "23", "?", "e\u0301"];
  for (let trial = 0; trial < 600; trial++) {
    const text = () => Array.from({ length: rng.int(0, 80) }, () => rng.pick(words)).join("");
    const a = text();
    const b = text();
    const diff = wordDiff(a, b);
    assert.equal(diff.filter((run) => run.kind !== "insert").map((run) => run.text).join(""), a);
    assert.equal(diff.filter((run) => run.kind !== "delete").map((run) => run.text).join(""), b);
    assert.deepEqual(wordDiff(a, b), diff);
    for (let i = 0; i < diff.length; i++) {
      assert.notEqual(diff[i].text, "");
      if (i > 0) assert.notEqual(diff[i].kind, diff[i - 1].kind);
    }
  }
});

test("diff finds a longest shared subsequence, checked independently on punctuation tokens", () => {
  const rng = random(2026);
  for (let trial = 0; trial < 300; trial++) {
    const text = () => Array.from({ length: rng.int(0, 12) }, () => rng.pick(["!", "?", ":"])).join("");
    const a = text();
    const b = text();
    const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    assert.equal(wordDiff(a, b).filter((run) => run.kind === "equal").reduce((n, run) => n + run.text.length, 0), table[a.length][b.length]);
  }
});
