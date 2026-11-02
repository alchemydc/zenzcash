// The home board (SPEC §2): one card per hot topic, filtered by the reader's interests.

import { h } from "./dom.js";
import { topicStats, topicCountLabel } from "./logic.js";
import { INTERESTS } from "./vocab.js";

function statLines(stats) {
  return [
    h("p", { class: "card-stats" }, topicCountLabel(stats)),
    h("p", { class: "card-stats muted" },
      stats.medianYears === null ? "account ages unknown" : `median ${stats.medianYears.toFixed(1)} years on the forum`,
      ` · ${stats.joinedRecently} joined in the last 90 days`,
      stats.unknownAge > 0 ? ` · ${stats.unknownAge} hide their profile` : null),
  ];
}

const interestTags = (ids) => ids.map((id) => h("span", { class: "tag" }, INTERESTS.find((interest) => interest.id === id).label));

function realCard(data) {
  const { card } = data.topic;
  return h(
    "a",
    { class: "card topic-card", href: `#/topic/${data.topic.id}` },
    h("p", { class: "tags" }, interestTags(card.interests)),
    h("h2", {}, card.title),
    h("p", { class: "byline" }, card.byline),
    h("p", { class: "keywords" }, card.keywords.map((keyword) => h("span", { class: "keyword" }, keyword))),
    statLines(topicStats(data.topic, data.snapshot_at)),
    h("p", { class: "open-hint" }, "Open topic →"),
  );
}

export function renderTopics(catalog, settings, actions) {
  const wanted = settings.interests;
  const shows = (interests) => wanted.length === 0 || interests.some((id) => wanted.includes(id));
  const cards = catalog.topics.filter((data) => shows(data.topic.card.interests)).map(realCard);
  const toggle = (id) => actions.setSettings({ interests: wanted.includes(id) ? wanted.filter((other) => other !== id) : [...wanted, id] });
  return h(
    "div",
    { class: "home" },
    h("section", { class: "hero" },
      h("h1", {}, "What's happening on the Zcash forum"),
      h("p", { class: "lede" }, "Choose a topic for a short summary, original posts, and optional neutral re-writes.")),
    h("div", { class: "filters", role: "group", "aria-label": "Show topics about" },
      h("span", { class: "filters-label" }, "I'm interested in:"),
      h("button", { class: "chip", "aria-pressed": wanted.length === 0 ? "true" : "false", on: { click: () => actions.setSettings({ interests: [] }) } }, "Everything"),
      INTERESTS.map((interest) => h("button", { class: "chip", "aria-pressed": wanted.includes(interest.id) ? "true" : "false", on: { click: () => toggle(interest.id) } }, interest.label))),
    h("p", { class: "muted small board-note" }, "Selected forum discussions. Each topic includes its full imported thread history."),
    catalog.unavailable.length ? h("p", { class: "notice" }, `${catalog.unavailable.length} topic(s) temporarily unavailable while forum visibility changes are reviewed.`) : null,
    cards.length > 0 ? h("div", { class: "board" }, cards) : h("p", { class: "muted" }, "No topics match these interests."),
  );
}
