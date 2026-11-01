// The topic page (SPEC §3): an optional question summary, scoped What's new controls,
// reading settings and
// the discussion as one forum-styled tab per thread, loaded a batch at a time as the reader
// scrolls (D-48, D-51).

import { append, h, link } from "./dom.js";
import { greyReasons, issueCoverage, unmatchedArguments, maskMentions, participantNumbers, POSTS_PER_LOAD, SINCE_HOURS, shortDate, sinceCutoff, topicStats, whatsNew } from "./logic.js";
import { renderPost } from "./post.js";
import { selectionBar } from "./selection-controls.js";
import { ACCOUNT_AGE_MINIMUMS } from "./vocab.js";
import { ANALYSIS_DISCLOSURE, FLAG_IDS, FUNCTIONS, flagLabel, TONE_PRESETS, SUPPORT_PRESETS, UNASSESSED_PRESETS } from "./rubric.js";
import { cites } from "./citations.js";
import { orientation, questionCards } from "./summary.js";

export const THREAD_TABS_ID = "thread-tabs";

const pressed = (match) => (match ? "true" : "false");

function sinceRow(view) {
  const { settings, lastVisit } = view.state;
  const since = settings.since;
  const choose = (value) => view.actions.setSettings({ since: value });
  const custom = since.kind === "hours" && !SINCE_HOURS.includes(since.hours) ? since.hours : "";
  return h("div", { class: "since-row", role: "group", "aria-label": "What's new since" },
    h("span", { class: "since-label" }, "What's new since:"),
    SINCE_HOURS.map((hours) => h("button", { id: `since-${hours}`, class: "chip", "aria-pressed": pressed(since.kind === "hours" && since.hours === hours), on: { click: () => choose({ kind: "hours", hours }) } }, `${hours} hours ago`)),
    h("button", { id: "since-last-visit", class: "chip", "aria-pressed": pressed(since.kind === "last-visit"), title: lastVisit === null ? "No earlier visit recorded in this browser" : `Last visit: ${shortDate(lastVisit)}`, on: { click: () => choose({ kind: "last-visit" }) } }, "My last visit"),
    h("label", { class: "custom-hours" }, "or ",
      h("input", { id: "since-custom", type: "number", min: 1, max: 720, step: 1, value: custom, "aria-label": "Hours ago", on: { change: (event) => {
        const hours = Number(event.target.value);
        if (Number.isInteger(hours) && hours >= 1 && hours <= 720) choose({ kind: "hours", hours });
      } } }), " hours"),
    h("button", { id: "since-off", class: "chip", "aria-pressed": pressed(since.kind === "none"), on: { click: () => choose({ kind: "none" }) } }, "Off"));
}

