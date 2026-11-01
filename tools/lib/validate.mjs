// Boundary validation for the single contention-summary schema.
import { INTEREST_IDS } from "../../site/js/vocab.js";
import { ISSUE_DETAIL_IDS, ISSUE_KEYS } from "../../site/js/summary-fields.js";
import { postKey } from "./jobs.mjs";
import { checker } from "./checker.mjs";

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
  list(output.overview, job.adaptive ? 1 : 2, 3, "overview").forEach((sentence, index) => {
    if (!exactKeys(sentence, ["text", "cites"], `overview[${index}]`)) return;
    text(sentence.text, 400, `overview[${index}].text`);
    cites(sentence.cites, `overview[${index}].cites`);
  });
  const pointIds = new Set();
  list(output.points, job.adaptive ? 1 : 4, 20, "points").forEach((point, index) => {
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
  const issues = list(output.issues, job.adaptive ? 1 : 5, 6, "issues");
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
    list(issue.positions_with_post_references, job.adaptive ? 1 : 2, 5, `${where}.positions_with_post_references`).forEach((position, positionIndex) => {
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
