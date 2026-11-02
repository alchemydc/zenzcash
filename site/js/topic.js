import { append, h, link } from "./dom.js";
import { countLabel, greyReasons, maskMentions, orderedPosts, participantNumbers, POSTS_PER_LOAD, SINCE_HOURS, shortDate, sinceCutoff, whatsNew } from "./logic.js";
import { renderPost } from "./post.js";
import { selectionBar } from "./selection-controls.js";
import { readingControls } from "./reading-controls.js";
import { cites } from "./citations.js";
import { orientation, questionCards } from "./summary.js";
export const THREAD_TABS_ID = "thread-tabs";
function sinceRow(view) {
  const { since } = view.state.settings;
  const choose = (value) => view.actions.setSettings({ since: value });
  return h("div", { class: "since-row", role: "group", "aria-label": "What's new since" },
    SINCE_HOURS.map((hours) => h("button", { id: `since-${hours}`, class: "chip", "aria-pressed": String(since.kind === "hours" && since.hours === hours), on: { click: () => choose({ kind: "hours", hours }) } }, `${hours} hours ago`)),
    h("button", { id: "since-last-visit", class: "chip", "aria-pressed": String(since.kind === "last-visit"), on: { click: () => choose({ kind: "last-visit" }) } }, "My last visit"),
    h("label", {}, "Custom hours ", h("input", { id: "since-custom", type: "number", min: 1, max: 720, step: 1, value: since.kind === "hours" && !SINCE_HOURS.includes(since.hours) ? since.hours : "", "aria-label": "Hours ago", on: { change: (event) => { const hours = Number(event.target.value); if (Number.isInteger(hours) && hours >= 1 && hours <= 720) choose({ kind: "hours", hours }); else event.target.reportValidity(); } } })),
    h("button", { id: "since-off", class: "chip", "aria-pressed": String(since.kind === "none"), on: { click: () => choose({ kind: "none" }) } }, "Off"));
}
function whatsNewSummary(topic, view) {
  const since = view.state.settings.since;
  const description = since.kind === "none" ? "New-post highlighting is off." : view.cutoff === null ? "This is your first visit. Your next visit will have a comparison." : `${countLabel(view.news.posts.size, "new post")} since ${shortDate(view.cutoff)}. Based on when each post appeared on the forum.`;
  return h("section", { class: "whats-new card" }, h("h2", {}, "What's new"), sinceRow(view), h("p", { "aria-live": "polite" }, description),
    view.news.points.length ? h("details", {}, h("summary", {}, `${view.news.points.length} new points`), h("ul", {}, topic.points.filter((point) => view.news.points.includes(point.id)).map((point) => h("li", {}, view.transform(point.text), " ", cites(point.cites, view))))) : null);
}
let loadWatcher = null;
function postStream(topic, view) {
  const stream = view.state.settings.threadView === "all" ? "all" : view.state.thread;
  const posts = orderedPosts(topic, view.state.settings, view.state.thread);
  const list = h("div", { class: "forum-posts" });
  const more = h("button", { class: "load-more zf" });
  let rendered = 0;
  const fill = () => {
    const target = Math.min(view.state.shown.get(stream) ?? POSTS_PER_LOAD, posts.length);
    append(list, posts.slice(rendered, target).map((post) => renderPost(post, view)));
    rendered = target; more.hidden = rendered === posts.length;
    more.textContent = `Show ${Math.min(POSTS_PER_LOAD, posts.length - rendered)} more posts (${posts.length - rendered} left)`;
  };
  if (loadWatcher) loadWatcher.disconnect();
  loadWatcher = new IntersectionObserver((entries) => { if (more.isConnected && entries.some((entry) => entry.isIntersecting) && !more.hidden) more.click(); }, { rootMargin: "0px 0px 800px 0px" });
  more.addEventListener("click", () => { view.actions.showMore(stream); fill(); loadWatcher.unobserve(more); loadWatcher.observe(more); });
  fill(); loadWatcher.observe(more);
  return h("div", { class: "forum" }, list, more);
}
function discussion(topic, view) {
  const { settings } = view.state;
  const choice = (key, options) => h("div", { class: "button-group" }, options.map(([id, label]) => h("button", { class: "chip", "aria-pressed": String(settings[key] === id), on: { click: () => view.actions.setSettings({ [key]: id }) } }, label)));
  return h("section", { class: "discussion", id: "discussion" }, h("h2", {}, "Individual posts"),
    h("p", { class: "muted small" }, "Scan the short summaries and expand the posts that interest you."),
    h("div", { class: "discussion-toolbar" }, choice("threadView", [["all", "All threads together"], ["thread", "By thread"]]), choice("postOrder", [["newest", "Newest first"], ["oldest", "Oldest first"]]),
      h("button", { class: "chip", id: "collapse-all", on: { click: () => view.actions.collapseAll() } }, "Collapse all posts")),
    selectionBar(view),
    h("div", { id: THREAD_TABS_ID, class: "thread-tabs" }, settings.threadView === "thread" ? topic.threads.map((thread) => h("button", { class: "thread-tab", "aria-pressed": String(thread.id === view.state.thread), on: { click: () => view.actions.setThread(thread.id) } }, `${view.letterOf.get(thread.id)} · ${thread.title} (${thread.posts.length})`)) : null), postStream(topic, view));
}
export function renderTopic(data, state, actions) {
  const topic = data.topic;
  const allPosts = topic.threads.flatMap((thread) => thread.posts);
  const numbers = participantNumbers(topic);
  const cutoff = sinceCutoff(state.settings.since, data.snapshot_at, state.lastVisit);
  const view = { state, actions, allPosts, numbers, snapshotAt: data.snapshot_at, forumOrigin: data.forum_origin,
    posts: new Map(allPosts.map((post) => [post.key, post])), threadOf: new Map(topic.threads.flatMap((thread) => thread.posts.map((post) => [post.key, thread]))),
    letterOf: new Map(topic.threads.map((thread, index) => [thread.id, String.fromCharCode(65 + index)])),
    transform: state.settings.anonymous ? (text) => maskMentions(text, numbers) : (text) => text, cutoff, news: whatsNew(topic, cutoff) };
  const visible = allPosts.filter((post) => !post.hidden);
  const matching = visible.filter((post) => greyReasons(post, state.settings, data.snapshot_at).length === 0).length;
  return h("div", { class: "topic" },
    h("p", { class: "back" }, h("a", { href: "#/topics" }, "← All topics")),
    h("header", { class: "topic-head" }, h("h1", {}, topic.headline),
      h("p", {}, `This topic brings together ${topic.threads.length} forum thread${topic.threads.length === 1 ? "" : "s"}:`),
      h("ul", { class: "included-threads" }, topic.threads.map((thread) => h("li", {}, h("button", { class: "linkish", on: { click: () => actions.setThread(thread.id) } }, `${view.letterOf.get(thread.id)} · ${thread.title}`), " · ", link(thread.url, "On the forum ↗")))),
      h("p", { class: "small muted" }, `Last pulled from the forum: ${shortDate(data.last_pulled_at ?? data.snapshot_at)}`),
      data.analysis_pending ? h("p", { class: "notice small" }, `Newer forum data is awaiting analysis. Displaying the snapshot from ${shortDate(data.snapshot_at)}.`) : null),
    h("div", { class: "reading-layout" }, readingControls(view), h("div", { class: "reading-content" },
      whatsNewSummary(topic, view),
      h("section", { class: "topic-summary card" }, h("h2", {}, "Topic summary"), orientation(topic, view), h("button", { class: "chip", on: { click: () => actions.listenOverview() } }, "Listen to the overview"),
        h("details", { class: "debate-summary", open: state.open.summary, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("debate-summary")) actions.setOpen("summary", null, event.target.open); } } }, h("summary", {}, "Choose a question to explore"), questionCards(topic, view))),
      h("p", { class: "match-count", "aria-live": "polite" }, `${matching} of ${visible.length} posts match your filters. ${visible.length - matching} are compact rows you can show individually.`),
      state.ratings.status === "error" ? h("p", { class: "notice" }, `Mind-change ratings unavailable: ${state.ratings.problem}`) : null,
      state.feedback.status === "error" ? h("p", { class: "notice" }, `Re-write feedback unavailable: ${state.feedback.problem}`) : null,
      state.reader.problem ? h("p", { class: "notice" }, state.reader.problem) : null, discussion(topic, view))),
    h("footer", { class: "provenance muted small" }, `AI summaries, re-writes and provisional ratings by ${data.models.join(", ")}. Check the original sources. Posts belong to their authors; this site is read-only.`));
}