function settingsPanel(view) {
  const { settings } = view.state;
  const set = (patch) => view.actions.setSettings(patch);
  const visible = view.allPosts.filter((post) => !post.hidden);
  const filtered = visible.filter((post) => greyReasons(post, settings, view.snapshotAt).length > 0).length;
  const select = (label, key, choices) => h("label", { class: "reading-choice" }, label,
    h("select", { id: `setting-${key}`, "aria-label": label, on: { change: (event) => set({ [key]: event.target.value }) } },
      choices.map((choice) => h("option", { value: choice.id, selected: settings[key] === choice.id }, choice.label))));
  const toggle = (label, key) => h("label", { class: "toggle" },
    h("input", { id: `setting-${key}`, type: "checkbox", checked: settings[key], on: { change: (event) => set({ [key]: event.target.checked }) } }), label);
  return h("details",
    { class: "settings-panel", open: view.state.open.settings, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("settings-panel")) view.actions.setOpen("settings", null, event.target.open); } } },
    h("summary", {}, h("strong", {}, "Reading settings: tone & argument support"), h("span", { class: "muted small" }, ` · ${filtered} of ${visible.length} posts outside your settings`)),
    h("p", { class: "muted small" }, "All posts start collapsed. Posts outside these settings remain accessible and are greyed when expanded. Ratings describe the original, not its rendition."),
    h("div", { class: "reading-choices" },
      select("Tone", "tonePreset", TONE_PRESETS),
      select("Argument support", "supportPreset", SUPPORT_PRESETS),
      select("Unassessed replies", "unassessed", UNASSESSED_PRESETS),
      select("Open posts on", "preferredVersion", [{ id: "neutral", label: "Neutral rendition, when available" }, { id: "original", label: "Original" }])),
    h("p", { class: "muted small" }, "Tone presets include material isolated attacks. Argument support is assessed separately. Questions and simple preferences may have no support score; that does not make them poor contributions."),
    h("fieldset", { class: "contribution-types" }, h("legend", {}, "Include kinds of contributions"),
      FUNCTIONS.map((kind) => h("label", {}, h("input", { id: `function-${kind}`, type: "checkbox", checked: settings.includedFunctions.includes(kind), on: { change: (event) => set({ includedFunctions: event.target.checked ? [...settings.includedFunctions, kind] : settings.includedFunctions.filter((value) => value !== kind) }) } }), flagLabel(kind))),
      h("p", { class: "muted small" }, "A post matches if any of its kinds are included; tone and support settings still apply.")),
    toggle("Flag disputed assumptions", "flagAssumptions"),
    toggle("Show constructive reframing", "showReframing"),
    toggle("Highlight new points and posts", "highlightNew"),
    toggle("Anonymous mode — reveal authors one post at a time", "anonymous"),
    h("div", { class: "age-row", role: "group", "aria-label": "Minimum time on forum" },
      h("span", {}, "Minimum time on forum:"),
      ACCOUNT_AGE_MINIMUMS.map((choice) => h("button", { class: "chip", "aria-pressed": pressed(settings.minAccountMonths === choice.months), on: { click: () => set({ minAccountMonths: choice.months }) } }, choice.label)),
      h("label", {}, "Calendar months ", h("input", { type: "number", min: 0, max: 1200, step: 1, value: settings.minAccountMonths, "aria-label": "Minimum forum account age in months", on: { change: (event) => { const months = Number(event.target.value); if (Number.isInteger(months) && months >= 0 && months <= 1200) set({ minAccountMonths: months }); } } })),
      h("span", { class: "muted small" }, "Unknown account ages are included.")),
    h("details", { class: "flag-filters", open: view.state.open.flags, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("flag-filters")) view.actions.setOpen("flags", null, event.target.open); } } }, h("summary", {}, "Filter by specific passage flags"),
      h("fieldset", {}, h("legend", {}, "Grey posts containing any selected flag"),
        FLAG_IDS.map((id) => h("label", { class: "flag-option" },
          h("input", { id: `flag-${id}`, type: "checkbox", checked: settings.filteredFlags.includes(id), on: { change: (event) => set({ filteredFlags: event.target.checked ? [...settings.filteredFlags, id] : settings.filteredFlags.filter((value) => value !== id) }) } }), flagLabel(id))))),
    toggle("Mind-change ratings — how posts moved you and other readers", "showRatings"),
    h("div", { class: "coverage" }, h("strong", {}, "Coverage with these settings"),
      h("p", { class: "small" }, "The debate summary retains all arguments, including dissent from filtered posts. Counts below show matching source posts, not agreement or quality."),
      h("ul", {}, view.coverage.map((issue) => h("li", {}, `${issue.label}: ${issue.matching}/${issue.total} source posts match`, issue.matching === 0 ? " — no matching sources; the issue is still retained" : ""))),
      view.unmatched.length === 0 ? h("p", { class: "small" }, "Every summarized argument has at least one matching cited source.") : h("details", {},
        h("summary", {}, `${view.unmatched.length} summarized arguments have no matching cited sources`),
        h("p", { class: "small" }, "Their attributed summaries and original sources remain available here:"),
        h("ul", {}, view.unmatched.map((point) => h("li", {}, view.transform(point.text), " ", cites(point.cites, view)))))),
    h("p", { class: "analysis-disclosure muted small" }, ANALYSIS_DISCLOSURE));
}

