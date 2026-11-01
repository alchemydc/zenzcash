// The topic page (SPEC §3): the reading bar with "what's new since" and the reading
// settings (D-47), the summary with citations, "why do people think this?", what's new, and
// the discussion as one forum-styled tab per thread, loaded a batch at a time as the reader
// scrolls (D-48, D-51).

import { append, h, link } from "./dom.js";
import { greyReasons, maskMentions, participantNumbers, POSTS_PER_LOAD, SINCE_HOURS, shortDate, sinceCutoff, topicStats, whatsNew } from "./logic.js";
import { plainText } from "./markdown.js";
import { renderPost } from "./post.js";
import { selectionBar } from "./selection-controls.js";
import { ACCOUNT_AGE_MINIMUMS, MATURITY_MAX, MATURITY_MIN, TRAITS, maturityBand } from "./vocab.js";

export const THREAD_TABS_ID = "thread-tabs";

function citeChip(post, thread, view) {
  const excerpt = plainText(post.clean ?? post.segments.filter((segment) => segment.kind === "text").map((segment) => segment.text).join("\n\n")).slice(0, 140);
  return h(
    "button",
    { class: `cite band-${maturityBand(post.maturity)}`, title: `Thread ${view.letterOf.get(thread.id)}: ${thread.title} · #${post.number} · maturity ${post.maturity}/10\n${excerpt}…`, on: { click: () => view.actions.openPost(post.key) } },
    `${view.letterOf.get(thread.id)}#${post.number}`,
  );
}

const cites = (keys, view) => h("span", { class: "cites" }, keys.map((key) => citeChip(view.posts.get(key), view.threadOf.get(key), view)));

function overview(topic, view) {
  return h("div", { class: "overview" },
    topic.overview.map((sentence) => h("p", {}, sentence.text, " ", cites(sentence.cites, view))),
    h("p", { class: "legend muted small" }, "Citations name the thread and post (A#12 is post 12 of thread A) and open it. Their colour is that post's maturity: ",
      h("span", { class: "cite band-low" }, "1–3"), " ", h("span", { class: "cite band-mid" }, "4–6"), " ", h("span", { class: "cite band-high" }, "7–10"), "."));
}

function whySection(topic, view) {
  const pointText = new Map(topic.points.map((point) => [point.id, point.text]));
  return h(
    "details",
    { class: "why card", open: view.state.open.why, on: { toggle: (event) => view.actions.setOpen("why", null, event.target.open) } },
    h("summary", {}, "Why do people think this?"),
    h("p", { class: "muted" }, `${topic.points.length} points people make, in the order they were first made.`),
    h("ol", { class: "points" }, topic.points.map((point) => h(
      "li",
      { class: view.news.points.includes(point.id) ? "is-new" : null },
      view.news.points.includes(point.id) ? h("span", { class: "badge-new" }, "New") : null,
      point.text, " ", cites(point.cites, view),
    ))),
    h("h3", {}, "How these points tend to group"),
    h("p", { class: "disclaimer" }, topic.groupings.disclaimer),
    h("div", { class: "groups" }, topic.groupings.groups.map((group) => h(
      "div",
      { class: "group" },
      h("h4", {}, group.label),
      h("p", { class: "muted" }, group.note),
      h("ul", {}, group.points.map((id) => h("li", {}, pointText.get(id)))),
    ))),
  );
}

const pressed = (match) => (match ? "true" : "false");

function sinceRow(view) {
  const { settings, lastVisit } = view.state;
  const since = settings.since;
  const choose = (value) => view.actions.setSettings({ since: value });
  const custom = since.kind === "hours" && !SINCE_HOURS.includes(since.hours) ? since.hours : "";
  return h("div", { class: "since-row", role: "group", "aria-label": "What's new since" },
    h("span", { class: "since-label" }, "What's new since:"),
    SINCE_HOURS.map((hours) => h("button", { class: "chip", "aria-pressed": pressed(since.kind === "hours" && since.hours === hours), on: { click: () => choose({ kind: "hours", hours }) } }, `${hours} hours ago`)),
    h("button", { class: "chip", "aria-pressed": pressed(since.kind === "last-visit"), title: lastVisit === null ? "No earlier visit recorded in this browser" : `Last visit: ${shortDate(lastVisit)}`, on: { click: () => choose({ kind: "last-visit" }) } }, "My last visit"),
    h("label", { class: "custom-hours" }, "or ",
      h("input", { type: "number", min: 1, max: 720, step: 1, value: custom, "aria-label": "Hours ago", on: { change: (event) => {
        const hours = Number(event.target.value);
        if (Number.isInteger(hours) && hours >= 1 && hours <= 720) choose({ kind: "hours", hours });
      } } }), " hours"),
    h("button", { class: "chip", "aria-pressed": pressed(since.kind === "none"), on: { click: () => choose({ kind: "none" }) } }, "Off"));
}

