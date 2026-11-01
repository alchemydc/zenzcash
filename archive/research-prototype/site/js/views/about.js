import { h } from "../dom.js";

export function renderAbout({ index, receipts, section }) {
  const vocabulary = index.vocabulary;
  const page = h(
    "div",
    { class: "about" },
    h("p", { class: "eyebrow" }, h("a", { href: "#/" }, "zforum"), " / how it works"),
    h("h1", {}, "How zforum works"),
    h("p", { class: "lede" }, "zforum never deletes, never scores people, and never writes arguments for anyone. It folds, labels with specific checkable signals, and summarizes, and every label points at the words that triggered it."),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Three rules"),
      h("ol", {}, [
        "Nothing is deleted, only folded. Every fold is one click from open and says why.",
        "No scores, ever. There is no per-author quality number anywhere in the system.",
        "No filter may hide a new claim. Muting someone folds their restatements; the first statement of any claim stays open, whoever makes it.",
      ].map((text) => h("li", {}, text))),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Signals"),
      h("p", { class: "muted" }, "Narrow and named. Deterministic signals are computed from text and thread structure with no model; model signals always carry a verbatim quoted span; derived signals are computed from the claim graph."),
      h("table", { class: "signal-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Id"), h("th", {}, "Signal"), h("th", {}, "Source"), h("th", {}, "Meaning"))),
        h("tbody", {}, vocabulary.signals.map((signal) => h("tr", {}, h("td", {}, signal.id), h("td", {}, h("span", { class: `chip chip-${signal.polarity}` }, signal.name)), h("td", {}, signal.source), h("td", {}, signal.description, vocabulary.calm_fold_signals.includes(signal.id) ? h("span", { class: "muted" }, " Folded by the Calm lens.") : null))))),
    ),
    h(
      "section",
      { class: "card", id: "prompts" },
      h("h2", {}, "Open prompts"),
      h("p", { class: "muted" }, "These are the exact prompts that produced every summary, label, quiz and check on this site. Each output records the hash of the prompt that made it, and the build refuses any output whose prompt has since changed."),
      Object.entries(index.prompts).map(([task, prompt]) => h("details", { class: "prompt" }, h("summary", {}, `${task} · sha256 ${prompt.sha256.slice(0, 16)}…`), h("pre", {}, prompt.text))),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Provenance"),
      h("table", { class: "provenance-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Output"), h("th", {}, "Model"), h("th", {}, "Backend"), h("th", {}, "Produced"))),
        h("tbody", {}, index.provenance.map((record) => h("tr", {}, h("td", {}, `${record.task} / ${record.subject}`), h("td", {}, record.model), h("td", {}, record.backend), h("td", {}, record.produced_at.slice(0, 16).replace("T", " ")))))),
      h("p", { class: "muted" }, "\"subagent\" means a Claude Code subagent read the same job files the API backend would send; the operator declares its model. With an API key, the same jobs run through the Anthropic API and the response names the model."),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Receipt keys"),
      h("ul", {}, receipts.keyring.map((key) => h("li", {}, h("code", {}, key.kid), " ", h("code", { class: "wrap" }, key.public_key)))),
      h("p", { class: "muted" }, `${receipts.log.length} receipt${receipts.log.length === 1 ? "" : "s"} in the published log.`),
    ),
  );
  if (section === "prompts") requestAnimationFrame(() => document.getElementById("prompts").scrollIntoView());
  return page;
}
