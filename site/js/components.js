// Building blocks shared by the views.

import { h, link, renderBlocks } from "./dom.js";
import { excerpt } from "./lens.js";
import { parseBlocks } from "./markdown.js";

export const FORUM = "https://forum.zcashcommunity.com";

export function postAnchor(topicId, number, lens = "calm") {
  return `#/t/${topicId}/${lens}/${number}`;
}

export function cite(topicId, number, label = `#${number}`) {
  return h("a", { class: "cite", href: postAnchor(topicId, number) }, label);
}

// A link to a post that names its thread, for lists that span threads.
export function threadPostLink(topicId, number, title) {
  return h("a", { class: "thread-post-link", href: postAnchor(topicId, number) }, title, h("span", { class: "cite" }, `#${number}`));
}

export function mentionedPosts(text) {
  return new Set([...text.matchAll(/#(\d+)/g)].map((match) => Number(match[1])));
}

// Model-written text that refers to posts as "#126" gets those references as links.
export function textWithCites(text, topicId) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(/#(\d+)/g)) {
    nodes.push(text.slice(last, match.index));
    nodes.push(cite(topicId, Number(match[1]), match[0]));
    last = match.index + match[0].length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

export function citeList(topicId, numbers) {
  return numbers.flatMap((number, index) => [index > 0 ? " " : null, cite(topicId, number)]);
}

export function chip(signal, extraClass = "") {
  const label = signal.span ? [signal.name, " — ", h("q", {}, excerpt(signal.span, 70))] : [signal.name];
  return h("span", { class: `chip chip-${signal.polarity ?? "caution"} ${extraClass}`.trim(), title: signal.detail ?? "" }, label);
}

export function toneBadge(tone) {
  return h("span", { class: `tone tone-${tone}`, title: `original tone: ${tone}` }, tone);
}

export function statusBadge(status) {
  return h("span", { class: `status status-${status}` }, status);
}

export function markdownBlock(markdown) {
  return renderBlocks(parseBlocks(markdown));
}

export function segmentsView(post, topicId) {
  return post.segments.map((segment) => {
    if (segment.kind === "text") return h("div", { class: "segment" }, markdownBlock(segment.markdown));
    let source = null;
    if (segment.post !== null && segment.topic === topicId) source = cite(topicId, segment.post, `#${segment.post}`);
    else if (segment.post !== null && segment.topic !== null) source = link(`${FORUM}/t/${segment.topic}/${segment.post}`, `t/${segment.topic} #${segment.post}`);
    return h("blockquote", { class: "forum-quote" }, h("div", { class: "quote-source" }, segment.author ? `${segment.author}` : "quote", source ? [" in ", source] : null), markdownBlock(segment.markdown));
  });
}

export function authorLine(post, topicId, extras = []) {
  const affiliation = [post.author_title, post.author_group].filter((value) => value !== null);
  return h(
    "div",
    { class: "post-head" },
    h("a", { class: "post-number", href: postAnchor(topicId, post.number, "raw") }, `#${post.number}`),
    h("span", { class: "author" }, post.author),
    affiliation.length > 0 ? h("span", { class: "chip chip-disclosure", title: "D1 stated affiliation: as the forum records it" }, affiliation.join(" · ")) : null,
    h("span", { class: "time" }, post.created_at.slice(0, 16).replace("T", " ")),
    post.reply_to !== null ? h("span", { class: "reply-to" }, "↩ ", cite(topicId, post.reply_to)) : null,
    extras,
  );
}

export function provenanceLine(provenance) {
  return h(
    "p",
    { class: "provenance" },
    `${provenance.task} by ${provenance.model} (${provenance.backend}) on ${provenance.produced_at.slice(0, 10)} · prompt `,
    h("a", { href: "#/about/prompts" }, provenance.prompt_sha256.slice(0, 12)),
    ` · input ${provenance.input_sha256.slice(0, 12)}`,
  );
}

export function percent(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

export function forumTopicUrl(topic) {
  return `${FORUM}/t/${topic.slug}/${topic.id}`;
}
