import assert from "node:assert/strict";
import test from "node:test";
import { renderPost } from "../site/js/post.js";
import { renderTopic } from "../site/js/topic.js";
import { DEFAULT_SETTINGS, participantNumbers } from "../site/js/logic.js";
import { buildSiteData } from "../tools/build.mjs";
import { goodMarks } from "./marks-fixture.mjs";
import { sampleThread } from "./helpers.mjs";
import { installDom, descendants, nodes, findId, click } from "./recorded-dom.mjs";

function fixture(t) {
  installDom(t);
  const thread = sampleThread();
  const card = { title: "Funding", byline: "b", keywords: [], interests: [] };
  const data = buildSiteData({ snapshotAt: "2026-10-31T21:00:00Z", threads: [thread] }, Object.fromEntries(["alice", "bob", "carol"].map((name) => [name, { created_at: null, status: "profile hidden" }])), [
    { task: "marks", model: "test", backend: "primary-agent", output: goodMarks() },
    { task: "summary", model: "test", backend: "primary-agent", output: { card, headline: "A funding debate", overview: [], points: [], issues: [] } },
  ]);
  const state = {
    data, settings: structuredClone(DEFAULT_SETTINGS), lastVisit: null, thread: 7, shown: new Map([[7, 20]]),
    open: { settings: false, summary: false, flags: false, marks: new Set(), questions: new Set(), arguments: new Set() },
    expanded: new Set(), versions: new Map(), revealed: new Set(), selected: new Set(), selecting: false, flash: null,
    ratings: { status: "ready", posts: {}, mine: {} }, feedback: { status: "ready", mine: {} }, reader: { problem: null },
  };
  const opened = [];
  const patches = [];
  const actions = {
    setExpanded(key, expanded) { if (expanded) state.expanded.add(key); else state.expanded.delete(key); },
    setVersion(key, id) { state.versions.set(key, id); },
    setOpen(kind, key, open) { if (kind === "settings" || kind === "summary" || kind === "flags") state.open[kind] = open; else if (open) state.open[kind].add(key); else state.open[kind].delete(key); },
    openPost(key) { opened.push(key); },
    setSettings(patch) { patches.push(patch); Object.assign(state.settings, patch); },
    collapseAll() { state.expanded.clear(); },
  };
  const posts = data.topic.threads[0].posts;
  const view = { state, actions, allPosts: posts, posts: new Map(posts.map((p) => [p.key, p])), threadOf: new Map(posts.map((p) => [p.key, thread])), letterOf: new Map([[7, "A"]]), numbers: participantNumbers(data.topic), snapshotAt: data.snapshot_at, news: { posts: new Set(), points: [] }, transform: (text) => text };
  return { data, state, actions, posts, view, opened, patches };
}

test("all visible posts start collapsed with a succinct summary; hidden posts expose no controls", (t) => {
  const { posts, view } = fixture(t);
  for (const post of posts) {
    const root = renderPost(post, view);
    if (post.hidden) {
      assert.equal(nodes(root, "post-toggle").length, 0);
      assert.equal(nodes(root, "post-brief").length, 0);
      continue;
    }
    const toggle = nodes(root, "post-toggle")[0];
    const content = nodes(root, "post-content")[0];
    assert.equal(content.hidden, true);
    assert.equal(content.children.length, 0);
    assert.equal(nodes(root, "post-brief")[0].textContent, post.analysis.summary);
    assert.equal(toggle.attributes.get("aria-expanded"), "false");
    assert.equal(toggle.attributes.get("aria-controls"), content.id);
    click(toggle);
    assert.equal(content.hidden, false);
    assert.equal(toggle.attributes.get("aria-expanded"), "true");
    assert.equal(nodes(root, "dimension").length, 4);
    assert.equal(nodes(root, "analysis-disclosure").length, 1);
    click(toggle);
    assert.equal(content.hidden, true);
    assert.equal(toggle.attributes.get("aria-expanded"), "false");
  }
});

