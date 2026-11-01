// The topic page (SPEC §3): summary with citations, "why do people think this?", what's new,
// reading settings, and the whole discussion as calm restatements with marks.

import { h, link, renderBlocks } from "./dom.js";
import { accountAgeLabel, formatAverage, greyReasons, maskMentions, pseudonyms, ratingSummary, SINCE_HOURS, sinceCutoff, topicStats, whatsNew } from "./logic.js";
import { parseBlocks, plainText } from "./markdown.js";
import { MATURITY_MAX, MATURITY_MIN, RATINGS, TRAITS, maturityBand } from "./vocab.js";

const traitLabel = (id) => TRAITS.find((trait) => trait.id === id).label;
const shortDate = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).concat(" UTC");
export const postElementId = (key) => `post-${key.replace("/", "-")}`;

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

function whatsNewSection(topic, view) {
  const { settings, lastVisit } = view.state;
  const since = settings.since;
  const choose = (value) => view.actions.setSettings({ since: value });
  const pressed = (match) => (match ? "true" : "false");
  const custom = since.kind === "hours" && !SINCE_HOURS.includes(since.hours) ? since.hours : "";
  let summary;
  if (since.kind === "none") summary = null;
  else if (view.cutoff === null) summary = h("p", { class: "muted" }, "This is your first visit, so there is nothing to compare with yet.");
  else if (view.news.posts.size === 0) summary = h("p", { class: "muted" }, `Nothing new since ${shortDate(view.cutoff)}.`, since.kind === "last-visit" ? " (This prototype shows a fixed snapshot, so nothing changes between visits.)" : null);
  else {
    summary = [
      h("p", {}, h("strong", {}, `${view.news.posts.size} new posts`), ` since ${shortDate(view.cutoff)}, in `, view.news.threads.map((thread, index) => [index > 0 ? ", " : null, `${view.letterOf.get(thread.id)} “${thread.title}” (${thread.count})`]), "."),
      view.news.points.length > 0
        ? h("div", { class: "new-points" }, h("p", { class: "muted" }, `Points first made in that time:`), h("ul", {}, topic.points.filter((point) => view.news.points.includes(point.id)).map((point) => h("li", {}, point.text, " ", cites(point.cites.slice(0, 1), view)))))
        : h("p", { class: "muted" }, "No new points were first made in that time; the new posts continue existing ones."),
    ];
  }
  return h(
    "section",
    { class: "whats-new card", "aria-live": "polite" },
    h("div", { class: "since-row", role: "group", "aria-label": "What's new since" },
      h("span", { class: "since-label" }, "What's new since:"),
      SINCE_HOURS.map((hours) => h("button", { class: "chip", "aria-pressed": pressed(since.kind === "hours" && since.hours === hours), on: { click: () => choose({ kind: "hours", hours }) } }, `${hours} hours ago`)),
      h("button", { class: "chip", "aria-pressed": pressed(since.kind === "last-visit"), title: lastVisit === null ? "No earlier visit recorded in this browser" : `Last visit: ${shortDate(lastVisit)}`, on: { click: () => choose({ kind: "last-visit" }) } }, "My last visit"),
      h("label", { class: "custom-hours" }, "or ",
        h("input", { type: "number", min: 1, max: 720, step: 1, value: custom, "aria-label": "Hours ago", on: { change: (event) => {
          const hours = Number(event.target.value);
          if (Number.isInteger(hours) && hours >= 1 && hours <= 720) choose({ kind: "hours", hours });
        } } }), " hours"),
      h("button", { class: "chip", "aria-pressed": pressed(since.kind === "none"), on: { click: () => choose({ kind: "none" }) } }, "Off")),
    summary,
  );
}

