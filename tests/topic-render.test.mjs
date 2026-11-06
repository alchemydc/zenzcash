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
    { task: "summary", model: "test", backend: "primary-agent", output: { topic: "zcg", card, headline: "A funding debate", overview: [], points: [], issues: [] } },
  ]);
  const state = {
    data, settings: { ...structuredClone(DEFAULT_SETTINGS), includeHiddenAge: true }, lastVisit: null, thread: 7, shown: new Map([[7, 20]]),
    open: { settings: false, summary: false, highlights: false, newPoints: false, infos: new Set(), flags: false, marks: new Set(), questions: new Set(), arguments: new Set() },
    shownFiltered: new Set(), expanded: new Set(), expansionRequests: new Set(), versions: new Map(), revealed: new Set(), selected: new Set(), selecting: false, flash: null,
    ratings: { status: "ready", posts: {}, mine: {} }, feedback: { status: "ready", mine: {} }, reader: { problem: null },
  };
  const opened = [];
  const patches = [];
  const actions = {
    setExpanded(key, expanded) { state.expansionRequests.delete(key); if (expanded) state.expanded.add(key); else state.expanded.delete(key); },
    setVersion(key, id) { state.versions.set(key, id); },
    setOpen(kind, key, open) { if (["settings", "summary", "flags", "highlights", "newPoints"].includes(kind)) state.open[kind] = open; else if (open) state.open[kind].add(key); else state.open[kind].delete(key); },
    openPost(key) { opened.push(key); },
    setSettings(patch) { patches.push(patch); Object.assign(state.settings, patch); },
    collapseAll() { state.expanded.clear(); },
    expandAll() { for (const post of data.topic.threads.flatMap(t=>t.posts)) if (!post.hidden) state.expanded.add(post.key); },
  };
  const posts = data.topic.threads[0].posts;
  const view = { state, actions, allPosts: posts, posts: new Map(posts.map((p) => [p.key, p])), threadOf: new Map(posts.map((p) => [p.key, data.topic.threads[0]])), letterOf: new Map([[7, "A"]]), numbers: participantNumbers(data.topic), snapshotAt: data.snapshot_at, news: { posts: new Set(), points: [] }, transform: (text) => text };
  return { data, state, actions, posts, view, opened, patches };
}

test("forum source links survive collapsed, expanded, filtered, anonymous and privacy views", t => {
  const {data,state,posts,view}=fixture(t);
  for(let mask=0;mask<16;mask++)for(const version of ['original','neutral','diff']) {
    state.settings.anonymous=Boolean(mask&1);
    state.settings.includeHiddenAge=!(mask&2);
    data.visibility_pending=Boolean(mask&4);
    for(const post of posts) {
      if(mask&8)state.expanded.add(post.key);else state.expanded.delete(post.key);
      state.versions.set(post.key,version);
      const root=renderPost(post,view),sources=nodes(root,'source-post-link');
      assert.equal(sources.length,post.hidden?0:1);
      if(post.hidden)continue;
      const anchor=sources[0].querySelector('a');
      assert.equal(anchor.attributes.get('href'),`${view.threadOf.get(post.key).url}/${post.number}`);
      assert.equal(anchor.attributes.get('target'),'_blank');
      assert.equal(anchor.attributes.get('rel'),'noopener noreferrer nofollow');
      assert.equal(anchor.textContent,'On the forum ↗');
      if(mask&2 && !(mask&4))assert(root.classList.contains('compact-post'));
    }
  }
});

test("privacy refresh keeps public originals readable without derived analysis or grade controls",t=>{
  const {data,state,actions}=fixture(t);data.visibility_pending=true;data.topic.headline='Original discussion';
  const hidden=data.topic.threads[0].posts[1];hidden.hidden=true;hidden.raw=null;hidden.own_text=null;hidden.segments=null;
  for(const post of data.topic.threads[0].posts)post.analysis=null;
  const root=renderTopic(data,state,actions);
  assert.match(root.textContent,/remaining originals are available/);assert.match(root.textContent,/ZCG should end/);
  assert.equal(root.textContent.includes('You are clearly paid'),false);assert.equal(nodes(root,'post-brief').length,0);assert.equal(nodes(root,'settings-panel').length,0);
  assert.equal(nodes(root,'post-body').length,2);assert.equal(nodes(root,'hidden-post').length,2);
});

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
    assert.equal(nodes(root, "why-marks").length, 1);
    assert.equal(nodes(root, "editor-analysis").length, 0);
    click(toggle);
    assert.equal(content.hidden, true);
    assert.equal(toggle.attributes.get("aria-expanded"), "false");
  }
});

