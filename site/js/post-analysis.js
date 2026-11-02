import { h } from "./dom.js";
import { cites } from "./citations.js";
import { DIMENSION_IDS, RUBRIC, flagLabel } from "./rubric.js";
const evidence = (spans, view) => h("ul", { class: "evidence" }, spans.map((span) => h("li", {}, h("q", {}, view.transform(span)))));
export function postAssessment(post, view) {
  const analysis = post.analysis;
  return h("details", { class: "why-marks", open: view.state.open.marks.has(post.key), on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("why-marks")) view.actions.setOpen("marks", post.key, event.target.open); } } },
    h("summary", {}, "Why this rating?"),
    h("p", { class: "small muted" }, "AI ratings describe the original text. Tone describes how it is said; argument support describes how reasons are supplied. Neither tells you whether a claim is true."),
    DIMENSION_IDS.filter((id) => analysis.dimensions[id].score !== null).map((id) => {
      const dimension = analysis.dimensions[id];
      return h("section", {}, h("h4", {}, `${RUBRIC.scales[id].label}: ${dimension.score}/3`), h("p", {}, view.transform(dimension.rationale)), evidence(dimension.evidence_spans, view));
    }),
    analysis.tone_peak === null ? null : h("p", {}, `Harshest passage: ${analysis.tone_peak.score}/3. `, h("q", {}, view.transform(analysis.tone_peak.exact_span))),
    h("details", {}, h("summary", {}, "Claims and re-write details"),
      h("p", { class: "small" }, "These are provisional assessments, not independent fact-checks."),
      h("ul", { class: "passage-flags" }, analysis.flags.map((flag) => h("li", {}, h("strong", {}, `${flagLabel(flag.code)}: `), view.transform(flag.explanation), evidence([flag.exact_span], view)))),
      h("ul", {}, analysis.claims.map((claim) => h("li", {}, view.transform(claim.paraphrase), ` · ${flagLabel(claim.verification_status)}`, evidence([claim.exact_span], view), claim.support_refs.length ? cites(claim.support_refs, view) : null))),
      h("ul", {}, analysis.rewrite_changes.map((change) => h("li", {}, view.transform(change.operation), evidence([change.source_span], view))))),
    analysis.context_refs.length ? h("p", {}, "Context: ", cites(analysis.context_refs, view)) : null,
    analysis.context_limitations.map((text) => h("p", { class: "small muted" }, view.transform(text))),
    analysis.needs_human_review.needed ? h("p", { class: "notice small" }, "Review suggested: ", view.transform(analysis.needs_human_review.reasons.join("; "))) : null);
}
export function highlightedNotes(post, view) {
  return post.analysis.flags.filter((flag) => (view.state.settings.flagAssumptions && flag.code === "disputed_premise_presented_as_settled") || (view.state.settings.showReframing && flag.code === "useful_reframing"))
    .map((flag) => h("details", { class: "highlighted-flag" }, h("summary", {}, flagLabel(flag.code)), h("p", {}, view.transform(flag.explanation)), evidence([flag.exact_span], view)));
}
