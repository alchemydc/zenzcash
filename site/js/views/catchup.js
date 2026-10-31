import { UNSURE, answeredCount, holderCount, relevantIssues, threadAlignment, widthClass } from "../alignment.js";
import { postAnchor, percent } from "../components.js";
import { h } from "../dom.js";
import { excerpt } from "../lens.js";

const SECONDS_PER_BRIEF = 40;
const STANCE_SECONDS = 30;
const TONE_ORDER = ["calm", "warm", "heated", "hostile"];
const STAKE_LABELS = {
  funding: "funding",
  protocol: "protocol",
  governance: "governance",
  "personal-funds": "someone's funds",
  community: "community",
  technical: "technical",
  other: "other",
};

function temperature(entry) {
  const level = TONE_ORDER.indexOf(entry.temperature);
  if (level === -1) throw new Error(`unknown temperature ${JSON.stringify(entry.temperature)} on t/${entry.id}`);
  return h(
    "div",
    { class: `thermo thermo-${entry.temperature}`, title: `${percent(entry.heat_share)} of posts read as heated or hostile` },
    h("span", { class: "thermo-dots", "aria-hidden": "true" }, TONE_ORDER.map((tone, index) => h("span", { class: `dot${index <= level ? " on" : ""}` }))),
    h("span", { class: "thermo-label" }, entry.temperature),
    h("span", { class: "thermo-share" }, `${percent(entry.heat_share)} heated`),
  );
}

function quoteLine(topicId, quote, prefix) {
  return h("p", { class: "quote-line" }, h("span", { class: "quote-prefix" }, prefix), h("q", {}, excerpt(quote.quote, 200)), " ", h("span", { class: "quote-by" }, "— ", quote.author, " "), h("a", { class: "cite", href: postAnchor(topicId, quote.post_number) }, `#${quote.post_number}`));
}

const STATUS_BADGES = { matches: "your view", opposes: "not your view", mixed: "partly yours" };

function viewRow(entry, view, total, status) {
  return h(
    "details",
    { class: `view-row status-${status}` },
    h(
      "summary",
      {},
      h("div", { class: "view-head" }, h("span", { class: "view-label" }, view.label), h("span", { class: "view-count" }, `${view.holders.length} ${view.holders.length === 1 ? "person" : "people"}`), STATUS_BADGES[status] ? h("span", { class: `view-badge badge-${status}` }, STATUS_BADGES[status]) : null),
      h("div", { class: "view-bar" }, h("span", { class: `bar-fill ${widthClass(view.holders.length, total)}` })),
      h("p", { class: "view-line" }, view.one_line),
    ),
    quoteLine(entry.id, view.best_for, "Strongest case: "),
    view.best_against !== null ? quoteLine(entry.id, view.best_against, "Strongest objection: ") : h("p", { class: "muted small" }, "Nobody argued against this view."),
  );
}

function alignmentBlock(entry, alignment, issuesAnswered) {
  if (!issuesAnswered) return null;
  if (!alignment.known) return h("p", { class: "align muted" }, "Your answers don't touch the views in this thread.");
  return h(
    "div",
    { class: "align" },
    alignment.matching.length > 0
      ? h("p", {}, h("strong", {}, `You're with ${alignment.withReader} of the ${alignment.sided} people who took a side here.`))
      : h("p", {}, h("strong", {}, "None of the main views here matches yours.")),
    alignment.against.length > 0 ? quoteLine(entry.id, alignment.against[0].quote, "Best point against your view: ") : null,
  );
}

function briefCard(entry, issues, answers) {
  const brief = entry.brief;
  const total = holderCount(brief);
  const alignment = threadAlignment(issues, answers, entry.id, brief);
  const answeredHere = relevantIssues(issues, entry.id).some((issue) => answers[issue.issue_id] !== undefined && answers[issue.issue_id] !== UNSURE);
  const reasons = [
    entry.importance.open_decision ? h("span", { class: "reason reason-decision" }, "decision pending") : null,
    h("span", { class: "reason" }, STAKE_LABELS[entry.importance.stake_kind]),
    h("span", { class: "reason" }, `${entry.activity.participants} people this month`),
  ];
  const extras = [
    brief.common_ground.length > 0 ? h("li", {}, h("span", { class: "extra-label" }, "Agreed: "), brief.common_ground[0].text) : null,
    brief.unresolved.length > 0 ? h("li", {}, h("span", { class: "extra-label" }, "Open: "), brief.unresolved[0].text) : null,
    brief.next !== null ? h("li", {}, h("span", { class: "extra-label" }, "Next: "), brief.next) : null,
  ].filter((item) => item !== null);
  return h(
    "article",
    { class: "brief", id: `brief-${entry.id}` },
    h("div", { class: "brief-top" }, h("div", { class: "reasons" }, reasons), temperature(entry)),
    h("h2", { class: "brief-headline" }, brief.headline),
    h("p", { class: "brief-why" }, brief.why_it_matters),
    entry.importance.decision !== null ? h("p", { class: "brief-decision" }, h("span", { class: "extra-label" }, "Deciding: "), entry.importance.decision) : null,
    h("div", { class: "views" }, brief.views.map((view, index) => viewRow(entry, view, total, alignment.statuses[index].status))),
    alignmentBlock(entry, alignment, answeredHere),
    extras.length > 0 ? h("ul", { class: "brief-extras" }, extras) : null,
    h(
      "p",
      { class: "brief-actions" },
      h("span", { class: "muted small" }, entry.title, " · "),
      h("a", { href: `#/t/${entry.id}/digest` }, "Go deeper"),
      entry.has_quiz ? [" · ", h("a", { href: `#/t/${entry.id}/quiz` }, "Quiz yourself")] : null,
    ),
  );
}

