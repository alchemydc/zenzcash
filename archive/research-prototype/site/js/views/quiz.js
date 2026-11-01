import { citeList, provenanceLine, textWithCites } from "../components.js";
import { h, replaceContent } from "../dom.js";

const KIND_LABELS = {
  position: "What a side holds",
  rebuttal: "How it was answered",
  evidence: "What the evidence was",
  status: "Where it stands",
  "mind-change": "What changed a mind",
  "strongest-case": "The strongest case",
};

export function renderQuiz({ thread }) {
  const topicId = thread.topic.id;
  const questions = thread.quiz.output.questions;
  const answers = new Map();
  const root = h("div", { class: "quiz" });

  function questionCard(question, position) {
    const chosen = answers.get(question.question_id);
    const answered = chosen !== undefined;
    return h(
      "article",
      { class: "card question" },
      h("p", { class: "eyebrow" }, `Question ${position + 1} of ${questions.length} · ${KIND_LABELS[question.kind]}`),
      h("h2", {}, question.prompt),
      h("div", { class: "options" }, question.options.map((option, index) => {
        const state = !answered ? "" : index === question.answer_index ? " correct" : index === chosen ? " wrong" : " dim";
        return h("button", { class: `option${state}`, disabled: answered, on: { click: () => choose(question, index) } }, option);
      })),
      answered ? h(
        "div",
        { class: `explanation ${chosen === question.answer_index ? "right" : "missed"}` },
        h("strong", {}, chosen === question.answer_index ? "Right. " : "Not quite. "),
        textWithCites(question.explanation, topicId),
        h("p", { class: "meta" }, "Check it yourself: ", citeList(topicId, question.cites)),
      ) : null,
    );
  }

  function results() {
    if (answers.size < questions.length) return null;
    const missed = questions.filter((question) => answers.get(question.question_id) !== question.answer_index);
    const score = questions.length - missed.length;
    return h(
      "section",
      { class: "card results" },
      h("h2", {}, `${score} of ${questions.length}`),
      missed.length === 0
        ? h("p", {}, "You have the arguments straight, on every side.")
        : [h("p", {}, "Worth rereading before you reply:"), h("ul", {}, missed.map((question) => h("li", {}, question.prompt, " ", citeList(topicId, question.cites))))],
      h("p", {}, h("button", { on: { click: reset } }, "Try again"), " ", h("a", { class: "button ghost", href: `#/t/${topicId}/digest` }, "Back to the claim digest")),
    );
  }

  function draw() {
    replaceContent(root, [
      h("p", { class: "eyebrow" }, h("a", { href: `#/t/${topicId}` }, thread.topic.title)),
      h("h1", {}, "Do you understand the arguments?"),
      h("p", { class: "muted" }, "Questions test what each side actually said, not trivia. Wrong options are plausible misreadings, never anyone's real position. Every answer cites the posts where you can check it."),
      questions.map((question, position) => questionCard(question, position)),
      results(),
      provenanceLine(thread.quiz.provenance),
    ]);
  }

  function choose(question, index) {
    answers.set(question.question_id, index);
    draw();
  }

  function reset() {
    answers.clear();
    draw();
  }

  draw();
  return root;
}