function settingsPanel(view) {
  const { settings } = view.state;
  const set = (patch) => view.actions.setSettings(patch);
  const visible = view.allPosts.filter((post) => !post.hidden);
  const greyedCount = visible.filter((post) => greyReasons(post, settings, view.snapshotAt).length > 0).length;
  return h(
    "details",
    { class: "settings-panel", open: view.state.open.settings, on: { toggle: (event) => view.actions.setOpen("settings", null, event.target.open) } },
    h("summary", {}, h("strong", {}, "Reading settings"), h("span", { class: "muted small" }, ` · ${greyedCount} of ${visible.length} posts filtered`)),
    h("label", { class: "toggle" }, h("input", { type: "checkbox", checked: settings.anonymous, on: { change: (event) => set({ anonymous: event.target.checked }) } }),
      h("span", {}, h("strong", {}, "Anonymous mode"), " — read the arguments without knowing who wrote them. You can reveal one post at a time.")),
    h("label", { class: "slider" }, "Collapse posts with maturity below ",
      h("input", { type: "range", min: MATURITY_MIN, max: MATURITY_MAX + 1, step: 1, value: settings.minMaturity, on: { input: (event) => set({ minMaturity: Math.min(MATURITY_MAX, Number(event.target.value)) }) } }),
      h("strong", { class: `maturity band-${maturityBand(settings.minMaturity)}` }, `${settings.minMaturity}`)),
    h("div", { class: "age-row", role: "group", "aria-label": "Collapse posts from accounts newer than" },
      h("span", {}, "Collapse posts from accounts newer than:"),
      ACCOUNT_AGE_MINIMUMS.map((choice) => h("button", { class: "chip", "aria-pressed": pressed(settings.minAccountDays === choice.days), on: { click: () => set({ minAccountDays: choice.days }) } }, choice.label)),
      h("span", { class: "muted small" }, "Accounts that hide their profile are never greyed for this, because their age is unknown.")),
    h("fieldset", { class: "traits" }, h("legend", {}, "Collapse posts that are marked:"),
      TRAITS.map((trait) => h("label", { class: "trait-option", title: trait.meaning },
        h("input", { type: "checkbox", checked: settings.greyTraits.includes(trait.id), on: { change: (event) => set({ greyTraits: event.target.checked ? [...settings.greyTraits, trait.id] : settings.greyTraits.filter((id) => id !== trait.id) }) } }),
        h("span", {}, trait.label), h("span", { class: "muted small" }, ` ${trait.meaning}`)))),
    h("label", { class: "toggle" }, h("input", { type: "checkbox", checked: settings.showRatings, on: { change: (event) => set({ showRatings: event.target.checked }) } }),
      h("span", {}, h("strong", {}, "Mind-change ratings"), " — rate how each post moved you, and see how it moved other readers.")),
    h("p", { class: "muted small" }, "Filtered posts start collapsed. Expand one to read it greyed out. The summary still covers all posts."),
  );
}

const readingBar = (view) => h("section", { class: "reading-bar", "aria-label": "Reading settings" }, sinceRow(view), settingsPanel(view));

function whatsNewSummary(topic, view) {
  const since = view.state.settings.since;
  if (since.kind === "none") return null;
  let body;
  if (view.cutoff === null) body = h("p", { class: "muted" }, "This is your first visit, so there is nothing to compare with yet.");
  else if (view.news.posts.size === 0) body = h("p", { class: "muted" }, `Nothing new since ${shortDate(view.cutoff)}.`, since.kind === "last-visit" ? " (This prototype shows a fixed snapshot, so nothing changes between visits.)" : null);
  else {
    body = [
      h("p", {}, h("strong", {}, `${view.news.posts.size} new posts`), ` since ${shortDate(view.cutoff)}, in `, view.news.threads.map((thread, index) => [index > 0 ? ", " : null, `${view.letterOf.get(thread.id)} “${thread.title}” (${thread.count})`]), "."),
      view.news.points.length > 0
        ? h("div", { class: "new-points" }, h("p", { class: "muted" }, "Points first made in that time:"), h("ul", {}, topic.points.filter((point) => view.news.points.includes(point.id)).map((point) => h("li", {}, point.text, " ", cites(point.cites.slice(0, 1), view)))))
        : h("p", { class: "muted" }, "No new points were first made in that time; the new posts continue existing ones."),
    ];
  }
  return h("section", { class: "whats-new card", "aria-live": "polite" }, h("h2", {}, "What's new"), body);
}

// At most one "load more" watcher exists: each page render replaces the previous one.
let loadWatcher = null;

function watchForMore(button) {
  if (loadWatcher !== null) loadWatcher.disconnect();
  loadWatcher = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !button.hidden) button.click();
  }, { rootMargin: "0px 0px 800px 0px" });
  loadWatcher.observe(button);
}

