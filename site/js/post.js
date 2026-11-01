// One post on the topic page, drawn like a Discourse post (D-48), with zforum's additions:
// the account-age badge (D-46), marks, the restatement and original as tabs (D-49),
// mind-change ratings (SPEC §6) and restatement feedback (SPEC §7). Each interactive part
// updates itself in place, so a click never redraws the page and keyboard focus stays put
// (D-51).

import { h, replaceContent, renderBlocks } from "./dom.js";
import { accountAgeLabel, formatAverage, greyReasons, noAnswers, pseudonym, ratingSummary, shortDate } from "./logic.js";
import { parseBlocks } from "./markdown.js";
import { FEEDBACK, FEEDBACK_MAX, FEEDBACK_MIN, RATINGS, TRAITS, maturityBand } from "./vocab.js";
import { wordDiff } from "./diff.js";
import { postRoute } from "./selection.js";

export const postElementId = (key) => `post-${key.replace("/", "-")}`;

const traitLabel = (id) => TRAITS.find((trait) => trait.id === id).label;

// Letter-avatar colours, as on the forum. style.css defines .avatar-c0 to .avatar-c7.
const AVATAR_COLOURS = 8;
function avatarColour(username) {
  let hash = 0;
  for (const character of username) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash % AVATAR_COLOURS;
}

const isMasked = (post, view) => view.state.settings.anonymous && !view.state.revealed.has(post.key);

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
      ? h("button", { class: "linkish small reveal zf", on: { click: reveal } }, "Who wrote this?")
      : h("span", { class: `age-badge zf${post.account.created_at === null ? " age-unknown" : ""}` }, accountAgeLabel(post.account, view.snapshotAt)),
    h("span", { class: "post-meta" }, h("a", { href: postRoute(view.state.data.topic.id, post.key), title: "Link to this post" }, `#${post.number}`), reply, ` · ${shortDate(post.created_at)}`, view.news.posts.has(post.key) ? h("span", { class: "badge-new zf" }, "New") : null),
  );
}

