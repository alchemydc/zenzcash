// Adopted reading framework. Calibration and cutoffs remain provisional.
export const RUBRIC_VERSION = "reading-0.1-provisional";

export const RUBRIC = {
  "scales": {
    "tone": {
      "label": "Tone",
      "direction": "Higher is less antagonistic",
      "0": "Attacking: direct contempt, personal belittling, taunting, or categorical accusations of dishonesty or corruption without sufficient basis in the supplied context.",
      "1": "Adversarial: sarcasm, loaded characterizations, pointed insinuations, or dismissive generalizations materially shape the post.",
      "2": "Pointed: forceful disagreement or isolated rhetorical sharpness; criticism remains primarily about claims, choices, or consequences.",
      "3": "Restrained: substantive criticism expressed without derogation or antagonistic framing. Warmth and agreement are not required.",
      "aggregation": "Rate predominant authored tone and separately report the most severe supported passage, its severity, and whether it is isolated or pervasive. A long civil passage does not cancel an insult. A quotation does not automatically lower the score."
    },
    "premise_transparency": {
      "label": "Assumptions and certainty",
      "0": "The central conclusion depends on a disputed entitlement, historical account, causal premise, or motive claim presented as settled, without acknowledgment or support.",
      "1": "Some assumptions or uncertainty are stated, but important premises or leaps remain implicit.",
      "2": "Most material assumptions, value judgments, and uncertainties are visible; some scope or qualification remains unclear.",
      "3": "The author distinguishes material observations, interpretations, values, hypotheses, and uncertainties sufficiently for the reader to evaluate the claim.",
      "null": "No material claim requiring this assessment, or insufficient context. Explain which."
    },
    "reasoning": {
      "label": "Argument support",
      "0": "A purported argument has no discernible support-to-conclusion connection, or substitutes attack for reasons.",
      "1": "A relevant reason is offered, but a central inference, comparison, or evidence claim is unsupported or mismatched.",
      "2": "An intelligible relevant reason or mechanism supports the conclusion; evidence scope or some inferential gaps remain unresolved.",
      "3": "Support is proportionate to the claim, material limitations are handled, and relevant objections or trade-offs are addressed where needed.",
      "null": "A social reply, simple preference, question without asserted rationale, or an item whose reasoning cannot be assessed from available context. These are not automatically poor writing.",
      "note": "This assesses support as presented. A link or statistic is not proof of accuracy, applicability, or a well-supported conclusion. An explicit moral preference need not have empirical proof. A concise valid correction can earn 3."
    },
    "contribution": {
      "label": "Contribution to understanding",
      "0": "Primarily taunting, venting, or repetition with no identifiable substantive addition.",
      "1": "States a position, repeats a concern, or introduces an underdeveloped assertion.",
      "2": "Adds a relevant distinction, reason, correction, concrete question, experience, or proposal.",
      "3": "Clarifies a central disagreement, surfaces a trade-off or premise, integrates an opposing point, or identifies an actionable test or decision criterion.",
      "null": "Context is insufficient to assess contribution. Novelty and repetition require prior-thread context.",
      "note": "Agreement or compromise is not mandatory. A decisive disagreement can earn 3. Social support can have community value even when it adds little to an argument map."
    }
  },
  "cross_cutting_rules": [
    "Do not collapse dimensions into a universal maturity, intelligence, goodness, or credibility score. Do not average them to select evidence for a summary.",
    "Rate the expressed claim, not whether the reviewer or model agrees with it. Apply the same scrutiny to coinholder primacy, committee authority, adoption claims, and private-funding claims.",
    "Do not infer lying, bad faith, manipulative intent, childishness, or personality from wording. Name observable textual behavior.",
    "Anger, distress, pessimism, informality, profanity, shortness, imperfect grammar, identity, and unpopular views are not intrinsically poor argumentation. Assess their actual use.",
    "A documented accusation can be relevant and justified. Preserve its evidence and scope; do not equate criticism of misconduct with an unsupported personal attack.",
    "An explicit normative premise is not a factual error. A hidden normative premise should be surfaced without replacing it with the opposing normative premise.",
    "I think, I am just asking, and I am not making an accusation do not automatically neutralize an insinuation. Examine what the passage asks readers to infer.",
    "A question is not rhetorical merely because it is difficult or direct. Consider whether it asks for an answer, what answer could satisfy it, and whether its surrounding text supplies a dismissive answer in advance.",
    "Praise, concessions, and disclaimers earn credit only for the substantive work they do. A short fair correction need not include ceremonial agreement.",
    "Keep original and rewritten ratings separate. Changing tone cannot manufacture better evidence or make an assumption true.",
    "Missing context lowers confidence or produces not_assessable; it is not evidence that the claim is false.",
    "Keep factual verification separate: unverified, supported_in_supplied_context, disputed_in_supplied_context, or independently_verified with a source and date. No claim here is independently verified."
  ],
  "flags": [
    "personal_belittling",
    "sarcasm_or_taunt",
    "unsupported_motive_attribution",
    "unsupported_misconduct_allegation",
    "disputed_premise_presented_as_settled",
    "unsupported_history_claim",
    "certainty_exceeds_support",
    "evidence_scope_mismatch",
    "loaded_question",
    "possible_misrepresentation",
    "repetition",
    "explicit_tradeoff",
    "explicit_uncertainty",
    "substantive_acknowledgment",
    "useful_reframing",
    "testable_question"
  ],
  "flag_requirements": "For each flag provide an exact source span, explanation, target of the wording, confidence, severity (minor/material/severe), and scope (isolated/repeated/pervasive). Treat possible_misrepresentation as provisional unless the referenced position is available. Positive flags also require evidence.",
  "rewrite_contract": {
    "preserve": [
      "substantive claim",
      "support actually given",
      "stance and strength",
      "uncertainty",
      "conditions",
      "counterexamples",
      "relevant personal experience",
      "attribution",
      "unresolved disagreement"
    ],
    "allowed": [
      "remove insults or repeated taunts",
      "replace ridicule with the substantive objection already present",
      "explicitly attribute a disputed premise",
      "mark an allegation as an allegation",
      "split factual claims from normative preferences"
    ],
    "forbidden": [
      "invent evidence or a conciliatory motive",
      "silently remove a central allegation",
      "turn a concern into an established fact",
      "erase dissent",
      "treat a hypothetical as an event",
      "strengthen a weak argument under the guise of paraphrase",
      "replace the author view with the reviewer view"
    ],
    "no_substance": "If a passage consists only of a taunt, collapse it as a personal reaction. Do not fabricate a policy objection.",
    "layers": "Use a Faithful neutral rendition label. Put added analysis, questions, and possible improvements in a separate Editor analysis field. Show original text and material changes."
  },
  "validation": [
    "Use the 12 annotated posts as initial calibration examples, not an objective gold standard. Reviewer comments may apply to a span rather than the entire post.",
    "Evaluate on additional unseen posts from both sides. Record disagreements and per-dimension confusion patterns; do not report accuracy measured only on the examples used to tune the rubric.",
    "Check that reversing the policy stance while preserving the argument form does not systematically change ratings.",
    "Check that equivalent formal and informal wording does not alter reasoning ratings. Removing an insult should affect tone, not evidence support.",
    "Check that quoted attacks are not assigned to an author who rejects them, and that export duplication is not scored as rhetorical repetition.",
    "Review rewrites against extracted claims: no added claim, lost condition, shifted certainty, or erased central allegation.",
    "Check every summary for substantive dissent lost to filtering, incorrect attribution, invented consensus, and factual claims presented more confidently than their sources.",
    "Allow user correction with a rationale; retain rubric versions so corrections can be reviewed rather than silently changing the evaluation standard."
  ]
};

