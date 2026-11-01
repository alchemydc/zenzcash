// The home board (SPEC §2): one card per hot topic, filtered by the reader's interests.

import { h } from "./dom.js";
import { topicStats } from "./logic.js";
import { PLACEHOLDER_TOPICS } from "./placeholders.js";
import { INTERESTS } from "./vocab.js";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const people = (count) => (count === 1 ? "1 person" : `${count} people`);

function statLines(stats) {
  return [
    h("p", { class: "card-stats" }, `${plural(stats.posts, "post")} · ${plural(stats.threads, "thread")} · ${people(stats.participants)}`),
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

function placeholderCard(topic) {
  return h(
    "div",
    { class: "card topic-card placeholder", "aria-label": "Placeholder topic" },
    h("p", { class: "tags" }, h("span", { class: "tag placeholder-tag" }, "Placeholder"), interestTags(topic.interests)),
    h("h2", {}, topic.title),
    h("p", { class: "byline" }, topic.byline),
    h("p", { class: "keywords" }, topic.keywords.map((keyword) => h("span", { class: "keyword" }, keyword))),
    statLines({ ...topic, unknownAge: 0 }),
  );
}

export function renderHome(data, settings, actions) {
  const wanted = settings.interests;
  const shows = (interests) => wanted.length === 0 || interests.some((id) => wanted.includes(id));
  const cards = [
    shows(data.topic.card.interests) ? realCard(data) : null,
    ...PLACEHOLDER_TOPICS.filter((topic) => shows(topic.interests)).map(placeholderCard),
  ].filter((card) => card !== null);
  const toggle = (id) => actions.setSettings({ interests: wanted.includes(id) ? wanted.filter((other) => other !== id) : [...wanted, id] });
  return h(
    "div",
    { class: "home" },
    h("section", { class: "hero" },
      h("h1", {}, "What's being argued on the Zcash forum"),
      h("p", { class: "lede" }, "Pick a topic to see what people are arguing, why, and the whole discussion in a calmer voice.")),
    h("div", { class: "filters", role: "group", "aria-label": "Show topics about" },
      h("span", { class: "filters-label" }, "I'm interested in:"),
      h("button", { class: "chip", "aria-pressed": wanted.length === 0 ? "true" : "false", on: { click: () => actions.setSettings({ interests: [] }) } }, "Everything"),
      INTERESTS.map((interest) => h("button", { class: "chip", "aria-pressed": wanted.includes(interest.id) ? "true" : "false", on: { click: () => toggle(interest.id) } }, interest.label))),
    h("p", { class: "muted small board-note" }, "Most active topics, suggested from activity. Only the ZCG topic is real in this prototype."),
    cards.length > 0 ? h("div", { class: "board" }, cards) : h("p", { class: "muted" }, "No topics match these interests."),
  );
}