function forumThread(thread, view) {
  const list = h("div", { class: "forum-posts" });
  const more = h("button", { class: "load-more zf" });
  let rendered = 0;
  const fill = () => {
    const target = Math.min(view.state.shown.get(thread.id), thread.posts.length);
    append(list, thread.posts.slice(rendered, target).map((post) => renderPost(post, view)));
    rendered = target;
    more.hidden = rendered === thread.posts.length;
    more.textContent = `Show ${Math.min(POSTS_PER_LOAD, thread.posts.length - rendered)} more posts (${thread.posts.length - rendered} left)`;
  };
  more.addEventListener("click", () => {
    view.actions.showMore(thread.id);
    fill();
    // Re-observing reports the button again if it is still near the viewport, so short
    // posts keep loading until the page is long enough to scroll.
    loadWatcher.unobserve(more);
    loadWatcher.observe(more);
  });
  fill();
  watchForMore(more);
  return h(
    "div",
    { class: "forum", role: "tabpanel" },
    h("p", { class: "forum-banner zf" }, "A read-only copy of ", link(view.forumOrigin, new URL(view.forumOrigin).host), ". Posts belong to their authors. ", link(thread.url, "Open this thread on the forum ↗")),
    h("h3", { class: "forum-title" }, thread.title),
    h("p", { class: "forum-meta" }, `${thread.posts.length} posts · started ${shortDate(thread.created_at)}`),
    list,
    more,
  );
}

function discussion(topic, view) {
  const active = topic.threads.find((thread) => thread.id === view.state.thread);
  const tabs = topic.threads.map((thread) => {
    const newCount = thread.posts.filter((post) => view.news.posts.has(post.key)).length;
    return h(
      "button",
      { class: "thread-tab", role: "tab", "aria-selected": pressed(thread === active), title: thread.title, on: { click: () => view.actions.setThread(thread.id) } },
      h("span", { class: "thread-tab-title" }, `${view.letterOf.get(thread.id)} · ${thread.title}`),
      h("span", { class: "thread-tab-meta" }, `${thread.posts.length} posts`, newCount > 0 ? h("span", { class: "badge-new" }, `${newCount} new`) : null),
    );
  });
  return h("section", { class: "discussion" },
    h("h2", {}, "The discussion"),
    h("p", { class: "muted" }, "One tab per forum thread. Compare each restatement with its original in the Diff tab."),
    selectionBar(view),
    h("div", { class: "thread-tabs", id: THREAD_TABS_ID, role: "tablist", "aria-label": "Threads" }, tabs),
    forumThread(active, view));
}

export function renderTopic(data, state, actions) {
  const topic = data.topic;
  const allPosts = topic.threads.flatMap((thread) => thread.posts);
  const numbers = participantNumbers(topic);
  const cutoff = sinceCutoff(state.settings.since, data.snapshot_at, state.lastVisit);
  const view = {
    state,
    actions,
    allPosts,
    numbers,
    snapshotAt: data.snapshot_at,
    forumOrigin: data.forum_origin,
    posts: new Map(allPosts.map((post) => [post.key, post])),
    threadOf: new Map(topic.threads.flatMap((thread) => thread.posts.map((post) => [post.key, thread]))),
    letterOf: new Map(topic.threads.map((thread, index) => [thread.id, String.fromCharCode(65 + index)])),
    transform: state.settings.anonymous ? (text) => maskMentions(text, numbers) : (text) => text,
    cutoff,
    news: whatsNew(topic, cutoff),
  };
  const stats = topicStats(topic, data.snapshot_at);
  return h(
    "div",
    { class: "topic" },
    h("p", { class: "back" }, h("a", { href: "#/" }, "← All topics")),
    readingBar(view),
    h("header", { class: "topic-head" },
      h("p", { class: "eyebrow" }, `${topic.card.title} · ${stats.threads} threads · ${stats.posts} posts · ${stats.participants} people`),
      h("h1", {}, topic.headline),
      overview(topic, view)),
    whySection(topic, view),
    whatsNewSummary(topic, view),
    state.ratings.status === "error" && state.settings.showRatings ? h("p", { class: "notice" }, `Mind-change ratings are unavailable: ${state.ratings.problem}`) : null,
    state.feedback.status === "error" ? h("p", { class: "notice" }, `Restatement feedback is unavailable: ${state.feedback.problem}`) : null,
    state.reader.problem ? h("p", { class: "notice" }, state.reader.problem) : null,
    discussion(topic, view),
    h("footer", { class: "provenance muted small" },
      `Summary, restatements and marks by ${data.models.join(", ")}, from a forum snapshot taken ${shortDate(data.snapshot_at)}. zforum is read-only; posts belong to their authors on the forum.`),
  );
}