test("filtering makes compact rows; explicitly shown posts retain original, rewrite and changes", (t) => {
  const { posts, view, state } = fixture(t);
  state.settings.toneBands = ["good"];
  state.expanded.add("7/2");
  let root = renderPost(posts[1], view);
  assert.equal(root.classList.contains("compact-post"), true);
  assert.equal(nodes(root, "post-content").length, 0);
  state.shownFiltered.add("7/2"); root = renderPost(posts[1], view);
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
  assert.equal(nodes(root, "why-marks")[0].textContent.includes("Claims and re-write details"), true);
});

test("What's new owns fixed pull controls; bulk expansion and optional summary precede direct post access", (t) => {
  const { data, state, actions, patches } = fixture(t);
  let root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "since-row").length, 1);
  assert.equal(nodes(nodes(root, "whats-new")[0], "since-row").length, 1);
  assert.equal(nodes(root, "debate-summary")[0].open, false);
  assert.equal(nodes(root, "post-content").every((n) => n.hidden), true);
  const news = nodes(root, "whats-new")[0];
  click(descendants(news).find((n) => n.tag === "button" && n.textContent === "3 days"));
  assert.deepEqual(patches, [{ since: { kind: "pull-days", days: 3 } }]);
  state.expanded.add("7/1"); state.expanded.add("7/2"); state.expanded.add("99/1");
  root = renderTopic(data, state, actions);
  click(findId(root, "collapse-all"));
  assert.deepEqual([...state.expanded], []);
  root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "post-content").every((n) => n.hidden), true);
  click(findId(root, "expand-all"));
  assert.deepEqual([...state.expanded], ["7/1", "7/2", "7/4"]);
  root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "post-content").every((n) => !n.hidden), true);
  const selects = descendants(root).filter((n) => n.tag === "select");
  assert.equal(selects.length, 1);
  assert.deepEqual(selects[0].children.map(n => n.textContent), ["Show me the re-write first", "Show me original text first"]);
  const content = nodes(root, "reading-content")[0];
  assert.equal(content.children[0].className, "whats-new card");
  assert.equal(content.children[1].className, "topic-summary card");
});

test("source-derived summaries and analysis render as text with mention masking", (t) => {
  const { posts, view, state } = fixture(t);
  const payload = '<img src=x onerror="alert(1)"> @alice';
  posts[1].analysis.summary = payload;
  posts[1].analysis.dimensions.tone.rationale = payload;
  view.transform = (text) => text.replaceAll("@alice", "@Participant 1");
  state.expanded.add("7/2");
  const root = renderPost(posts[1], view);
  assert.equal(descendants(root).some((n) => n.tag === "img" || n.tag === "script"), false);
  assert.equal(nodes(root, "post-brief")[0].textContent, '<img src=x onerror="alert(1)"> @Participant 1');
  assert.equal(nodes(root, "why-marks")[0].textContent.includes('@Participant 1'), true);
});

test("assumption and reframing highlights are optional, while all evidence remains inspectable", (t) => {
  const { posts, view, state, opened } = fixture(t);
  const post = posts[0];
  post.analysis.flags = ["disputed_premise_presented_as_settled", "useful_reframing"].map((code) => ({ code, exact_span: "ZCG should end.", explanation: "An illustrative passage explanation.", target: "Funding", severity: "material", scope: "isolated", confidence: "medium" }));
  state.expanded.add(post.key);
  let root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 2);
  assert.deepEqual(opened, []);
  state.settings.flagAssumptions = false;
  root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 1);
  assert.equal(nodes(root, "highlighted-flag")[0].textContent.startsWith("useful reframing"), true);
  state.settings.showReframing = false;
  root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 0);
  assert.equal(nodes(root, "why-marks").length, 1);
});

