import { provenanceLine, textWithCites, threadPostLink, toneBadge } from "../components.js";
import { h } from "../dom.js";
import { excerpt } from "../lens.js";

function threadTitle(index, topicId) {
  const entry = index.threads.find((thread) => thread.id === topicId);
  if (entry === undefined) throw new Error(`digest names topic ${topicId}, which is not in the index`);
  return entry.title;
}

function digestSection(index) {
  const digest = index.digest;
  if (digest === null) return null;
  const output = digest.output;
  return h(
    "section",
    { class: "card digest" },
    h("p", { class: "eyebrow" }, "This period on the forum"),
    h("h2", {}, output.headline),
    h("div", { class: "themes" }, output.themes.map((theme) => h(
      "article",
      { class: "theme" },
      h("h3", {}, theme.title),
      h("p", {}, theme.summary),
      h("p", { class: "theme-topics" }, theme.topic_ids.map((topicId) => h("a", { class: "pill", href: `#/t/${topicId}` }, excerpt(threadTitle(index, topicId), 48)))),
    ))),
    output.worth_reading.length > 0 ? h(
      "div",
      { class: "worth-reading" },
      h("h3", {}, "Worth your time"),
      h("ul", {}, output.worth_reading.map((pick) => h("li", {}, threadPostLink(pick.topic_id, pick.post_number, excerpt(threadTitle(index, pick.topic_id), 48)), " — ", pick.why))),
    ) : null,
    output.quiet_but_notable.length > 0 ? h(
      "div",
      { class: "quiet" },
      h("h3", {}, "Quiet but notable"),
      h("ul", {}, output.quiet_but_notable.map((pick) => h("li", {}, h("a", { href: `#/t/${pick.topic_id}` }, threadTitle(index, pick.topic_id)), " — ", pick.why))),
    ) : null,
    provenanceLine(digest.provenance),
  );
}

const FEED_SHOWN = 8;

function mindChangeItem(change) {
  return h(
    "li",
    {},
    h("q", {}, excerpt(change.span, 160)),
    h("span", { class: "muted" }, " — ", change.author, ", "),
    threadPostLink(change.thread.id, change.post, excerpt(change.thread.title, 44)),
    h("div", { class: "note" }, textWithCites(change.note, change.thread.id)),
  );
}

function mindChangeFeed(index) {
  const changes = index.threads.flatMap((thread) => thread.mind_changes.map((change) => ({ ...change, thread })));
  if (changes.length === 0) return null;
  const rest = changes.slice(FEED_SHOWN);
  return h(
    "section",
    { class: "card mind-feed" },
    h("p", { class: "eyebrow" }, `People changed their minds here · ${changes.length} this period`),
    h("p", { class: "muted" }, "The rarest event in an online argument. Each one is a concession in the author's own words."),
    h("ul", {}, changes.slice(0, FEED_SHOWN).map(mindChangeItem)),
    rest.length > 0 ? h("details", {}, h("summary", {}, `${rest.length} more`), h("ul", {}, rest.map(mindChangeItem))) : null,
  );
}

function analyzedCard(thread) {
  return h(
    "article",
    { class: "thread-card" },
    h("div", { class: "thread-card-head" }, h("a", { class: "thread-title", href: `#/t/${thread.id}` }, thread.title), toneBadge(thread.temperature)),
    h("p", { class: "meta" }, `${thread.category} · ${thread.posts} posts · ${thread.participants} participants · ${thread.claims} distinct claims`, thread.mind_changes.length > 0 ? ` · ${thread.mind_changes.length} mind change${thread.mind_changes.length === 1 ? "" : "s"}` : ""),
    h("p", {}, thread.tldr),
    h("p", { class: "actions" }, h("a", { class: "button", href: `#/t/${thread.id}/digest` }, "Claim digest"), " ", h("a", { class: "button ghost", href: `#/t/${thread.id}/calm` }, "Calm read"), " ", thread.has_quiz ? h("a", { class: "button ghost", href: `#/t/${thread.id}/quiz` }, "Quiz yourself") : null),
  );
}

export function renderHome(index) {
  const analyzed = index.threads.filter((thread) => thread.analyzed);
  const others = index.threads.filter((thread) => !thread.analyzed);
  return h(
    "div",
    { class: "home" },
    h("section", { class: "intro" }, h("h1", {}, "zforum"), h("p", { class: "lede" }, "A calm reading lens for the Zcash Community Forum: same posts, same people, calmer surface."), h("p", { class: "muted" }, `${index.snapshot.period} · ${index.threads.length} threads crawled · ${analyzed.length} analyzed in depth`)),
    digestSection(index),
    mindChangeFeed(index),
    h("section", {}, h("h2", {}, "Analyzed threads"), h("div", { class: "thread-grid" }, analyzed.map(analyzedCard))),
    h(
      "section",
      {},
      h("h2", {}, "Everything else active this period"),
      h("p", { class: "muted" }, "These threads have the signals that need no model (consecutive runs, unsourced numbers, contentless replies) and the Calm and Raw lenses. Claim digests, summaries and quizzes need the analysis step."),
      h("table", { class: "thread-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Thread"), h("th", {}, "Category"), h("th", {}, "Posts"), h("th", {}, "Last post"))),
        h("tbody", {}, others.map((thread) => h("tr", {}, h("td", {}, h("a", { href: `#/t/${thread.id}/calm` }, thread.title), thread.scope === "tail" ? h("span", { class: "muted" }, " (recent posts only)") : null), h("td", {}, thread.category), h("td", { class: "num" }, String(thread.posts)), h("td", { class: "num" }, thread.last_post_at.slice(0, 10)))))),
    ),
  );
}
