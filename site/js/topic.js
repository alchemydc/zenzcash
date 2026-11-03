import { append, h, link } from "./dom.js";
import { countLabel, greyReasons, maskMentions, orderedPosts, participantNumbers, POSTS_PER_LOAD, PULL_DAYS, shortDate, sinceCutoff, whatsNew } from "./logic.js";
import { renderPost } from "./post.js";
import { selectionBar } from "./selection-controls.js";
import { readingControls } from "./reading-controls.js";
import { filterInfo } from "./filter-info.js";
import { cites } from "./citations.js";
import { orientation, questionCards } from "./summary.js";
export const THREAD_TABS_ID = "thread-tabs";
function sinceRow(view) {
  const { since } = view.state.settings;
  return h("div", { class: "since-row", role: "group", "aria-label": "Days ending at the last forum pull" },
    PULL_DAYS.map((days) => h("button", { id: `since-${days}`, class: "chip", "aria-pressed": String(since.days === days), on: { click: () => view.actions.setSettings({ since: { kind: "pull-days", days } }) } }, `${days} day${days === 1 ? "" : "s"}`)),
    filterInfo("pullWindow", "What’s new time window", "Look back 1, 3 or 7 days from the last successful forum pull, using forum post timestamps. New points are checked summary points first introduced in that window, not every new reply. Counts can be identical when no additional points fall in the longer window. Changing this window does not change your selected posts.", view));
}
function whatsNewSummary(topic, view, data) {
  return h("section", { class: "whats-new card" }, h("h2", {}, "What's new"),
    h("p", { class: "pull-stamp" }, h("strong", {}, "Last pull from forum: "), shortDate(view.pulledAt)),
    data.grouped_sources ? h("details", { class: "small muted" }, h("summary", {}, "Imported separately · thread pull times"), h("p", {}, "This window ends at the earliest included pull, so it does not imply every thread was fetched again when grouped."), h("ul", {}, data.grouped_sources.map(({thread,pulled_at}) => h("li", {}, `${thread}: ${shortDate(pulled_at)}`)))) : null,
    h("p", { class: "small" }, "Days ending at this pull:"), sinceRow(view),
    h("p", { class: "small muted" }, `After ${shortDate(view.cutoff)} through ${shortDate(view.pulledAt)}. Forum timestamps; not time since your visit.`),
    data.analysis_pending ? h("p", { class: "notice small" }, `Newer forum data is awaiting analysis. Counts cover only the checked snapshot from ${shortDate(data.snapshot_at)}.`) : null,
    h("p", { "aria-live": "polite" }, `${countLabel(view.news.posts.size, "new post")} in this window.`),
    h("details", { class: "new-points", open: view.state.open.newPoints, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("new-points")) view.actions.setOpen("newPoints", null, event.target.open); } } },
      h("summary", {}, `${view.news.points.length} new points`),
      view.news.points.length ? h("ul", {}, topic.points.filter((point) => view.news.points.includes(point.id)).map((point) => h("li", {}, view.transform(point.text), " ", cites(point.cites, view)))) : h("p", { class: "small" }, "No checked summary points first appeared in this window.")));
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
  const originals=view.state.data.visibility_pending===true;
  const choice = (key, options) => h("div", { class: "button-group" }, options.map(([id, label]) => h("button", { class: "chip", "aria-pressed": String(settings[key] === id), on: { click: () => view.actions.setSettings({ [key]: id }) } }, label)), filterInfo(key, key === "threadView" ? "thread view" : "post order", key === "threadView" ? "Combine every included thread into one stream, or read a single thread. Your post selections are retained." : "Order posts by their original forum timestamps. Newest first is the default; Oldest first follows the conversation forward.", view));
  return h("section", { class: "discussion", id: "discussion" }, h("h2", {}, "Individual posts"),
    h("p", { class: "muted small" }, originals?"Public original posts remain readable while the analysis is refreshed.":"Scan the short summaries and expand the posts that interest you."),
    !originals&&!view.state.account?.authenticated ? h("p", { class: "small guest-actions-note" }, "Saving posts, read/unread marks, mood reactions and choosing a pet require sign-in. These actions open the sign-in page so your choices can be saved to your account.") : null,
    h("div", { class: "discussion-toolbar" }, choice("threadView", [["all", "All threads together"], ["thread", "By thread"]]), choice("postOrder", [["newest", "Newest first"], ["oldest", "Oldest first"]]),
      originals?null:h("div", { class: "button-group bulk-controls", role: "group", "aria-label": "Expand or collapse posts" }, h("button", { class: "chip", id: "collapse-all", on: { click: () => view.actions.collapseAll() } }, "Collapse all posts"), h("button", { class: "chip", id: "expand-all", on: { click: () => view.actions.expandAll() } }, "Expand all posts"))),
    originals?null:selectionBar(view),
    h("div", { id: THREAD_TABS_ID, class: "thread-tabs" }, settings.threadView === "thread" ? topic.threads.map((thread) => h("button", { class: "thread-tab", "aria-pressed": String(thread.id === view.state.thread), on: { click: () => view.actions.setThread(thread.id) } }, `${view.letterOf.get(thread.id)} · ${thread.title} (${thread.posts.length})`)) : null), postStream(topic, view));
}
export function renderTopic(data, state, actions) {
  const topic = data.topic;
  const allPosts = topic.threads.flatMap((thread) => thread.posts);
  const numbers = participantNumbers(topic);
  const pulledAt = data.last_pulled_at ?? data.snapshot_at;
  const cutoff = sinceCutoff(state.settings.since, pulledAt);
  const view = { state, actions, allPosts, numbers, snapshotAt: data.snapshot_at, forumOrigin: data.forum_origin,
    posts: new Map(allPosts.map((post) => [post.key, post])), threadOf: new Map(topic.threads.flatMap((thread) => thread.posts.map((post) => [post.key, thread]))),
    letterOf: new Map(topic.threads.map((thread, index) => [thread.id, String.fromCharCode(65 + index)])),
    transform: state.settings.anonymous ? (text) => maskMentions(text, numbers) : (text) => text, cutoff, pulledAt, news: whatsNew(topic, cutoff, pulledAt) };
  const visible = allPosts.filter((post) => !post.hidden);
  if(data.visibility_pending)return h("div",{class:"topic originals-only"},
    h("p",{class:"back"},h("a",{href:"#/topics"},"← All topics")),h("h1",{},topic.headline),
    h("p",{class:"notice",role:"status"},"Some forum posts are no longer public. The remaining originals are available below. AI summaries, re-writes and filters will return with the checked update."),
    h("ul",{class:"included-threads"},topic.threads.map(thread=>h("li",{},`${view.letterOf.get(thread.id)} · ${thread.title}`," · ",link(thread.url,"On the forum ↗")))),discussion(topic,view));
  const matching = visible.filter((post) => greyReasons(post, state.settings, data.snapshot_at).length === 0).length;
  return h("div", { class: "topic" },
    h("p", { class: "back" }, h("a", { href: "#/topics" }, "← All topics")),
    h("header", { class: "topic-head" }, h("h1", {}, topic.headline),
      h("p", {}, `This topic brings together ${topic.threads.length} forum thread${topic.threads.length === 1 ? "" : "s"}:`),
      h("ul", { class: "included-threads" }, topic.threads.map((thread) => h("li", {}, h("button", { class: "linkish", on: { click: () => actions.setThread(thread.id) } }, `${view.letterOf.get(thread.id)} · ${thread.title}`), " · ", link(thread.url, "On the forum ↗")))),
      ),
    h("div", { class: "reading-layout" }, readingControls(view), h("div", { class: "reading-content" },
      whatsNewSummary(topic, view, data),
      h("section", { class: "topic-summary card" }, h("h2", {}, "Topic summary"), orientation(topic, view), h("button", { class: "chip", on: { click: () => actions.listenOverview() } }, "Listen to the overview"),
        h("details", { class: "debate-summary", open: state.open.summary, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("debate-summary")) actions.setOpen("summary", null, event.target.open); } } }, h("summary", {}, "Choose a question to explore"), questionCards(topic, view))),
      h("p", { class: "match-count", "aria-live": "polite" }, `${matching} of ${visible.length} posts match your filters. ${visible.length - matching} are compact rows you can show individually.`),
      state.ratings.status === "error" ? h("p", { class: "notice" }, `Mind-change ratings unavailable: ${state.ratings.problem}`) : null,
      state.feedback.status === "error" ? h("p", { class: "notice" }, `Re-write feedback unavailable: ${state.feedback.problem}`) : null,
      state.reader.problem ? h("p", { class: "notice" }, state.reader.problem) : null, discussion(topic, view))),
    h("footer", { class: "provenance muted small" }, `AI summaries, re-writes and provisional ratings by ${data.models.join(", ")}. Check the original sources. Posts belong to their authors; this site is read-only.`));
}