function glanceList(ordered, issues, answers) {
  return h(
    "section",
    { class: "card glance" },
    h("h2", {}, "At a glance"),
    h("ol", {}, ordered.map((entry) => {
      const alignment = threadAlignment(issues, answers, entry.id, entry.brief);
      const level = TONE_ORDER.indexOf(entry.temperature);
      return h(
        "li",
        {},
        h(
          "button",
          { class: "glance-item", on: { click: () => document.getElementById(`brief-${entry.id}`).scrollIntoView({ behavior: "smooth", block: "start" }) } },
          h("span", { class: `thermo thermo-${entry.temperature}`, title: `${entry.temperature} · ${percent(entry.heat_share)} heated` }, h("span", { class: "thermo-dots", "aria-hidden": "true" }, TONE_ORDER.map((tone, index) => h("span", { class: `dot${index <= level ? " on" : ""}` })))),
          h("span", { class: "glance-headline" }, entry.brief.headline),
          h("span", { class: "glance-meta" },
            entry.importance.open_decision ? h("span", { class: "reason reason-decision" }, "decision pending") : null,
            h("span", { class: "muted small" }, `${entry.activity.participants} people`),
            alignment.known ? h("span", { class: `view-badge ${alignment.matching.length > 0 ? "badge-matches" : "badge-opposes"}` }, alignment.matching.length > 0 ? `with ${alignment.withReader} of ${alignment.sided}` : "no view like yours") : null),
        ),
      );
    })),
  );
}

function stanceCard(issues, answers, onAnswer, onDone, problem) {
  return h(
    "section",
    { class: "card stances" },
    h("h2", {}, "Where do you stand?"),
    h("p", { class: "muted" }, `${issues.length} quick questions from this month's debates. Your answers stay in this browser and only change what this page highlights.`),
    issues.map((issue) => h(
      "div",
      { class: "stance-question" },
      h("p", { class: "stance-q" }, issue.question),
      h("p", { class: "muted small" }, issue.context),
      h("div", { class: "stance-options", role: "group", "aria-label": issue.question },
        [...issue.stances, { stance_id: UNSURE, label: "Unsure", description: "No view yet" }].map((stance) => h(
          "button",
          { class: `stance${answers[issue.issue_id] === stance.stance_id ? " chosen" : ""}`, title: stance.description, "aria-pressed": answers[issue.issue_id] === stance.stance_id ? "true" : "false", on: { click: () => onAnswer(issue.issue_id, stance.stance_id) } },
          stance.label,
        ))),
    )),
    h("p", {}, h("button", { on: { click: onDone } }, answeredCount(issues, answers) === issues.length ? "Done" : "Skip for now")),
    problem ? h("p", { class: "notice" }, problem) : null,
  );
}

function stanceSummary(issues, answers, onEdit) {
  const chosen = issues.filter((issue) => answers[issue.issue_id] !== undefined && answers[issue.issue_id] !== UNSURE);
  return h(
    "section",
    { class: "stance-summary" },
    chosen.length === 0
      ? h("span", { class: "muted" }, "Answer a few questions to see where you stand in each debate. ")
      : [h("span", { class: "muted" }, "Your stances: "), chosen.map((issue, index) => [index > 0 ? " · " : null, h("span", { class: "my-stance", title: issue.question }, issue.stances.find((stance) => stance.stance_id === answers[issue.issue_id]).label)]), " "],
    h("button", { class: "small ghost", on: { click: onEdit } }, chosen.length === 0 ? "Answer (30 seconds)" : "Change"),
  );
}

export function renderCatchUp({ index, answers, editingStances, handlers }) {
  const catchUp = index.catch_up;
  const issues = catchUp.issues === null ? [] : catchUp.issues.output.issues;
  const byId = new Map(index.threads.map((entry) => [entry.id, entry]));
  const ordered = catchUp.order.map((topicId) => byId.get(topicId));
  const minutes = Math.ceil((ordered.length * SECONDS_PER_BRIEF + (issues.length > 0 ? STANCE_SECONDS : 0)) / 60);
  const showStances = issues.length > 0 && (editingStances || answeredCount(issues, answers) === 0);
  return h(
    "div",
    { class: "catchup" },
    h(
      "section",
      { class: "catchup-hero" },
      h("p", { class: "eyebrow" }, index.snapshot.period),
      h("h1", {}, "Catch up"),
      h("p", { class: "lede" }, index.digest !== null ? index.digest.output.headline : `${ordered.length} debates this month.`),
      h("p", { class: "muted" }, `${ordered.length} debates · about ${minutes} minutes · `, h("a", { href: "#/research" }, "every detail is in research mode")),
    ),
    issues.length === 0 ? null : showStances ? stanceCard(issues, answers, handlers.onAnswer, handlers.onDoneStances, handlers.stancesProblem) : stanceSummary(issues, answers, handlers.onEditStances),
    glanceList(ordered, issues, answers),
    h("p", { class: "order-rule muted small" }, "Order: ", catchUp.rule),
    ordered.map((entry) => briefCard(entry, issues, answers)),
    catchUp.also_active.length > 0 ? h(
      "section",
      { class: "card also" },
      h("h2", {}, "Also busy, not yet briefed"),
      h("ul", {}, catchUp.also_active.map((topicId) => byId.get(topicId)).map((entry) => h("li", {}, h("a", { href: `#/t/${entry.id}/calm` }, entry.title), h("span", { class: "muted" }, ` · ${entry.activity.participants} people, ${entry.activity.posts} posts`)))),
    ) : null,
  );
}
