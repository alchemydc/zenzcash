// One post on the topic page, drawn like a Discourse post (D-48), with zforum's additions:
// the account-age badge (D-46), marks, the restatement and original as tabs (D-49),
// mind-change ratings (SPEC §6) and restatement feedback (SPEC §7). Each interactive part
// updates itself in place, so a click never redraws the page and keyboard focus stays put
// (D-51).

import { h, link, replaceContent, renderBlocks } from "./dom.js";
import { accountAgeLabel, formatAverage, greyReasons, noAnswers, pseudonym, ratingSummary, shortDate, relativeDate } from "./logic.js";
import { parseBlocks } from "./markdown.js";
import { FEEDBACK, REACTIONS, MOODS, RATINGS } from "./vocab.js";
import { postAssessment, highlightedNotes } from "./post-analysis.js";
import { wordDiff } from "./diff.js";
import { postRoute } from "./selection.js";

export const postElementId = (key) => `post-${key.replace("/", "-")}`;

// Letter-avatar colours, as on the forum. style.css defines .avatar-c0 to .avatar-c7.
const AVATAR_COLOURS = 8;
function avatarColour(username) {
  let hash = 0;
  for (const character of username) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash % AVATAR_COLOURS;
}

const isMasked = (post, view) => view.state.settings.anonymous && !view.state.revealed.has(post.key);
const forumPostLink = (post, view) => h("span", { class: "source-post-link" }, link(`${view.threadOf.get(post.key).url}/${post.number}`, "On the forum ↗"));

function avatar(post, view) {
  return isMasked(post, view)
    ? h("div", { class: "avatar avatar-anon", "aria-hidden": "true" }, `P${view.numbers.get(post.author)}`)
    : h("div", { class: `avatar avatar-c${avatarColour(post.author)}`, "aria-hidden": "true" }, post.author[0].toUpperCase());
}

function authorHead(post, view, reveal) {
  const masked = isMasked(post, view);
  const replyKey = post.reply_to === null ? null : `${view.threadOf.get(post.key).id}/${post.reply_to}`;
  let reply = null;
  if (replyKey !== null) {
    reply = view.posts.has(replyKey)
      ? [" · replying to ", h("button", { class: "linkish", on: { click: () => view.actions.openPost(replyKey) } }, `#${post.reply_to}`)]
      : ` · replying to #${post.reply_to} (deleted)`;
  }
  return h(
    "header",
    { class: "post-head" },
    h("span", { class: "author" }, masked ? pseudonym(view.numbers.get(post.author)) : post.author),
    masked
      ? h("button", { class: "linkish small reveal zf", on: { click: reveal } }, "Reveal author")
      : h("span", { class: `age-badge zf${post.account.created_at === null ? " age-unknown" : ""}` }, accountAgeLabel(post.account, view.snapshotAt)),
    !masked && view.state.settings.anonymous ? h("button", { class: "linkish small reveal", on: { click: reveal } }, "Hide author") : null,
    h("span", { class: "post-meta" }, h("a", { href: postRoute(view.state.data.topic.id, post.key), title: view.threadOf.get(post.key).title }, `${view.letterOf.get(view.threadOf.get(post.key).id)}#${post.number}`), reply, ` · ${shortDate(post.created_at)} · ${relativeDate(post.created_at)}`, view.state.settings.highlightNew && view.news.posts.has(post.key) ? h("span", { class: "badge-new zf" }, "New") : null),
    post.hidden ? null : forumPostLink(post, view),
  );
}

function quoteBlock(segment, view) {
  const source = segment.source;
  let who = "Someone";
  if (source !== null) {
    const number = view.numbers.get(source.username);
    if (!view.state.settings.anonymous) who = source.username;
    else who = number === undefined ? "another forum member" : pseudonym(number);
  }
  const where = source !== null && source.post !== null ? ` (#${source.post}${view.threadOf.has(`${source.topic}/${source.post}`) ? "" : `, t/${source.topic}`})` : "";
  return h("blockquote", { class: "forum-quote" }, h("p", { class: "quote-by" }, `${who} wrote${where}:`), renderBlocks(parseBlocks(segment.text), view.transform));
}

const originalContent = (post, view) => post.segments.map((segment) => (segment.kind === "text" ? renderBlocks(parseBlocks(segment.text), view.transform) : quoteBlock(segment, view)));

const VERSIONS = [
  { id: "neutral", tab: "Neutral re-write", label: "AI re-write · check against the original" },
  { id: "original", tab: "Original", label: "Original · as posted on the forum" },
  { id: "diff", tab: "Changes", label: "Changes from the original to the neutral re-write" },
];