function controls(view) {
  const { settings } = view.state;
  const greyedCount = view.allPosts.filter((post) => greyReasons(post, settings).length > 0).length;
  return h(
    "section",
    { class: "controls card" },
    h("h2", {}, "Reading settings"),
    h("label", { class: "toggle" }, h("input", { type: "checkbox", checked: settings.anonymous, on: { change: (event) => view.actions.setSettings({ anonymous: event.target.checked }) } }),
      h("span", {}, h("strong", {}, "Anonymous mode"), " — read the arguments without knowing who wrote them. You can reveal one post at a time.")),
    h("label", { class: "slider" }, "Grey out posts with maturity below ",
      h("input", { type: "range", min: MATURITY_MIN, max: MATURITY_MAX + 1, step: 1, value: settings.minMaturity, on: { input: (event) => view.actions.setSettings({ minMaturity: Math.min(MATURITY_MAX, Number(event.target.value)) }) } }),
      h("strong", { class: `maturity band-${maturityBand(settings.minMaturity)}` }, `${settings.minMaturity}`)),
    h("fieldset", { class: "traits" }, h("legend", {}, "Grey out posts that are marked:"),
      TRAITS.map((trait) => h("label", { class: "trait-option", title: trait.meaning },
        h("input", { type: "checkbox", checked: settings.greyTraits.includes(trait.id), on: { change: (event) => view.actions.setSettings({ greyTraits: event.target.checked ? [...settings.greyTraits, trait.id] : settings.greyTraits.filter((id) => id !== trait.id) }) } }),
        h("span", {}, trait.label), h("span", { class: "muted small" }, ` ${trait.meaning}`)))),
    h("label", { class: "toggle" }, h("input", { type: "checkbox", checked: settings.showRatings, on: { change: (event) => view.actions.setSettings({ showRatings: event.target.checked }) } }),
      h("span", {}, h("strong", {}, "Mind-change ratings"), " — rate how each post moved you, and see how it moved other readers.")),
    h("p", { class: "muted small" }, `${greyedCount} of ${view.allPosts.filter((post) => !post.hidden).length} posts are greyed with these settings. Greyed posts stay readable; nothing is hidden.`),
  );
}

function authorLine(post, view) {
  const { settings } = view.state;
  const anonymous = settings.anonymous && !view.state.revealed.has(post.key);
  return [
    h("span", { class: "author" }, anonymous ? view.names.get(post.author) : post.author),
    anonymous
      ? h("button", { class: "linkish small reveal", on: { click: () => view.actions.reveal(post.key) } }, "Who wrote this?")
      : h("span", { class: "muted" }, ` · ${accountAgeLabel(post.account, view.snapshotAt)}`),
  ];
}

function quoteBlock(segment, view) {
  const anonymous = view.state.settings.anonymous;
  const source = segment.source;
  let who = "Someone";
  if (source !== null) who = anonymous ? (view.names.get(source.username) ?? "another forum member") : source.username;
  const where = source !== null && source.post !== null ? ` (#${source.post}${view.threadOf.has(`${source.topic}/${source.post}`) ? "" : `, t/${source.topic}`})` : "";
  return h("blockquote", { class: "forum-quote" }, h("p", { class: "quote-by" }, `${who} wrote${where}:`), renderBlocks(parseBlocks(segment.text), view.transform));
}

const originalContent = (post, view) => post.segments.map((segment) => (segment.kind === "text" ? renderBlocks(parseBlocks(segment.text), view.transform) : quoteBlock(segment, view)));

function marks(post, view) {
  const open = view.state.open.marks.has(post.key);
  return h(
    "div",
    { class: "marks" },
    h("span", { class: `maturity band-${maturityBand(post.maturity)}`, title: post.maturity_reason }, `Maturity ${post.maturity}/10`),
    post.traits.map((mark) => h("span", { class: "trait", title: mark.reason }, traitLabel(mark.trait))),
    h("details", { class: "why-marks", open, on: { toggle: (event) => view.actions.setOpen("marks", post.key, event.target.open) } },
      h("summary", {}, "Why?"),
      h("ul", {},
        h("li", {}, h("strong", {}, `Maturity ${post.maturity}: `), post.maturity_reason),
        post.traits.map((mark) => h("li", {}, h("strong", {}, `${traitLabel(mark.trait)}: `), mark.reason, " ", h("q", {}, view.transform(mark.quote)))))),
  );
}

function ratingsRow(post, view) {
  const { ratings } = view.state;
  if (!view.state.settings.showRatings || ratings.status !== "ready") return null;
  const mine = ratings.mine[post.key] ?? null;
  const summary = ratingSummary(ratings.posts[post.key] ?? {});
  return h(
    "div",
    { class: "ratings" },
    h("span", { class: "ratings-q" }, "How did this post move you?"),
    h("span", { class: "rating-buttons", role: "group", "aria-label": "Your rating" }, RATINGS.map((rating) => h(
      "button",
      { class: `rating rating-${rating.id}`, title: rating.meaning, "aria-pressed": mine === rating.id ? "true" : "false", on: { click: () => view.actions.rate(post.key, mine === rating.id ? null : rating.id) } },
      rating.label,
    ))),
    h("span", { class: "ratings-summary muted small" }, summary.total === 0
      ? "No ratings yet."
      : [summary.levels.filter((level) => level.count > 0).map((level) => `${level.count} ${level.label.toLowerCase()}`).join(" · "), ` · average ${formatAverage(summary.average)} (from −1 to +2)`]),
  );
}