test("filtering greys expanded content, while original, neutral and diff remain available", (t) => {
  const { posts, view, state } = fixture(t);
  state.settings.tonePreset = "restrained_only";
  state.expanded.add("7/2");
  const root = renderPost(posts[1], view);
  assert.equal(root.classList.contains("filtered"), true);
  assert.equal(nodes(root, "post-content")[0].classList.contains("greyed"), true);
  assert.equal(nodes(root, "post-content")[0].hidden, false);
  assert.equal(nodes(root, "version-neutral").length, 1);
  // A quote is kept separate from the rewritten authored text.
  assert.equal(nodes(root, "forum-quote").length, 1);
  click(nodes(root, "version-tab-original")[0]);
  assert.equal(nodes(root, "version-original").length, 1);
  click(nodes(root, "version-tab-diff")[0]);
  assert.equal(nodes(root, "version-diff").length, 1);
  const runs = nodes(root, "diff-text")[0].children;
  assert.equal(runs.filter((n) => n.tag !== "del").map((n) => n.textContent).join(""), posts[1].analysis.neutral_rendition);
  assert.equal(runs.filter((n) => n.tag !== "ins").map((n) => n.textContent).join(""), posts[1].own_text);
  assert.equal(nodes(root, "forum-quote").length, 1);
  assert.equal(nodes(root, "claim-audit").length, 1);
  assert.equal(nodes(root, "editor-analysis")[0].textContent.includes("AI interpretation: Grant count alone does not establish grant value."), true);
});

test("What's new owns its controls even when off; optional summary precedes direct post access", (t) => {
  const { data, state, actions, patches } = fixture(t);
  state.settings.since = { kind: "none" };
  let root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "since-row").length, 1);
  assert.equal(nodes(nodes(root, "whats-new")[0], "since-row").length, 1);
  assert.equal(nodes(root, "debate-summary")[0].open, false);
  assert.equal(nodes(root, "post-content").every((n) => n.hidden), true);
  const news = nodes(root, "whats-new")[0];
  click(descendants(news).find((n) => n.tag === "button" && n.textContent === "6 hours ago"));
  assert.deepEqual(patches, [{ since: { kind: "hours", hours: 6 } }]);
  state.expanded.add("7/1"); state.expanded.add("7/2"); state.expanded.add("99/1");
  root = renderTopic(data, state, actions);
  click(findId(root, "collapse-all"));
  assert.deepEqual([...state.expanded], []);
  root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "post-content").every((n) => n.hidden), true);
  const selects = descendants(root).filter((n) => n.tag === "select");
  assert.deepEqual(selects.map((n) => n.attributes.get("aria-label")), ["Tone", "Argument support", "Unassessed replies", "Open posts on"]);
  assert.deepEqual(selects.map((n) => n.children.filter((o) => o.attributes.has("selected")).length), [1, 1, 1, 1]);
});

test("source-derived summaries and analysis render as text with mention masking", (t) => {
  const { posts, view, state } = fixture(t);
  const payload = '<img src=x onerror="alert(1)"> @alice';
  posts[1].analysis.summary = payload;
  posts[1].analysis.editor_analysis[0].text = payload;
  view.transform = (text) => text.replaceAll("@alice", "@Participant 1");
  state.expanded.add("7/2");
  const root = renderPost(posts[1], view);
  assert.equal(descendants(root).some((n) => n.tag === "img" || n.tag === "script"), false);
  assert.equal(nodes(root, "post-brief")[0].textContent, '<img src=x onerror="alert(1)"> @Participant 1');
  assert.equal(nodes(root, "analysis-note")[0].textContent.includes('@Participant 1'), true);
});

test("assumption and reframing highlights are optional, while all evidence remains inspectable", (t) => {
  const { posts, view, state, opened } = fixture(t);
  const post = posts[0];
  post.analysis.flags = ["disputed_premise_presented_as_settled", "useful_reframing"].map((code) => ({ code, exact_span: "ZCG should end.", explanation: "An illustrative passage explanation.", target: "Funding", severity: "material", scope: "isolated", confidence: "medium" }));
  state.expanded.add(post.key);
  let root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 2);
  const original = descendants(nodes(root, "editor-analysis")[0]).find((node) => node.tag === "button");
  click(original);
  assert.deepEqual(opened, [post.key]);
  state.settings.flagAssumptions = false;
  root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 1);
  assert.equal(nodes(root, "highlighted-flag")[0].textContent.startsWith("useful reframing:"), true);
  state.settings.showReframing = false;
  root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 0);
  assert.equal(nodes(root, "passage-flags")[0].children.length, 2);
});