test("monthly slider and hidden-age choice render; highlights stay visible across filter changes", (t) => {
  const {data,state,actions,patches}=fixture(t);
  let root=renderTopic(data,state,actions);
  const slider=findId(root,"setting-minAccountMonths");
  assert.deepEqual(["type","min","max","step","value"].map(key=>slider.attributes.get(key)),["range","0","120","1","0"]);
  slider.value="6"; slider.setCustomValidity=(message)=>assert.equal(message,"");
  slider.dispatchEvent(new Event("change"));
  assert.deepEqual(patches,[{minAccountMonths:6}]);
  for (const key of ["toneBands","supportBands","accountAge","postVersions","preferredVersion","flagAssumptions","showReframing","highlightNew","anonymous","showRatings","pullWindow","threadView","postOrder"]) {
    const button=findId(root,`info-${key}-button`);
    assert.equal(button.attributes.get("aria-controls"),`info-${key}`);
    assert.equal(button.attributes.get("aria-expanded"),"false");
    assert.ok(findId(root,`info-${key}`).textContent.length>50);
  }
  const inclusion=findId(root,"setting-includeHiddenAge");
  inclusion.checked=true;inclusion.dispatchEvent(new Event("change"));
  assert.deepEqual(patches.at(-1),{includeHiddenAge:true});
  const panel=nodes(root,"new-points")[0];panel.open=true;panel.dispatchEvent(new Event("toggle"));
  actions.setSettings({since:{kind:"pull-days",days:7},anonymous:true});
  root=renderTopic(data,state,actions);
  assert.equal(nodes(root,"highlight-settings")[0].tag,"fieldset");
  assert.equal(nodes(root,"new-points")[0].open,true);
  assert.deepEqual(nodes(root,"since-row")[0].children.filter(n=>n.tag==="button").map(n=>n.textContent),["1 day","3 days","7 days"]);
});

test("rewrite audits group identical operations once without losing distinct quoted evidence", async (t) => {
  const {posts,view,state}=fixture(t);
  const {groupRewriteChanges}=await import('../site/js/post-analysis.js');
  const changes=[{operation:"Attribute the allegation.",source_span:"First quote"},{operation:"Keep milestones.",source_span:"Second quote"},{operation:"Attribute the allegation.",source_span:"Third quote"},{operation:"Attribute the allegation.",source_span:"First quote"}];
  assert.deepEqual(groupRewriteChanges(changes),[{operation:"Attribute the allegation.",spans:["First quote","Third quote"]},{operation:"Keep milestones.",spans:["Second quote"]}]);
  posts[1].analysis.rewrite_changes=changes;state.expanded.add(posts[1].key);
  const root=renderPost(posts[1],view);
  assert.equal(root.textContent.split("Attribute the allegation.").length-1,1);
  for(const quote of ["First quote","Second quote","Third quote"]) assert.equal(root.textContent.split(quote).length-1,1);
  const reactions=descendants(root).filter(n=>n.tag==="button" && n.attributes.get("aria-label")?.startsWith("Heart:"));
  assert.deepEqual(reactions.map(n=>n.attributes.get("aria-label")),["Heart: This made things worse","Heart: No change","Heart: Helped"]);
  assert.equal(nodes(root,"bookmark-icon").length,1);
});

test("failed expansion stays retryable and does not interrupt other posts", t => {
  const { posts, state, view } = fixture(t);
  const original = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  t.after(() => { console.error = original; });
  const post = posts[0];
  const segments = post.segments;
  state.settings.preferredVersion = 'original';
  const root = renderPost(post, view);
  post.segments = null;
  click(nodes(root, 'post-toggle')[0]);
  assert.equal(state.expanded.has(post.key), false);
  assert.equal(nodes(root, 'post-display-error')[0].textContent, 'This post could not be displayed.');
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], `Rendering post ${post.key} failed`);
  assert.equal(nodes(renderPost(posts[1], view), 'post-toggle').length, 1);
  post.segments = segments;
  click(nodes(root, 'post-toggle')[0]);
  assert.equal(state.expanded.has(post.key), true);
  assert.equal(nodes(root, 'post-display-error').length, 0);
});

test("bulk and linked expansion requests commit only after successful body rendering", t => {
  const { posts, state, view } = fixture(t);
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  state.settings.preferredVersion = 'original';
  state.expansionRequests.add(posts[0].key);
  state.expansionRequests.add(posts[1].key);
  posts[0].segments = null;
  const failed = renderPost(posts[0], view);
  const succeeded = renderPost(posts[1], view);
  assert.equal(nodes(failed, 'post-display-error').length, 1);
  assert.equal(nodes(succeeded, 'post-display-error').length, 0);
  assert.deepEqual([...state.expanded], [posts[1].key]);
  assert.deepEqual([...state.expansionRequests], []);
});
