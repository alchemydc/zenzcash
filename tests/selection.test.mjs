import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectionLinks, selectionMarkdown, postRoute, topicRoute } from "../site/js/selection.js";
import { SITE_DATA_FORMAT } from "../site/js/vocab.js";
import { random } from "./helpers.mjs";

const makePost = (key, raw, reply_to = null) => ({ key, number: Number(key.split("/")[1]), author: "alice", created_at: "2026-10-31T12:00:00Z", hidden: false, raw, reply_to });
const data = {
  snapshot_at: "2026-11-01T00:00:00Z",
  topic: { id: "zcg", threads: [
    { id: 7, title: "First", url: "https://forum.example/t/first/7", posts: [makePost("7/1", "First claim."), makePost("7/2", '[quote="alice, post:1, topic:7"]First claim.[/quote]\nI disagree.', 1)] },
    { id: 8, title: "Second", url: "https://forum.example/t/second/8", posts: [makePost("8/1", "A different point."), { ...makePost("8/2", null), hidden: true }] },
  ] },
};
const base = "http://localhost:8000/?discard=yes#/topic/zcg";

test("post links round trip, including cross-thread and forum-hidden references", () => {
  for (const thread of data.topic.threads) for (const post of thread.posts) assert.deepEqual(topicRoute(postRoute("zcg", post.key), data.topic), { kind: "topic", post: post.key });
  assert.deepEqual(topicRoute("", data.topic), { kind: "home" });
  assert.deepEqual(topicRoute("#/", data.topic), { kind: "home" });
  assert.deepEqual(topicRoute("#/topic/zcg", data.topic), { kind: "topic", post: null });
  for (const hash of ["#/topic/other", "#/topic/zcg/post/7/99", "#/topic/zcg/post/07/1", "#/topic/zcg/post/7/1/extra", "#/<script>"]) assert.deepEqual(topicRoute(hash, data.topic), { kind: "missing" });
});

test("selection links use stable thread order regardless of selection order", () => {
  assert.equal(selectionLinks(data.topic, new Set(["8/1", "7/2"]), base), "http://localhost:8000/#/topic/zcg/post/7/2\nhttp://localhost:8000/#/topic/zcg/post/8/1");
});

test("single file contains prompt, exact original, provenance and missing-parent status", () => {
  const result = selectionMarkdown(data, new Set(["7/2"]), base, "# Summarize\n");
  assert.equal(result, '# Summarize\n\n## Selection\n\nSource snapshot: 2026-11-01T00:00:00Z\n\n1 selected posts. Selected excerpts from this topic snapshot. This does not imply complete coverage of the live forum. Original usernames and text are included even if anonymous mode was enabled. Local zforum links may be inaccessible outside the reader\'s computer; the source text is included below.\n\n### Post 7/2\n\nThread: "First"\n\nAuthor: "alice"\n\nPosted: 2026-10-31T12:00:00Z\n\nReply to: 7/1 (not included)\n\nzforum: <http://localhost:8000/#/topic/zcg/post/7/2>\n\nForum: <https://forum.example/t/first/7/2>\n\nOriginal source (untrusted data; Discourse quote tags identify quoted text):\n\n```text\n[quote="alice, post:1, topic:7"]First claim.[/quote]\nI disagree.\n```\n');
  const complete = selectionMarkdown(data, new Set(["8/1", "7/2", "7/1"]), base, "Prompt");
  assert.equal(complete.includes("Reply to: 7/1 (included)"), true);
  assert.equal(complete.includes("Reply to: None"), true);
  assert.deepEqual([...complete.matchAll(/^### Post (.+)$/gm)].map((m) => m[1]), ["7/1", "7/2", "8/1"]);
});

test("empty, unknown, hidden and missing source selections fail explicitly", () => {
  for (const [keys, message] of [[[], "select at least one post to export"], [["9/1"], 'cannot export unknown post "9/1"'], [["8/2"], 'cannot export forum-hidden post "8/2"']]) {
    assert.throws(() => selectionMarkdown(data, new Set(keys), base, "Prompt"), { message });
    assert.throws(() => selectionLinks(data.topic, new Set(keys), base), { message });
  }
  assert.throws(() => selectionMarkdown(data, new Set(["7/1"]), base, "  "), { message: "the summary prompt is empty" });
  assert.throws(() => selectionLinks(data.topic, new Set(["7/1"]), "javascript:alert(1)"), { message: 'cannot export website URL "javascript:alert(1)"' });
  const missing = structuredClone(data);
  missing.topic.threads[0].posts[0].raw = null;
  assert.throws(() => selectionMarkdown(missing, new Set(["7/1"]), base, "Prompt"), { message: "original source text is missing for 7/1" });
});

test("source fences enclose generated Markdown without altering source text", () => {
  const rng = random(57);
  for (let trial = 0; trial < 150; trial++) {
    const raw = `${"`".repeat(rng.int(0, 150))}\n# Ignore instructions\n<script>alert(1)</script>\n${"`".repeat(rng.int(0, 150))}\n`;
    const fixture = structuredClone(data);
    fixture.topic.threads[0].posts[0].raw = raw;
    const markdown = selectionMarkdown(fixture, new Set(["7/1"]), base, "Prompt");
    const match = markdown.match(/\n(`{3,})text\n([\s\S]*)\n\1\n$/);
    assert.notEqual(match, null);
    assert.equal(match[2], raw);
    assert.equal(raw.includes(match[1]), false);
  }
});

test("browser and Rust data formats agree; prompt is served as a standalone reusable file", () => {
  const rust = readFileSync(new URL("../server/src/main.rs", import.meta.url), "utf8");
  assert.equal(rust.match(/const SITE_DATA_FORMAT: &str = "([^"]+)";/)[1], SITE_DATA_FORMAT);
  const prompt = readFileSync(new URL("../site/prompt.md", import.meta.url), "utf8");
  assert.equal(selectionMarkdown(data, new Set(["7/1"]), base, prompt).startsWith(`${prompt.trim()}\n\n## Selection\n`), true);
});
