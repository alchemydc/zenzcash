import { h } from "./dom.js";
import { cites } from "./citations.js";
import { ANALYSIS_DISCLOSURE, DIMENSION_IDS, RUBRIC, RUBRIC_VERSION, flagLabel, toneBand } from "./rubric.js";

const evidence = (spans, view) => h("ul", { class: "evidence" }, spans.map((span) => h("li", {}, h("q", {}, view.transform(span)))));

export function postAssessment(post, view) {
  const analysis = post.analysis;
  return h("div", { class: "marks zf" },
    h("p", { class: "small" }, h("strong", {}, "AI assessment of the original"), ` · ${view.transform(analysis.display_label)}`),
    h("div", { class: "dimension-scores" }, DIMENSION_IDS.map((id) => {
      const dimension = analysis.dimensions[id];
      return h("span", { class: `dimension${id === "tone" ? ` band-${toneBand(dimension.score)}` : ""}`, title: view.transform(dimension.rationale) }, `${RUBRIC.scales[id].label}: ${dimension.score === null ? "unassessed" : `${dimension.score}/3`}`);
    })),
    h("details", { class: "why-marks", open: view.state.open.marks.has(post.key), on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("why-marks")) view.actions.setOpen("marks", post.key, event.target.open); } } },
      h("summary", {}, "Evidence and assessment details"),
      h("p", { class: "muted small" }, `Provisional rubric ${RUBRIC_VERSION}. These independent dimensions are not a credibility score. Claims have not been independently verified.`),
      DIMENSION_IDS.map((id) => {
        const dimension = analysis.dimensions[id];
        return h("section", { class: "dimension-detail" }, h("h4", {}, RUBRIC.scales[id].label),
          h("p", {}, `${dimension.score === null ? `Unassessed (${flagLabel(dimension.null_reason)})` : `${dimension.score}/3`} · ${dimension.confidence} confidence. ${view.transform(dimension.rationale)}`),
          evidence(dimension.evidence_spans, view),
          h("details", {}, h("summary", {}, "What this scale means"), h("ol", { start: 0 }, [0, 1, 2, 3].map((score) => h("li", {}, RUBRIC.scales[id][score])))));
      }),
      analysis.tone_peak === null ? null : h("section", {}, h("h4", {}, "Harshest authored passage"),
        h("p", {}, `Tone ${analysis.tone_peak.score}/3 · ${analysis.tone_peak.severity} · ${analysis.tone_peak.scope} · ${analysis.tone_peak.confidence} confidence`),
        evidence([analysis.tone_peak.exact_span], view)),
      analysis.flags.length === 0 ? h("p", {}, "No passage flags assigned.") : h("ul", { class: "passage-flags" }, analysis.flags.map((flag) => h("li", {},
        h("strong", {}, flagLabel(flag.code)), ` · ${flag.severity} · ${flag.scope} · ${flag.confidence} confidence`,
        h("p", {}, view.transform(flag.explanation), " Target: ", view.transform(flag.target)), evidence([flag.exact_span], view)))),
      analysis.context_refs.length > 0 ? h("p", {}, "Context used: ", cites(analysis.context_refs, view)) : null,
      analysis.context_limitations.map((text) => h("p", { class: "muted small" }, view.transform(text))),
      h("details", { class: "claim-audit" }, h("summary", {}, "Claims and rendition audit"),
        h("ul", {}, analysis.claims.map((claim) => h("li", {}, h("strong", {}, `${claim.claim_id}: `), view.transform(claim.paraphrase),
          h("p", { class: "muted small" }, `${claim.type} · ${flagLabel(claim.verification_status)}`), evidence([claim.exact_span], view),
          claim.support_refs.length > 0 ? h("p", {}, "Supplied support: ", cites(claim.support_refs, view)) : null,
          claim.assumptions.length > 0 ? h("p", {}, "Assumptions: ", view.transform(claim.assumptions.join("; "))) : null))),
        h("ul", {}, analysis.rewrite_changes.map((change) => h("li", {}, view.transform(change.operation), ` (${change.preserved_claim_ids.join(", ")})`, evidence([change.source_span], view))))),
    ),
    analysis.needs_human_review.needed ? h("p", { class: "review-note small" }, "Review suggested: ", view.transform(analysis.needs_human_review.reasons.join("; "))) : null,
  );
}

export function editorAnalysis(post, view) {
  const analysis = post.analysis;
  const highlighted = analysis.flags.filter((flag) => (view.state.settings.flagAssumptions && flag.code === "disputed_premise_presented_as_settled") || (view.state.settings.showReframing && flag.code === "useful_reframing"));
  return h("aside", { class: "editor-analysis zf" },
    h("h4", {}, "AI-generated analysis"),
    h("p", { class: "analysis-disclosure muted small" }, ANALYSIS_DISCLOSURE),
    h("button", { class: "linkish small", on: { click: () => view.actions.openPost(post.key) } }, "Check the original"),
    highlighted.map((flag) => h("p", { class: "highlighted-flag" }, h("strong", {}, `${flagLabel(flag.code)}: `), view.transform(flag.explanation), " ", h("q", {}, view.transform(flag.exact_span)))),
    analysis.editor_analysis.map((note) => h("div", { class: "analysis-note" },
      h("p", {}, h("strong", {}, note.interpretation ? "AI interpretation: " : "Explicit authored claim: "), view.transform(note.text), h("span", { class: "muted small" }, ` (${note.confidence} confidence)`)), evidence(note.evidence_spans, view))),
    analysis.editor_analysis.length === 0 && highlighted.length === 0 ? h("p", { class: "muted small" }, "No additional analytical note for this post.") : null);
}