function whatsNewSummary(topic, view) {
  const since = view.state.settings.since;
  let body;
  if (since.kind === "none") body = h("p", { class: "muted small" }, "New-post highlighting is off. Choose a period above to compare with this snapshot.");
  else if (view.cutoff === null) body = h("p", { class: "muted" }, "This is your first visit, so there is nothing to compare with yet.");
  else if (view.news.posts.size === 0) body = h("p", { class: "muted" }, `Nothing new since ${shortDate(view.cutoff)}. New means the forum post's creation time, not its import or edit time.`);
  else {
    body = [
      h("p", {}, h("strong", {}, `${view.news.posts.size} new posts`), ` since ${shortDate(view.cutoff)}, in `, view.news.threads.map((thread, index) => [index > 0 ? ", " : null, `${view.letterOf.get(thread.id)} “${thread.title}” (${thread.count})`]), "."),
      view.news.points.length > 0
        ? h("div", { class: "new-points" }, h("p", { class: "muted" }, "Points first made in that time:"), h("ul", {}, topic.points.filter((point) => view.news.points.includes(point.id)).map((point) => h("li", {}, point.text, " ", cites(point.cites.slice(0, 1), view)))))
        : h("p", { class: "muted" }, "No new points were first made in that time; the new posts continue existing ones."),
    ];
  }
  return h("section", { class: "whats-new card", "aria-live": "polite" }, h("h2", {}, "What's new"), sinceRow(view), body);
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
  return h("section", { class: "discussion", id: "discussion" },
    h("h2", {}, "The discussion"),
    h("p", { class: "muted" }, "Scan the short AI summaries, then expand any post. The Original and Diff tabs let you check each rendition."),
    h("button", { class: "chip collapse-all", id: "collapse-all", on: { click: () => view.actions.collapseAll() } }, "Collapse all posts"),
    settingsPanel(view),
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
    coverage: issueCoverage(topic, state.settings, data.snapshot_at),
    unmatched: unmatchedArguments(topic, state.settings, data.snapshot_at),
  };
  const stats = topicStats(topic, data.snapshot_at);
  return h(
    "div",
    { class: "topic" },
    h("p", { class: "back" }, h("a", { href: "#/" }, "← All topics")),
    h("header", { class: "topic-head" },
      h("p", { class: "eyebrow" }, `${topic.card.title} · ${stats.threads} threads · ${stats.posts} posts · ${stats.participants} people`),
      h("h1", {}, topic.headline),
      h("p", { class: "small" }, `Last updated from the forum: ${shortDate(data.snapshot_at)}`),
      h("button", { class: "chip", on: { click: () => actions.listenOverview() } }, "Listen to the overview")),
    h("details", { class: "debate-summary card", open: state.open.summary, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("debate-summary")) actions.setOpen("summary", null, event.target.open); } } },
      h("summary", {}, h("strong", {}, "Read the debate summary"), h("span", { class: "muted small" }, " · six questions · optional")),
      orientation(topic, view), questionCards(topic, view)),
    whatsNewSummary(topic, view),
    state.ratings.status === "error" && state.settings.showRatings ? h("p", { class: "notice" }, `Mind-change ratings are unavailable: ${state.ratings.problem}`) : null,
    state.feedback.status === "error" ? h("p", { class: "notice" }, `Restatement feedback is unavailable: ${state.feedback.problem}`) : null,
    state.reader.problem ? h("p", { class: "notice" }, state.reader.problem) : null,
    discussion(topic, view),
    h("footer", { class: "provenance muted small" },
      `AI summaries, neutral renditions and provisional assessments by ${data.models.join(", ")}, from a forum snapshot taken ${shortDate(data.snapshot_at)}. zforum is read-only; posts belong to their authors on the forum.`),
  );
}
