// The acceptance gate for model outputs (SPEC §8). Returns every problem found, each naming
// where it is, so a subagent can fix its output in one pass. The build treats any problem
// as fatal.

import { INTEREST_IDS, MATURITY_MAX, MATURITY_MIN, TRAIT_IDS } from "../../site/js/vocab.js";
import { postKey } from "./jobs.mjs";
import { ISSUE_DETAIL_IDS, ISSUE_KEYS } from "../../site/js/summary-fields.js";

export const REASON_MAX = 200;
export const QUOTE_MAX = 300;

// Quotes are compared after collapsing each run of whitespace to one space, because a
// quoted span that crosses a line break is still the author's words. Nothing else is
// normalised.
export const collapseWhitespace = (text) => text.replace(/\s+/g, " ").trim();

const URL_PATTERN = /https?:\/\/[^\s)\]>"']+/g;
// Numbers of two or more characters (so "2026", "8.5", "1,000" but not list markers like
// "1"), read greedily so "1,000,000" is one token.
const NUMBER_PATTERN = /\d[\d,.]*\d/g;

export function preservedTokens(text) {
  return { urls: [...new Set(text.match(URL_PATTERN) ?? [])], numbers: [...new Set(text.match(NUMBER_PATTERN) ?? [])] };
}

// A restatement may not grow much past the original: it removes tone, it never adds.
export const cleanLengthLimit = (original) => Math.ceil(original.length * 1.3) + 200;

function checker() {
  const problems = [];
  const report = (where, message) => problems.push(`${where}: ${message}`);
  const exactKeys = (value, keys, where) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      report(where, `expected an object, got ${JSON.stringify(value)?.slice(0, 60)}`);
      return false;
    }
    const actual = Object.keys(value);
    const missing = keys.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !keys.includes(key));
    if (missing.length > 0) report(where, `missing key(s) ${missing.join(", ")}`);
    if (extra.length > 0) report(where, `unexpected key(s) ${extra.join(", ")}`);
    return missing.length === 0;
  };
  const text = (value, max, where) => {
    if (typeof value !== "string" || value.trim() === "") report(where, "must be a non-empty string");
    else if (value.length > max) report(where, `is ${value.length} characters; at most ${max}`);
  };
  const list = (value, min, max, where) => {
    if (!Array.isArray(value)) {
      report(where, "must be an array");
      return [];
    }
    if (value.length < min || value.length > max) report(where, `has ${value.length} entries; expected ${min} to ${max}`);
    return value;
  };
  return { problems, report, exactKeys, text, list };
}

export function validateMarks(output, job, thread) {
  const { problems, report, exactKeys, text, list } = checker();
  if (!exactKeys(output, ["task", "topic_id", "posts"], "output")) return problems;
  if (output.task !== "marks") report("output.task", `must be "marks"`);
  if (output.topic_id !== job.topic_id) report("output.topic_id", `must be ${job.topic_id}`);
  const entries = list(output.posts, job.expected.length, job.expected.length, "output.posts");
  const numbers = entries.map((entry) => entry?.post_number);
  if (JSON.stringify(numbers) !== JSON.stringify(job.expected)) report("output.posts", `must cover exactly posts ${job.expected.join(", ")} in that order; got ${numbers.join(", ")}`);
  const byNumber = new Map(thread.posts.map((post) => [post.number, post]));
  entries.forEach((entry, index) => {
    const where = `posts[${index}] (#${entry?.post_number})`;
    if (!exactKeys(entry, ["post_number", "maturity", "maturity_reason", "clean", "traits"], where)) return;
    const post = byNumber.get(entry.post_number);
    if (post === undefined || post.hidden) return;
    if (!Number.isInteger(entry.maturity) || entry.maturity < MATURITY_MIN || entry.maturity > MATURITY_MAX) report(`${where}.maturity`, `must be an integer ${MATURITY_MIN}–${MATURITY_MAX}`);
    text(entry.maturity_reason, REASON_MAX, `${where}.maturity_reason`);
    if (entry.clean !== null) {
      text(entry.clean, cleanLengthLimit(post.own_text), `${where}.clean`);
      if (typeof entry.clean === "string") {
        const { urls, numbers: figures } = preservedTokens(post.own_text);
        for (const url of urls) if (!entry.clean.includes(url)) report(`${where}.clean`, `drops the link ${url}`);
        for (const figure of figures) if (!entry.clean.includes(figure)) report(`${where}.clean`, `drops the number ${figure}`);
      }
    }
    const seen = new Set();
    list(entry.traits, 0, TRAIT_IDS.length, `${where}.traits`).forEach((mark, markIndex) => {
      const markWhere = `${where}.traits[${markIndex}]`;
      if (!exactKeys(mark, ["trait", "reason", "quote"], markWhere)) return;
      if (!TRAIT_IDS.includes(mark.trait)) report(`${markWhere}.trait`, `unknown trait ${JSON.stringify(mark.trait)}; use one of ${TRAIT_IDS.join(", ")}`);
      if (seen.has(mark.trait)) report(`${markWhere}.trait`, `${mark.trait} appears twice on this post`);
      seen.add(mark.trait);
      text(mark.reason, REASON_MAX, `${markWhere}.reason`);
      text(mark.quote, QUOTE_MAX, `${markWhere}.quote`);
      if (typeof mark.quote === "string" && !collapseWhitespace(post.own_text).includes(collapseWhitespace(mark.quote))) report(`${markWhere}.quote`, `is not verbatim in the author's own words: ${JSON.stringify(mark.quote.slice(0, 80))}`);
    });
  });
  return problems;
}