function diffContent(post, view) {
  return [
    h("p", { class: "diff-legend zf small" }, h("del", {}, "Removed wording"), " · ", h("ins", {}, "Added wording"), ". Quoted replies are unchanged and shown separately below."),
    h("div", { class: "diff-text" }, wordDiff(post.own_text, post.analysis.neutral_rendition).map((run) => {
      const text = view.transform(run.text);
      if (run.kind === "equal") return text;
      return h(run.kind === "delete" ? "del" : "ins", { title: run.kind === "delete" ? "Removed" : "Added" }, text);
    })),
    post.segments.filter((segment) => segment.kind === "quote").map((segment) => quoteBlock(segment, view)),
  ];
}

// Only the version on show is rendered; switching renders the other one.
function versions(post, view) {
  if (post.analysis.neutral_rendition === null) {
    return h("div", { class: "version version-original solo" },
      h("p", { class: "version-label zf" }, "Original · no re-write available"),
      h("div", { class: "post-body" }, originalContent(post, view)));
  }
  const panel = h("div", { role: "tabpanel" });
  const tabs = VERSIONS.map((version) => h("button", { class: `version-tab version-tab-${version.id} zf`, role: "tab", on: { click: () => show(version.id) } }, version.tab));
  const show = (id) => {
    view.actions.setVersion(post.key, id);
    sync();
  };
  const sync = () => {
    // A citation explicitly selects the original; otherwise the reader’s default applies.
    const chosen = view.state.versions.get(post.key) ?? view.state.settings.preferredVersion;
    const current = VERSIONS.find((version) => version.id === chosen);
    VERSIONS.forEach((version, index) => tabs[index].setAttribute("aria-selected", String(version === current)));
    panel.className = `version version-${current.id}`;
    replaceContent(panel, [
      h("p", { class: "version-label zf" }, current.label),
      h("div", { class: "post-body" }, current.id === "neutral" ? [renderBlocks(parseBlocks(post.analysis.neutral_rendition), view.transform), post.segments.filter((segment) => segment.kind === "quote").map((segment) => quoteBlock(segment, view))] : current.id === "diff" ? diffContent(post, view) : originalContent(post, view)),
    ]);
  };
  sync();
  return [h("div", { class: "version-tabs", role: "tablist", "aria-label": "Which text to show" }, tabs), panel];
}

function ratingsRow(post, view) {
  if (!view.state.settings.showRatings || view.state.ratings.status !== "ready") return null;
  if (view.state.account && !view.state.account.authenticated) return h("p", { class: "small" }, "Sign in to rate how this post moved you.");
  const mine = () => view.state.ratings.mine[post.key] ?? null;
  const summary = h("span", { class: "ratings-summary muted small" });
  const buttons = RATINGS.map((rating) => h(
    "button",
    { class: `rating rating-${rating.id}`, title: rating.meaning, on: { click: async () => {
      await view.actions.rate(post.key, mine() === rating.id ? null : rating.id);
      sync();
    } } },
    rating.label,
  ));
  const sync = () => {
    RATINGS.forEach((rating, index) => buttons[index].setAttribute("aria-pressed", String(mine() === rating.id)));
    const result = ratingSummary(view.state.ratings.posts[post.key] ?? {});
    replaceContent(summary, result.total === 0
      ? "No ratings yet."
      : [result.levels.filter((level) => level.count > 0).map((level) => `${level.count} ${level.label.toLowerCase()}`).join(" · "), ` · average ${formatAverage(result.average)} (from −1 to +2)`]);
  };
  sync();
  return h("div", { class: "ratings" }, h("span", { class: "ratings-q" }, "How did this post move you?"), h("span", { class: "rating-buttons", role: "group", "aria-label": "Your rating" }, buttons), summary);
}

function reactionGroup(label, options, read, save) {
  const buttons = options.map(({ score, label: text, meaning }) => h("button", { class: "chip reaction", title: meaning, "aria-label": `${label}: ${meaning}`, on: { click: async () => {
    buttons.forEach((button) => { button.disabled = true; });
    try { await save(read() === score ? null : score); }
    finally { sync(); buttons.forEach((button) => { button.disabled = false; }); }
  } } }, h("span", { "aria-hidden": "true" }, text), h("span", { class: "hover-tip" }, meaning)));
  const sync = () => options.forEach(({ score }, index) => buttons[index].setAttribute("aria-pressed", String(read() === score)));
  sync();
  return h("span", { class: "reaction-group", role: "group", "aria-label": label }, buttons);
}
function moodRow(post, view) {
  return h("div", { class: "mood-row" }, h("span", { class: "small" }, "How did this post make you feel?"),
    reactionGroup("Mood", MOODS, () => view.state.account?.personal?.moods[post.key] ?? null, (score) => view.state.account?.personal ? view.actions.setMood(post.key, score) : view.actions.openAccount("save your mood reaction")));
}
function feedbackBox(post, view) {
  if (post.analysis.neutral_rendition === null || view.state.feedback.status !== "ready") return null;
  return h("div", { class: "feedback" }, h("p", { class: "feedback-title" }, "Feedback on this re-write", h("span", { class: "muted small" }, " · Affects your Zamagotchi")),
    FEEDBACK.map((item) => h("div", { class: "feedback-item" }, h("p", {}, h("strong", {}, `${item.label}: `), item.question),
      reactionGroup(item.label, REACTIONS, () => (view.state.feedback.mine[post.key] ?? noAnswers())[item.id], (score) => view.actions.giveFeedback(post.key, { [item.id]: score })))));
}