export const DIMENSION_IDS = Object.keys(RUBRIC.scales);
export const FLAG_IDS = RUBRIC.flags;
export const CONFIDENCES = ["high", "medium", "low"];
export const SEVERITIES = ["minor", "material", "severe"];
export const SCOPES = ["isolated", "repeated", "pervasive"];
export const FUNCTIONS = ["argument", "question", "proposal", "correction", "preference", "experience", "social_reply", "mixed"];
export const CLAIM_TYPES = ["empirical", "normative", "interpretive", "predictive", "hypothetical", "allegation"];
export const VERIFICATION_STATUSES = ["unverified", "supported_in_supplied_context", "disputed_in_supplied_context"];
export const NULL_REASONS = ["not_applicable", "insufficient_context"];
export const TONE_PRESETS = [
  { id: "all", label: "All tones", minimum: 0 },
  { id: "restrained_and_pointed", label: "Restrained and pointed", minimum: 2 },
  { id: "restrained_only", label: "Restrained only", minimum: 3 },
];
export const SUPPORT_PRESETS = [
  { id: "all", label: "All contributions", minimum: 0 },
  { id: "reasoned", label: "Reasoned arguments", minimum: 2 },
  { id: "well_supported", label: "Well-supported arguments", minimum: 3 },
];
export const UNASSESSED_PRESETS = [
  { id: "include", label: "Keep unassessed contributions" },
  { id: "arguments_only", label: "Assessed arguments only" },
];
export const ANALYSIS_DISCLOSURE = "These notes are generated by AI and have not been reviewed by a human. They may misinterpret a post or miss context. Active maintenance is not guaranteed.";
export const flagLabel = (id) => id.replaceAll("_", " ");
export function toneBand(score) {
  if (score === null) return "unassessed";
  if (!Number.isInteger(score) || score < 0 || score > 3) throw new Error(`tone must be 0–3 or null, got ${JSON.stringify(score)}`);
  return score < 2 ? "low" : score === 2 ? "mid" : "high";
}