function postView(post, view) {
  const isNew = view.news.posts.has(post.key);
  const reply = post.reply_to === null ? null : [" · replying to ", view.posts.has(`${view.threadOf.get(post.key).id}/${post.reply_to}`)
    ? h("button", { class: "linkish", on: { click: () => view.actions.openPost(`${view.threadOf.get(post.key).id}/${post.reply_to}`) } }, `#${post.reply_to}`)
    : `#${post.reply_to} (deleted)`];
  const head = h("header", { class: "post-head" }, authorLine(post, view), h("span", { class: "muted" }, ` · ${shortDate(post.created_at)} · #${post.number}`, reply), isNew ? h("span", { class: "badge-new" }, "New") : null);
  if (post.hidden) return h("article", { class: "post hidden-post", id: postElementId(post.key) }, head, h("p", { class: "muted" }, "Hidden by the forum community."));
  const reasons = greyReasons(post, view.state.settings);
  const flash = view.state.flash === post.key;
  const body = post.clean === null
    ? [h("p", { class: "label" }, "As written (already calm)"), h("div", { class: "post-body" }, originalContent(post, view))]
    : [
      h("p", { class: "label" }, "Calm restatement"),
      h("div", { class: "post-body" }, renderBlocks(parseBlocks(post.clean), view.transform)),
      h("details", { class: "original", open: view.state.open.originals.has(post.key), on: { toggle: (event) => view.actions.setOpen("originals", post.key, event.target.open) } },
        h("summary", {}, "Show original"), h("div", { class: "post-body" }, originalContent(post, view))),
    ];
  return h(
    "article",
    { class: ["post", reasons.length > 0 ? "greyed" : null, isNew ? "is-new" : null, flash ? "flash" : null].filter(Boolean).join(" "), id: postElementId(post.key) },
    head,
    marks(post, view),
    reasons.length > 0 ? h("p", { class: "greyed-note" }, `Greyed for you: ${reasons.join(" · ")}`) : null,
    body,
    ratingsRow(post, view),
  );
}

export function renderTopic(data, state, actions) {
  const topic = data.topic;
  const allPosts = topic.threads.flatMap((thread) => thread.posts);
  const names = pseudonyms(topic);
  const cutoff = sinceCutoff(state.settings.since, data.snapshot_at, state.lastVisit);
  const view = {
    state,
    actions,
    allPosts,
    names,
    snapshotAt: data.snapshot_at,
    posts: new Map(allPosts.map((post) => [post.key, post])),
    threadOf: new Map(topic.threads.flatMap((thread) => thread.posts.map((post) => [post.key, thread]))),
    letterOf: new Map(topic.threads.map((thread, index) => [thread.id, String.fromCharCode(65 + index)])),
    transform: state.settings.anonymous ? (text) => maskMentions(text, names) : (text) => text,
    cutoff,
    news: whatsNew(topic, cutoff),
  };
  const stats = topicStats(topic, data.snapshot_at);
  return h(
    "div",
    { class: "topic" },
    h("p", {}, h("a", { href: "#/" }, "← All topics")),
    h("header", { class: "topic-head" },
      h("p", { class: "eyebrow" }, `${topic.card.title} · ${stats.threads} threads · ${stats.posts} posts · ${stats.participants} people`),
      h("h1", {}, topic.headline),
      overview(topic, view)),
    whySection(topic, view),
    whatsNewSection(topic, view),
    controls(view),
    state.ratings.status === "error" && state.settings.showRatings ? h("p", { class: "notice" }, `Mind-change ratings are unavailable: ${state.ratings.problem}`) : null,
    state.reader.problem ? h("p", { class: "notice" }, state.reader.problem) : null,
    h("section", { class: "discussion" },
      h("h2", {}, "The whole discussion, calmly"),
      h("p", { class: "muted" }, "Every post, thread by thread. Restatements change tone only: every claim, number and link is kept. The original is always one click away."),
      topic.threads.map((thread) => h(
        "section",
        { class: "thread" },
        h("h3", { class: "thread-title" }, `${view.letterOf.get(thread.id)} · ${thread.title}`),
        h("p", { class: "muted small" }, `${thread.posts.length} posts · started ${shortDate(thread.created_at)} · `, link(thread.url, "open on the forum ↗")),
        thread.posts.map((post) => postView(post, view)),
      ))),
    h("footer", { class: "provenance muted small" },
      `Summary, restatements and marks by ${data.models.join(", ")}, from a forum snapshot taken ${shortDate(data.snapshot_at)}. zforum is read-only; posts belong to their authors on the forum.`),
  );
}