const POINT_ID = /^p[1-9][0-9]*$/;

export function validateSummary(output, job, threads) {
  const { problems, report, exactKeys, text, list } = checker();
  if (!exactKeys(output, ["task", "topic", "card", "headline", "overview", "points", "issues"], "output")) return problems;
  if (output.task !== "summary") report("output.task", `must be "summary"`);
  if (output.topic !== job.topic) report("output.topic", `must be ${JSON.stringify(job.topic)}`);
  const citable = new Set(job.citable);
  const createdAt = new Map(threads.flatMap((thread) => thread.posts.map((post) => [postKey(thread.id, post.number), post.created_at])));
  const cites = (value, where) => {
    const keys = list(value, 1, 6, where);
    if (new Set(keys).size !== keys.length) report(where, "cites a post twice");
    for (const key of keys) if (!citable.has(key)) report(where, `${JSON.stringify(key)} is not a visible post in this topic (use "topicId/postNumber")`);
    return keys;
  };
  if (exactKeys(output.card, ["title", "byline", "keywords", "interests"], "card")) {
    text(output.card.title, 60, "card.title");
    text(output.card.byline, 200, "card.byline");
    list(output.card.keywords, 2, 6, "card.keywords").forEach((keyword, index) => text(keyword, 30, `card.keywords[${index}]`));
    const interests = list(output.card.interests, 1, INTEREST_IDS.length, "card.interests");
    for (const interest of interests) if (!INTEREST_IDS.includes(interest)) report("card.interests", `unknown interest ${JSON.stringify(interest)}; use ${INTEREST_IDS.join(", ")}`);
    if (new Set(interests).size !== interests.length) report("card.interests", "repeats an interest");
  }
  text(output.headline, 100, "headline");
  list(output.overview, 2, 3, "overview").forEach((sentence, index) => {
    if (!exactKeys(sentence, ["text", "cites"], `overview[${index}]`)) return;
    text(sentence.text, 400, `overview[${index}].text`);
    cites(sentence.cites, `overview[${index}].cites`);
  });
  const pointIds = new Set();
  list(output.points, 4, 20, "points").forEach((point, index) => {
    const where = `points[${index}]`;
    if (!exactKeys(point, ["id", "text", "cites"], where)) return;
    if (typeof point.id !== "string" || !POINT_ID.test(point.id)) report(`${where}.id`, `must look like "p1"`);
    if (pointIds.has(point.id)) report(`${where}.id`, `${point.id} is used twice`);
    pointIds.add(point.id);
    text(point.text, 300, `${where}.text`);
    const keys = cites(point.cites, `${where}.cites`);
    const dates = keys.map((key) => createdAt.get(key)).filter((date) => date !== undefined);
    if (dates.length === keys.length && dates.length > 0 && dates.some((date) => date < dates[0])) report(`${where}.cites`, "the first cite must be the earliest post making the point");
  });
  const issues = list(output.issues, 5, 6, "issues");
  const issueIds = new Set(issues.map((issue) => issue?.id));
  const seenIssues = new Set();
  const covered = new Set();
  const statement = (value, where, max = 400) => {
    if (!exactKeys(value, ["text", "cites"], where)) return;
    text(value.text, max, `${where}.text`);
    cites(value.cites, `${where}.cites`);
  };
  issues.forEach((issue, index) => {
    const where = `issues[${index}]`;
    if (!exactKeys(issue, ISSUE_KEYS, where)) return;
    if (typeof issue.id !== "string" || !/^q[1-9][0-9]*$/.test(issue.id)) report(`${where}.id`, 'must look like "q1"');
    if (seenIssues.has(issue.id)) report(`${where}.id`, `${issue.id} is used twice`);
    seenIssues.add(issue.id);
    text(issue.issue, 100, `${where}.issue`);
    statement(issue.description, `${where}.description`, 220);
    statement(issue.decision_at_stake, `${where}.decision_at_stake`);
    list(issue.positions_with_post_references, 2, 5, `${where}.positions_with_post_references`).forEach((position, positionIndex) => {
      const at = `${where}.positions_with_post_references[${positionIndex}]`;
      if (!exactKeys(position, ["label", "text", "cites"], at)) return;
      text(position.label, 60, `${at}.label`);
      text(position.text, 400, `${at}.text`);
      cites(position.cites, `${at}.cites`);
    });
    statement(issue.unresolved_status, `${where}.unresolved_status`);
    for (const field of ISSUE_DETAIL_IDS) {
      list(issue[field], 0, 6, `${where}.${field}`).forEach((item, itemIndex) => statement(item, `${where}.${field}[${itemIndex}]`, 600));
    }
    for (const id of list(issue.points, 1, 20, `${where}.points`)) {
      if (!pointIds.has(id)) report(`${where}.points`, `unknown point ${JSON.stringify(id)}`);
      if (covered.has(id)) report(`${where}.points`, `${id} already has a home; use related_issues to cross-reference it`);
      covered.add(id);
    }
    const related = list(issue.related_issues, 0, issues.length - 1, `${where}.related_issues`);
    if (new Set(related).size !== related.length) report(`${where}.related_issues`, "repeats an issue");
    for (const id of related) {
      if (!issueIds.has(id)) report(`${where}.related_issues`, `unknown issue ${JSON.stringify(id)}`);
      if (id === issue.id) report(`${where}.related_issues`, "cannot refer to itself");
    }
  });
  for (const id of pointIds) if (!covered.has(id)) report("issues", `point ${id} has no home`);
  return problems;
}
