import { RUBRIC_VERSION } from "../site/js/rubric.js";

const dimension = (score, rationale, span) => ({ score, confidence: "high", rationale, evidence_spans: [span], null_reason: score === null ? "not_applicable" : null });
const claim = (id, span, paraphrase, type) => ({ claim_id: id, exact_span: span, paraphrase, type, support_refs: [], assumptions: [], verification_status: "unverified" });
export const goodMarks = () => ({
  task: "marks", topic_id: 7, rubric_version: RUBRIC_VERSION,
  posts: [
    {
      post_number: 1, post_ref: "7/1", summary: "Argues for ending ZCG because of its block allocation and idle treasury.", function: ["argument"], context_refs: [], context_limitations: ["The linked report is not supplied."],
      claims: [claim("c1", "ZCG should end.", "ZCG should end.", "normative"), claim("c2", "It costs 8% of every block and $100M sits idle.", "ZCG receives 8% and holds an idle $100M.", "empirical")],
      dimensions: {
        tone: dimension(3, "Criticizes allocation without attacking a person.", "ZCG should end."),
        premise_transparency: dimension(1, "Treats the treasury's idleness as settled.", "$100M sits idle"),
        reasoning: dimension(2, "Allocation and treasury provide a relevant reason, but need verification.", "It costs 8% of every block and $100M sits idle."),
        contribution: dimension(2, "Gives a specific fiscal objection.", "It costs 8% of every block and $100M sits idle."),
      },
      tone_peak: { score: 3, exact_span: "ZCG should end.", severity: "minor", scope: "pervasive", confidence: "high" }, flags: [], display_label: "Restrained funding objection", neutral_rendition: null, editor_analysis: [], rewrite_changes: [], issue_ids: ["q3"], needs_human_review: { needed: false, reasons: [] },
    },
    {
      post_number: 2, post_ref: "7/2", summary: "Alleges the critic is paid and cites 400 grants as a defense of ZCG.", function: ["argument"], context_refs: ["7/1"], context_limitations: [],
      claims: [claim("c1", "You are clearly paid to say that.", "The critic is paid to express the view.", "allegation"), claim("c2", "ZCG funded 400 grants.", "ZCG funded 400 grants.", "empirical")],
      dimensions: {
        tone: dimension(0, "Accuses the critic of paid advocacy without support.", "You are clearly paid to say that."),
        premise_transparency: dimension(0, "Payment is presented as certain.", "You are clearly paid to say that."),
        reasoning: dimension(1, "Grant count does not establish grant value or paid advocacy.", "ZCG funded 400 grants."),
        contribution: dimension(1, "Offers a count without explaining its relevance to the fiscal objection.", "ZCG funded 400 grants."),
      },
      tone_peak: { score: 0, exact_span: "You are clearly paid to say that.", severity: "material", scope: "isolated", confidence: "high" },
      flags: [{ code: "unsupported_motive_attribution", exact_span: "You are clearly paid to say that.", explanation: "Attributes the position to payment without evidence.", target: "The critic", severity: "material", scope: "isolated", confidence: "high" }], display_label: "Unsupported payment allegation", neutral_rendition: "I allege that you are paid to express that position. ZCG funded 400 grants.", editor_analysis: [{ text: "Grant count alone does not establish grant value.", evidence_spans: ["ZCG funded 400 grants."], interpretation: true, confidence: "high" }], rewrite_changes: [{ source_span: "You are clearly paid to say that. ZCG funded 400 grants.", operation: "Attributes payment as an allegation and retains the count.", preserved_claim_ids: ["c1", "c2"] }], issue_ids: ["q2"], needs_human_review: { needed: true, reasons: ["The payment allegation lacks supplied evidence."] },
    },
    {
      post_number: 4, post_ref: "7/4", summary: "Reaffirms the earlier call to end ZCG.", function: ["preference"], context_refs: ["7/1"], context_limitations: [], claims: [claim("c1", "ZCG should end.", "ZCG should end.", "normative")],
      dimensions: {
        tone: dimension(3, "Reaffirms a position without attacking others.", "ZCG should end."),
        premise_transparency: dimension(3, "Expresses a preference explicitly.", "ZCG should end."),
        reasoning: dimension(null, "A restated preference has no new argument to assess.", "ZCG should end."),
        contribution: dimension(1, "Repeats the author's earlier position.", "+1 to everything I said before."),
      },
      tone_peak: { score: 3, exact_span: "ZCG should end.", severity: "minor", scope: "pervasive", confidence: "high" }, flags: [{ code: "repetition", exact_span: "+1 to everything I said before.", explanation: "Explicitly repeats the earlier view.", target: "Earlier position", severity: "minor", scope: "pervasive", confidence: "high" }], display_label: "Reaffirmed preference", neutral_rendition: null, editor_analysis: [], rewrite_changes: [], issue_ids: ["q3"], needs_human_review: { needed: false, reasons: [] },
    },
  ],
});
