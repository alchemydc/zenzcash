import { h } from "./dom.js";
import { cites } from "./citations.js";
import { ANALYSIS_DISCLOSURE } from "./rubric.js";
import { ISSUE_DETAILS } from "./summary-fields.js";

export const questionElementId = (id) => `question-${id}`;

const statement = (item, view) => [view.transform(item.text), " ", cites(item.cites, view)];

export function orientation(topic, view) {
  return h("div", { class: "overview" }, topic.overview.map((sentence) => h("p", {}, statement(sentence, view))));
}

export function questionCards(topic, view) {
  const points = new Map(topic.points.map((point) => [point.id, point]));
  const issues = new Map(topic.issues.map((issue) => [issue.id, issue]));
  const cards = new Map();
  const openQuestion = (id) => {
    const card = cards.get(id);
    view.actions.setOpen("questions", id, true);
    card.open = true;
    const heading = card.querySelector("summary");
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start", behavior: "auto" });
  };
  const rendered = topic.issues.map((issue, index) => {
    const detail = h("details", {
      class: "question-arguments",
      open: view.state.open.arguments.has(issue.id),
      on: { toggle: (event) => {
        if (event.target === detail && detail.isConnected) view.actions.setOpen("arguments", issue.id, detail.open);
      } },
    }, h("summary", {}, "Explore the arguments"),
    h("p", { class: "muted small" }, "These are attributed positions, not verified findings. Sources for the question: ", cites(issue.description.cites, view)),
    h("ul", { class: "points" }, issue.points.map((id) => {
      const point = points.get(id);
      return h("li", { id: `argument-${id}` },
        view.state.settings.highlightNew && view.news.points.includes(id) ? h("span", { class: "badge-new" }, "New") : null,
        statement(point, view));
    })),
    ISSUE_DETAILS.filter((field) => issue[field.id].length > 0).map((field) => h("section", { class: "issue-detail" },
      h("h4", {}, field.label), h("ul", {}, issue[field.id].map((item) => h("li", {}, statement(item, view)))))),
    );
    const card = h("details", {
      id: questionElementId(issue.id),
      class: "question-card",
      open: view.state.open.questions.has(issue.id),
      on: { toggle: (event) => {
        if (event.target === card && card.isConnected) view.actions.setOpen("questions", issue.id, card.open);
      } },
    },
    h("summary", { class: "question-heading" },
      h("span", { class: "question-number", "aria-hidden": "true" }, String(index + 1).padStart(2, "0")),
      h("span", { class: "question-heading-text" }, h("strong", {}, issue.issue), h("span", { class: "question-description" }, view.transform(issue.description.text)))),
    h("div", { class: "question-content" },
      h("p", { class: "decision-at-stake" }, statement(issue.decision_at_stake, view)),
      h("dl", { class: "question-positions" }, issue.positions_with_post_references.map((position) => [h("dt", {}, position.label), h("dd", {}, statement(position, view))])),
      h("p", { class: "unresolved" }, h("strong", {}, "Still unresolved: "), statement(issue.unresolved_status, view)),
      detail,
      issue.related_issues.length > 0 ? h("div", { class: "related-questions" }, h("span", { class: "muted small" }, "Related questions: "), issue.related_issues.map((id) => h("button", { class: "linkish small", on: { click: () => openQuestion(id) } }, issues.get(id).issue))) : null,
      index < topic.issues.length - 1 ? h("button", { class: "chip next-question", on: { click: () => openQuestion(topic.issues[index + 1].id) } }, "Next question →") : h("p", { class: "muted small" }, "You can revisit any question or continue into the discussion below."),
    ));
    cards.set(issue.id, card);
    return card;
  });
  return h("section", { class: "question-summary", "aria-label": "Questions in the debate" },
    h("h2", {}, "Choose a question"),
    h("p", { class: "muted" }, "Start wherever you’re curious. Each question stands on its own; open the arguments when you want more detail."),
    h("div", { class: "question-list" }, rendered),
    h("p", { class: "summary-scope muted small" }, `All ${topic.points.length} arguments remain available under “Explore the arguments”, including those from filtered posts. Citations name the thread and post (A#12) and open the original; their colours indicate tone only, not argument quality.`),
    h("p", { class: "analysis-disclosure muted small" }, h("strong", {}, "AI-generated analysis. "), ANALYSIS_DISCLOSURE));
}
