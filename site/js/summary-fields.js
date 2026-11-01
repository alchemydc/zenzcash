// The detail fields implement D-54's contention contract beneath D-58's short cards.
export const ISSUE_DETAILS = [
  { id: "shared_premises_if_actually_shared", label: "Where positions overlap" },
  { id: "disputed_factual_claims", label: "Disputed factual claims" },
  { id: "disputed_values_or_authority", label: "Disputed values or authority" },
  { id: "evidence_and_its_limits", label: "Evidence and its limits" },
  { id: "strongest_material_objections", label: "Material objections" },
  { id: "what_would_resolve_or_clarify", label: "Questions to clarify · AI synthesis" },
];
export const ISSUE_DETAIL_IDS = ISSUE_DETAILS.map((field) => field.id);
export const ISSUE_KEYS = ["id", "issue", "description", "decision_at_stake", "positions_with_post_references", "unresolved_status", "points", "related_issues", ...ISSUE_DETAIL_IDS];