function marks(post, view) {
  return h(
    "div",
    { class: "marks zf" },
    h("span", { class: `maturity band-${maturityBand(post.maturity)}`, title: post.maturity_reason }, `Maturity ${post.maturity}/10`),
    post.traits.map((mark) => h("span", { class: "trait", title: mark.reason }, traitLabel(mark.trait))),
    h("details", { class: "why-marks", open: view.state.open.marks.has(post.key), on: { toggle: (event) => view.actions.setOpen("marks", post.key, event.target.open) } },
      h("summary", {}, "Why?"),
      h("ul", {},
        h("li", {}, h("strong", {}, `Maturity ${post.maturity}: `), post.maturity_reason),
        post.traits.map((mark) => h("li", {}, h("strong", {}, `${traitLabel(mark.trait)}: `), mark.reason, " ", h("q", {}, view.transform(mark.quote)))))),
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
  { id: "clean", tab: "Calm restatement", label: "Calm restatement · written by AI · tone only, every claim kept" },
  { id: "original", tab: "Original", label: "Original · as posted on the forum" },
  { id: "diff", tab: "Diff", label: "Changes from original wording to AI restatement" },
];

function diffContent(post, view) {
  return [
    h("p", { class: "diff-legend zf small" }, h("del", {}, "Removed wording"), " · ", h("ins", {}, "Added wording"), ". Quoted replies are unchanged and shown separately below."),
    h("div", { class: "diff-text" }, wordDiff(post.own_text, post.clean).map((run) => {
      const text = view.transform(run.text);
      if (run.kind === "equal") return text;
      return h(run.kind === "delete" ? "del" : "ins", { title: run.kind === "delete" ? "Removed" : "Added" }, text);
    })),
    post.segments.filter((segment) => segment.kind === "quote").map((segment) => quoteBlock(segment, view)),
  ];
}

// Only the version on show is rendered; switching renders the other one.
function versions(post, view) {
  if (post.clean === null) {
    return h("div", { class: "version version-original solo" },
      h("p", { class: "version-label zf" }, "Original · already calm, so there is no restatement"),
      h("div", { class: "post-body" }, originalContent(post, view)));
  }
  const panel = h("div", { role: "tabpanel" });
  const tabs = VERSIONS.map((version) => h("button", { class: `version-tab version-tab-${version.id} zf`, role: "tab", on: { click: () => show(version.id) } }, version.tab));
  const show = (id) => {
    view.actions.setVersion(post.key, id);
    sync();
  };
  const sync = () => {
    // Posts open on the restatement until the reader picks a tab (or opens the post from a
    // citation, which picks the original).
    const chosen = view.state.versions.get(post.key) ?? "clean";
    const current = VERSIONS.find((version) => version.id === chosen);
    VERSIONS.forEach((version, index) => tabs[index].setAttribute("aria-selected", String(version === current)));
    panel.className = `version version-${current.id}`;
    replaceContent(panel, [
      h("p", { class: "version-label zf" }, current.label),
      h("div", { class: "post-body" }, current.id === "clean" ? renderBlocks(parseBlocks(post.clean), view.transform) : current.id === "diff" ? diffContent(post, view) : originalContent(post, view)),
    ]);
  };
  sync();
  return [h("div", { class: "version-tabs", role: "tablist", "aria-label": "Which text to show" }, tabs), panel];
}

function ratingsRow(post, view) {
  if (!view.state.settings.showRatings || view.state.ratings.status !== "ready") return null;
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

const SLIDER_REST = Math.round((FEEDBACK_MIN + FEEDBACK_MAX) / 2);

// An unrated slider rests in the middle, faded. Moving it, or clicking it where it rests,
// records an answer; "clear" removes it.
function feedbackSlider(post, item, view) {
  const answers = () => view.state.feedback.mine[post.key] ?? noAnswers();
  const value = h("span", { class: "feedback-value" });
  const clear = h("button", { class: "linkish small", on: { click: () => commit(null) } }, "clear");
  const input = h("input", { type: "range", min: FEEDBACK_MIN, max: FEEDBACK_MAX, step: 1, "aria-label": `${item.label}: ${item.question}`, on: {
    input: (event) => {
      value.textContent = `${event.target.value}/${FEEDBACK_MAX}`;
    },
    change: (event) => commit(Number(event.target.value)),
    click: (event) => commit(Number(event.target.value)),
  } });
  const commit = (score) => {
    if (answers()[item.id] === score) return;
    view.actions.giveFeedback(post.key, { ...answers(), [item.id]: score });
    sync();
  };
  const sync = () => {
    const score = answers()[item.id];
    input.value = String(score ?? SLIDER_REST);
    input.classList.toggle("unrated", score === null);
    value.textContent = score === null ? "not rated" : `${score}/${FEEDBACK_MAX}`;
    clear.hidden = score === null;
  };
  sync();
  return h("div", { class: "feedback-item" },
    h("p", { class: "feedback-q" }, h("strong", {}, `${item.label}: `), item.question),
    h("div", { class: "feedback-scale" }, h("span", { class: "muted small" }, item.low), input, h("span", { class: "muted small" }, item.high), value, clear));
}

function feedbackBox(post, view) {
  if (post.clean === null || view.state.feedback.status !== "ready") return null;
  return h("div", { class: "feedback" },
    h("p", { class: "feedback-title" }, "Feedback on this restatement", h("span", { class: "muted small" }, " · only the zforum team sees your answers")),
    FEEDBACK.map((item) => feedbackSlider(post, item, view)));
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
  const reasons = greyReasons(post, view.state.settings, view.snapshotAt);
  const filtered = reasons.length > 0;
  const content = h("div", { class: filtered ? "post-content greyed" : "post-content" });
  const expansion = filtered ? h("button", { class: "filter-toggle chip zf", on: { click: () => {
    view.actions.setExpanded(post.key, !view.state.expanded.has(post.key));
    syncContent();
  } } }) : null;
  let rendered = false;
  const syncContent = () => {
    const expanded = !filtered || view.state.expanded.has(post.key);
    content.hidden = !expanded;
    if (expansion !== null) {
      expansion.textContent = expanded ? "Collapse post" : "Expand post";
      expansion.setAttribute("aria-expanded", String(expanded));
    }
    if (expanded && !rendered) {
      const footer = [ratingsRow(post, view), feedbackBox(post, view)].filter((part) => part !== null);
      replaceContent(content, [marks(post, view), versions(post, view), footer.length > 0 ? h("footer", { class: "zf-footer zf" }, footer) : null]);
      rendered = true;
    }
  };
  syncContent();
  const selection = view.state.selecting ? h("label", { class: "post-selection zf" },
    h("input", { type: "checkbox", checked: view.state.selected.has(post.key), on: { change: (event) => {
      view.actions.selectPost(post.key, event.target.checked);
      view.syncSelection();
    } } }), `Select ${view.letterOf.get(view.threadOf.get(post.key).id)}#${post.number}`) : null;
  const classes = ["post", filtered ? "filtered" : null, view.news.posts.has(post.key) ? "is-new" : null, view.state.flash === post.key ? "flash" : null];
  return h(
    "article",
    { class: classes.filter((name) => name !== null).join(" "), id },
    avatarSlot,
    h("div", { class: "post-main" },
      head,
      selection,
      filtered ? h("div", { class: "filtered-note zf" }, h("p", { class: "greyed-note" }, `Filtered for you: ${reasons.join(" · ")}. Greyed when expanded.`), expansion) : null,
      content),
  );
}
