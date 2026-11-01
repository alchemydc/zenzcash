import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { selectionBar, PODCAST_INSTRUCTIONS } from "../site/js/selection-controls.js";
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
  const state = { selected: new Set(selected), selecting: false, thread: 7, data };
  const view = { state, actions: { setSelecting(value) { state.selecting = value; }, clearSelection() { state.selected.clear(); view.syncSelection(); } } };
  const root = selectionBar(view);
  const button = (label) => descendants(root).find((node) => node.tag === "button" && node.textContent === label);
  const output = root.querySelector("textarea");
  output.select = () => { output.selectedText = true; };
  return { view, root, button, output, copied, status: descendants(root).filter((node) => node.attributes.get("aria-live") === "polite").at(-1) };
}

test("discoverable entry point, explicit destinations, retained selection and clear empty state", (t) => {
  const { root, view, button } = setup(t, []);
  assert.equal(root.querySelector("h3").textContent, "Ask, export or listen to posts");
  assert.equal(nodes(root, "selection-workflows")[0].hidden, true);
  click(button("Select posts"));
  view.syncSelection();
  assert.equal(view.state.selecting, true);
  assert.equal(nodes(root, "selection-workflows")[0].hidden, false);
  assert.deepEqual(nodes(root, "selection-primary").map((node) => node.textContent), ["Ask your AI", "Export for NotebookLM", "Listen to selected posts"]);
  assert.equal(nodes(root, "selection-links")[0].open, false);
  for (const node of descendants(root).filter((node) => node.tag === "button" && !node.textContent.startsWith("Select "))) assert.equal(node.disabled, true);
  view.state.selected.add("7/1");
  view.state.selecting = false;
  view.syncSelection();
  assert.equal(nodes(root, "selection-workflows")[0].hidden, false);
  assert.equal(button("Copy prompt + posts for chat AI").disabled, false);
  click(button("Clear selection"));
  assert.equal(view.state.selected.size, 0);
  assert.equal(nodes(root, "selection-workflows")[0].hidden, true);
});

test("chat copies the full single-file bundle; NotebookLM copies the shared request; links are separate", async (t) => {
  const { view, button, output, copied, status } = setup(t);
  const cases = [
    ["Copy prompt + posts for chat AI", selectionMarkdown(data, view.state.selected, base, prompt), "Paste the prompt and posts into your AI chat and send."],
    ["Copy podcast instructions", PODCAST_INSTRUCTIONS, "Paste these optional instructions into the Audio Overview customization field."],
    ["Copy post links only", selectionLinks(data.topic, view.state.selected, base), "These are post links only; no prompt or post text is included."],
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

test("destinations retain identical sources in distinct wrappers and release temporary URLs", async (t) => {
  const { view, button, status } = setup(t);
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
  for (const label of ["Ask your AI", "Export for NotebookLM"]) {
    click(button(label));
    await flush();
    const text = await blobs.at(-1).text();
    const expected = selectionMarkdown(data, view.state.selected, base, prompt);
    if (label === "Ask your AI") assert.equal(text, expected);
    else { assert.equal(text.slice(text.indexOf("## Selection")), expected.slice(expected.indexOf("## Selection"))); assert.equal(text.includes(PODCAST_INSTRUCTIONS), false); }
    assert.equal(blobs.at(-1).type, "text/markdown;charset=utf-8");
    assert.equal(anchors.at(-1).download, "zforum-selected-posts.md");
    assert.equal(anchors.at(-1).clicked, true);
    assert.equal(anchors.at(-1).removed, true);
  }
  assert.deepEqual(revoked, ["blob:test-1", "blob:test-2"]);
  assert.equal(status.textContent, "Upload zforum-selected-posts.md as a source in NotebookLM (Gemini Notebook). Then choose Audio Overview / Debate and optionally paste the podcast instructions below.");
});

test("clipboard denial exposes exact selectable content and destination instructions", async (t) => {
  const { view, button, output, status } = setup(t);
  navigator.clipboard.writeText = async () => { throw new Error("Permission denied"); };
  click(button("Copy prompt + posts for chat AI"));
  await flush();
  assert.equal(output.value, selectionMarkdown(data, view.state.selected, base, prompt));
  assert.equal(output.hidden, false);
  assert.equal(document.activeElement, output);
  assert.equal(output.selectedText, true);
  assert.equal(status.textContent, "Clipboard unavailable (Permission denied). Copy the text from the box below. Paste the prompt and posts into your AI chat and send.");
});

test("failed or empty template is explicit and does not copy stale content", async (t) => {
  const { button, output, copied, status } = setup(t);
  for (const [response, message] of [
    [{ ok: false, status: 503 }, "Export failed: loading the summary prompt failed: HTTP 503"],
    [{ ok: true, text: async () => "  " }, "Export failed: the summary prompt is empty"],
  ]) {
    globalThis.fetch = async () => response;
    click(button("Copy prompt + posts for chat AI"));
    await flush();
    assert.equal(status.textContent, message);
    assert.equal(output.hidden, true);
    assert.equal(button("Copy prompt + posts for chat AI").disabled, false);
    assert.deepEqual(copied, []);
  }
});

test("selection changes during template loading preserve the action snapshot", async (t) => {
  const { view, button, copied, status } = setup(t);
  let release;
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  click(button("Copy prompt + posts for chat AI"));
  assert.equal(button("Export for NotebookLM").disabled, true);
  view.state.selected.delete("8/1");
  view.syncSelection();
  release({ ok: true, text: async () => prompt });
  await flush();
  assert.deepEqual(copied, [selectionMarkdown(data, new Set(["7/1", "8/1"]), base, prompt)]);
  assert.equal(status.textContent, "Paste the prompt and posts into your AI chat and send.");
  assert.equal(button("Copy prompt + posts for chat AI").disabled, false);
});
