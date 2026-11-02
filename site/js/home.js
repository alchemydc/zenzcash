// The home board (SPEC §2): one card per hot topic, filtered by the reader's interests.

import { h } from "./dom.js";
import { topicStats, topicCountLabel, shortDate } from "./logic.js";
import { INTERESTS } from "./vocab.js";
import { directoryInterests, topicDirectory } from "./topic-directory.js";

function statLines(stats) {
  return [
    h("p", { class: "card-stats" }, topicCountLabel(stats)),
    h("p", { class: "card-stats muted" }, `Latest post: ${shortDate(stats.lastPostAt)}`),
    h("p", { class: "card-stats muted" },
      stats.medianYears === null ? "account ages unknown" : `median ${stats.medianYears.toFixed(1)} years on the forum`,
      ` · ${stats.joinedRecently} joined in the last 90 days`,
      stats.unknownAge > 0 ? ` · ${stats.unknownAge} hide their profile` : null),
  ];
}

const interestTags = (ids) => ids.map((id) => h("span", { class: "tag" }, INTERESTS.find((interest) => interest.id === id).label));

function realCard(data, curation) {
  const { card } = data.topic;
  return h(
    "a",
    { class: "card topic-card", id: `topic-card-${data.topic.id}`, href: `#/topic/${data.topic.id}` },
    h("p", { class: "tags" }, interestTags(directoryInterests(data, curation))),
    h("h2", {}, card.title),
    h("p", { class: "byline" }, card.byline),
    h("p", { class: "keywords" }, card.keywords.map((keyword) => h("span", { class: "keyword" }, keyword))),
    statLines(topicStats(data.topic, data.snapshot_at)),
    h("p", { class: "open-hint" }, "Open topic →"),
  );
}

export function renderTopics(catalog, settings, actions, curation, directory) {
  const wanted = settings.interests;
  const results = topicDirectory(catalog, curation, wanted, directory);
  const cards = (topics) => h("div", { class: "board" }, topics.map((data) => realCard(data, curation)));
  const toggle = (id) => actions.setSettings({ interests: wanted.includes(id) ? wanted.filter((other) => other !== id) : [...wanted, id] });
  return h(
    "div",
    { class: "home" },
    h("section", { class: "hero" },
      h("h1", {}, "What's happening on the Zcash forum"),
      h("p", { class: "lede" }, "Choose a topic for a short summary, original posts, and optional neutral re-writes.")),
    h("div", { class: "directory-controls" },
      h("label", {}, "Search topic titles", h("input", { id: "topic-search", type: "search", value: directory.query, "aria-label": "Search topic titles", on: { input: (event) => actions.setDirectory({ query: event.target.value }) } })),
      h("label", {}, "Sort topics", h("select", { id: "topic-sort", on: { change: (event) => actions.setDirectory({ sort: event.target.value }) } },
        [["recent", "Most recent post"], ["posts", "Most posts"]].map(([id, label]) => h("option", { value: id, selected: directory.sort === id }, label))))),
    h("div", { class: "filters", role: "group", "aria-label": "Show topics about" },
      h("span", { class: "filters-label" }, "I'm interested in:"),
      h("button", { class: "chip", "aria-pressed": wanted.length === 0 ? "true" : "false", on: { click: () => actions.setSettings({ interests: [] }) } }, "Everything"),
      INTERESTS.map((interest) => h("button", { class: "chip", "aria-pressed": wanted.includes(interest.id) ? "true" : "false", on: { click: () => toggle(interest.id) } }, interest.label))),
    h("p", { class: "muted small board-note" }, "Choose one or more interests to see topics with any of those primary subjects. Search matches card titles only."),
    catalog.unavailable.length ? h("p", { class: "notice" }, `${catalog.unavailable.length} topic(s) temporarily unavailable while forum visibility changes are reviewed.`) : null,
    h("p", { class: "directory-count small", "aria-live": "polite" }, `${results.count} topics match`),
    results.featured.length ? h("section", { class: "featured-topics" }, h("h2", {}, "Featured Topics"), h("p", { class: "small muted" }, "Selected by the site’s maintainers."), cards(results.featured)) : null,
    results.others.length ? h("section", {}, h("h2", {}, results.featured.length ? "More topics" : "Topics"), cards(results.others)) : null,
    results.count === 0 ? h("p", { class: "muted" }, "No topics match these interests and title keywords.") : null,
  );
}