export function renderPost(post, view) {
  const avatarSlot = h("div", { class: "post-avatar" }, avatar(post, view));
  let head = null;
  const reveal = () => {
    view.actions.reveal(post.key);
    replaceContent(avatarSlot, avatar(post, view));
    const revealed = authorHead(post, view, reveal);
    head.replaceWith(revealed);
    head = revealed;
  };
  head = authorHead(post, view, reveal);
  const id = postElementId(post.key);
  if (post.hidden) return h("article", { class: "post hidden-post", id }, avatarSlot, h("div", { class: "post-main" }, head, h("p", { class: "muted" }, "Hidden by the forum community.")));
  if(view.state.data.visibility_pending)return h("article",{class:"post original-pending",id},avatarSlot,h("div",{class:"post-main"},head,h("div",{class:"post-body"},originalContent(post,view))));
  const reasons = greyReasons(post, view.state.settings, view.snapshotAt);
  const filtered = reasons.length > 0 && !view.state.shownFiltered.has(post.key);
  if (filtered) return h("article", { class: "post compact-post", id },
    h("span", { class: "compact-summary" }, `${view.letterOf.get(view.threadOf.get(post.key).id)}#${post.number} · ${view.transform(post.analysis.summary)}`),
    h("span", { class: "small muted" }, reasons.join(" · ")),
    forumPostLink(post, view),
    h("button", { class: "chip", on: { click: () => view.actions.showFiltered(post.key) } }, "Show"));
  const content = h("div", { class: filtered ? "post-content greyed" : "post-content" });
  const expansion = h("button", { class: "post-toggle chip zf", "aria-controls": `${id}-content`, on: { click: () => {
    view.actions.setExpanded(post.key, !view.state.expanded.has(post.key));
    syncContent();
  } } });
  content.id = `${id}-content`;
  let rendered = false;
  const syncContent = () => {
    const expanded = view.state.expanded.has(post.key);
    content.hidden = !expanded;
    expansion.textContent = expanded ? "Collapse post" : "Expand post";
    expansion.title = expansion.textContent;
    expansion.setAttribute("aria-expanded", String(expanded));
    if (expanded && !rendered) {
      const footer = [feedbackBox(post, view)].filter((part) => part !== null);
      replaceContent(content, [versions(post, view), postAssessment(post, view), footer.length > 0 ? h("footer", { class: "zf-footer zf" }, footer) : null]);
      rendered = true;
    }
  };
  syncContent();
  const selection = view.state.selecting ? h("label", { class: "post-selection zf" },
    h("input", { type: "checkbox", checked: view.state.selected.has(post.key), on: { change: (event) => {
      view.actions.selectPost(post.key, event.target.checked);
      view.syncSelection();
    } } }), `Select ${view.letterOf.get(view.threadOf.get(post.key).id)}#${post.number}`) : null;
  const classes = ["post", filtered ? "filtered" : null, view.state.settings.highlightNew && view.news.posts.has(post.key) ? "is-new" : null, view.state.flash === post.key ? "flash" : null];
  const personal = view.state.account?.personal;
  const saved = personal?.reading[post.key] ?? { bookmarked: false, read: false };
  if (saved.read) classes.push("read-post");
  const tool = (label, text, action, active = null) => h("button", { class: "chip post-tool", title: label, "aria-label": label, "aria-pressed": active === null ? null : String(active), on: { click: action } }, text, h("span", { class: "hover-tip" }, label));
  const personalControls = [
    tool(personal ? (saved.read ? "Mark unread" : "Mark read") : "Mark read · sign-in required", saved.read ? "Mark unread" : "Mark read", () => personal ? view.actions.setReading(post.key, { read: !saved.read }) : view.actions.openAccount("save your read/unread choices"), saved.read),
    tool(personal ? (saved.bookmarked ? "Remove bookmark" : "Save post") : "Save post · sign-in required", h("span", { class: `bookmark-icon${saved.bookmarked ? " filled" : ""}`, "aria-hidden": "true" }), () => personal ? view.actions.setReading(post.key, { bookmarked: !saved.bookmarked }) : view.actions.openAccount("save posts"), saved.bookmarked),
    tool("Listen to this post", "🔊", () => view.actions.listenPost(post.key))];
  return h(
    "article",
    { class: classes.filter((name) => name !== null).join(" "), id },
    avatarSlot,
    h("div", { class: "post-main" },
      head,
      selection,
      ratingsRow(post, view), moodRow(post, view),
      h("p", { class: "post-brief" }, view.transform(post.analysis.summary)),
      h("div", { class: "post-disclosure" }, expansion, personalControls),
      highlightedNotes(post, view),
      content),
  );
}
