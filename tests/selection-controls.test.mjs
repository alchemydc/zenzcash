import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { selectionBar } from "../site/js/selection-controls.js";
import { selectionMarkdown, selectionLinks } from "../site/js/selection.js";
import { installDom, RecordedNode, descendants, nodes, click } from "./recorded-dom.mjs";

const prompt = readFileSync(new URL("../site/prompt.md", import.meta.url), "utf8");
const base = "http://localhost:8000/#/topic/zcg";
const post = (key) => ({ key, number: 1, author: "alice", created_at: "2026-11-01T00:00:00Z", hidden: false, raw: `Original ${key}.`, reply_to: null });
const data = { snapshot_at: "2026-11-01T00:00:00Z", topic: { id: "zcg", threads: [7, 8].map((id) => ({ id, title: `Thread ${id}`, url: `https://forum.example/t/${id}`, posts: [post(`${id}/1`)] })) } };
const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup(t, selected = ["8/1", "7/1"]) {
  installDom(t);
  const originals = new Map(["fetch", "navigator", "location"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const copied = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (text) => copied.push(text) } } });
  globalThis.location = { href: base };
  globalThis.fetch = async (url) => { assert.equal(url, "prompt.md"); return { ok: true, text: async () => prompt }; };
  t.after(() => { for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  const state = { selected: new Set(selected), selecting: false, thread: 7, data, open: { expert: false } };
  const view = { state, cutoff: data.snapshot_at, allPosts: data.topic.threads.flatMap(thread => thread.posts), news: { posts: new Set(["7/1"]) }, letterOf: new Map([[7,"A"],[8,"B"]]), actions: { setSelecting(value) { state.selecting = value; }, clearSelection() { state.selected.clear(); view.syncSelection(); } } };
  const root = selectionBar(view);
  const button = (label) => descendants(root).find((node) => node.tag === "button" && node.textContent === label);
  const output = root.querySelector("textarea");
  output.select = () => { output.selectedText = true; };
  return { view, root, button, output, copied, status: descendants(root).filter((node) => node.attributes.get("aria-live") === "polite").at(-1) };
}

test("collapsed expert tools offer exactly two actions and retain selected counts", (t) => {
  const { root, view, button } = setup(t, []);
  assert.equal(root.tag, "details"); assert.equal(root.open, false);
  assert.equal(root.querySelector("summary").textContent, "Expert user tools · 0 selected");
  assert.deepEqual(nodes(root, "selection-primary").map(n => n.textContent), ["Listen to selected posts", "Export selected posts"]);
  assert.equal(button("Export selected posts").disabled, true);
  click(button("Select individual posts"));
  assert.equal(view.state.selecting, true);
  view.state.selected.add("7/1"); view.syncSelection();
  assert.equal(button("Export selected posts").disabled, false);
  assert.equal(root.querySelector("summary").textContent, "Expert user tools · 1 selected");
  click(button("Clear selection"));
  assert.equal(view.state.selected.size, 0); assert.equal(button("Export selected posts").disabled, true);
});

test("copy exports the shared prompt and exact original sources; links are separate", async (t) => {
  const { view, button, output, copied, status } = setup(t);
  const cases = [
    ["Copy prompt + selected posts", selectionMarkdown(data, view.state.selected, base, prompt), "Paste into your preferred AI, or save as a source for your notebook."],
    ["Copy post links only", selectionLinks(data.topic, view.state.selected, base), "Copied links only."],
  ];
  for (const [label, expected, message] of cases) {
    click(button(label));
    await flush();
    assert.equal(copied.at(-1), expected);
    assert.equal(output.value, expected);
    assert.equal(output.hidden, false);
    assert.equal(output.attributes.get("aria-label"), label);
    assert.equal(status.textContent, message);
    assert.equal(button(label).disabled, false);
  }
});

test("download contains the shared prompt and exact sources and releases its temporary URL", async (t) => {
  const { view, root, button, status } = setup(t);
  document.body = new RecordedNode("body");
  const create = document.createElement;
  const anchors = [];
  document.createElement = (tag) => {
    const node = create(tag);
    if (tag === "a") { anchors.push(node); node.click = () => { node.clicked = true; }; node.remove = () => { node.removed = true; }; }
    return node;
  };
  const blobs = [];
  const revoked = [];
  t.mock.method(URL, "createObjectURL", (blob) => { blobs.push(blob); return `blob:test-${blobs.length}`; });
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  t.mock.method(globalThis, "setTimeout", (fn) => { fn(); });
  for (const label of ["Export selected posts"]) {
    click(button(label));
    await flush();
    const text = await blobs.at(-1).text();
    const expected = selectionMarkdown(data, view.state.selected, base, prompt);
    assert.equal(text, expected);
    assert.equal(blobs.at(-1).type, "text/markdown;charset=utf-8");
    assert.equal(anchors.at(-1).download, "zforum-selected-posts.md");
    assert.equal(anchors.at(-1).clicked, true);
    assert.equal(anchors.at(-1).removed, true);
  }
  assert.deepEqual(revoked, ["blob:test-1"]);
  assert.equal(nodes(root, "selection-links")[0].open, false);
  assert.equal(status.textContent, "Downloaded zforum-selected-posts.md. Use the same file and prompt with your chat AI or NotebookLM.");
});

test("large downloads expose ordered part buttons and capture text before later selection changes", async (t) => {
  const { view, root, button, status } = setup(t);
  view.state.data = structuredClone(data);
  for (const thread of view.state.data.topic.threads) thread.posts[0].raw = "Large source ".repeat(100000);
  click(button("Export selected posts")); await flush();
  const parts = nodes(root, "export-parts")[0].children;
  assert.equal(parts.length, 2);
  assert.match(parts[0].textContent, /part-001-of-2/);
  assert.match(parts[1].textContent, /part-002-of-2/);
  assert.match(status.textContent, /Nothing was truncated/);
  view.state.selected.clear(); view.state.data.topic.threads[0].posts[0].raw = "Changed";
  document.body = new RecordedNode("body");
  const create = document.createElement;
  document.createElement = (tag) => { const node = create(tag); node.click = () => {}; node.remove = () => {}; return node; };
  let blob;
  t.mock.method(URL,"createObjectURL",(value) => { blob = value; return "blob:part"; });
  t.mock.method(URL,"revokeObjectURL",() => {});
  click(parts[0]);
  assert.ok((await blob.text()).includes("Large source ".repeat(100000)));
  assert.ok(!(await blob.text()).includes("Changed"));
});

test("clipboard denial exposes exact selectable content and destination instructions", async (t) => {
  const { view, button, output, status } = setup(t);
  navigator.clipboard.writeText = async () => { throw new Error("Permission denied"); };
  click(button("Copy prompt + selected posts"));
  await flush();
  assert.equal(output.value, selectionMarkdown(data, view.state.selected, base, prompt));
  assert.equal(output.hidden, false);
  assert.equal(document.activeElement, output);
  assert.equal(output.selectedText, true);
  assert.equal(status.textContent, "Clipboard unavailable (Permission denied). Copy the text from the box below. Paste into your preferred AI, or save as a source for your notebook.");
});

test("failed or empty template is explicit and does not copy stale content", async (t) => {
  const { button, output, copied, status } = setup(t);
  for (const [response, message] of [
    [{ ok: false, status: 503 }, "Export failed: loading the summary prompt failed: HTTP 503"],
    [{ ok: true, text: async () => "  " }, "Export failed: the summary prompt is empty"],
  ]) {
    globalThis.fetch = async () => response;
    click(button("Copy prompt + selected posts"));
    await flush();
    assert.equal(status.textContent, message);
    assert.equal(output.hidden, true);
    assert.equal(button("Copy prompt + selected posts").disabled, false);
    assert.deepEqual(copied, []);
  }
});

test("selection changes during template loading preserve the action snapshot", async (t) => {
  const { view, button, copied, status } = setup(t);
  let release;
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  click(button("Copy prompt + selected posts"));
  assert.equal(button("Export selected posts").disabled, true);
  view.state.selected.delete("8/1");
  view.syncSelection();
  release({ ok: true, text: async () => prompt });
  await flush();
  assert.deepEqual(copied, [selectionMarkdown(data, new Set(["7/1", "8/1"]), base, prompt)]);
  assert.equal(status.textContent, "Paste into your preferred AI, or save as a source for your notebook.");
  assert.equal(button("Copy prompt + selected posts").disabled, false);
});

test("time-window and thread shortcuts include collapsed posts and exclude forum-hidden posts without implicit reselection", (t) => {
  const { view, button } = setup(t, []);
  view.actions.selectScope = (selected) => { view.state.selected = selected; view.syncSelection(); };
  click(button("Select posts in this time window (1)"));
  assert.deepEqual([...view.state.selected],["7/1"]);
  view.news.posts = new Set(["8/1"]);
  assert.deepEqual([...view.state.selected],["7/1"]);
  click(button("Select thread B · Thread 8"));
  assert.deepEqual([...view.state.selected],["7/1","8/1"]);
  const hidden={...post("7/2"), hidden:true};
  view.allPosts.push(hidden); view.news.posts.add("7/2");
  click(button("Select posts in this time window (1)"));
  assert.deepEqual([...view.state.selected],["7/1","8/1"]);
});
