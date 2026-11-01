// How a reader's stances (answers to the cross-thread issues) line up with each thread's
// views. Pure functions; tested under node.

export const UNSURE = "unsure";

// The issues that map at least one view of this thread.
export function relevantIssues(issues, topicId) {
  return issues.filter((issue) => issue.mapping.some((entry) => entry.topic_id === topicId));
}

// "matches" when every answered issue that maps this view agrees with the reader, "opposes"
// when every one disagrees, "mixed" when they split, "unknown" when none applies.
export function viewAlignment(issues, answers, topicId, viewId) {
  const verdicts = [];
  for (const issue of issues) {
    const answer = answers[issue.issue_id];
    if (answer === undefined || answer === UNSURE) continue;
    const entry = issue.mapping.find((candidate) => candidate.topic_id === topicId && candidate.view_id === viewId);
    if (entry !== undefined) verdicts.push(entry.stance_id === answer);
  }
  if (verdicts.length === 0) return "unknown";
  if (verdicts.every((agrees) => agrees)) return "matches";
  if (verdicts.every((agrees) => !agrees)) return "opposes";
  return "mixed";
}

// Where the reader stands in one thread: the views that match, the views that oppose, the
// share of participants who took a side and stand with the reader, and the strongest points
// made against the reader's views (cited from real posts).
export function threadAlignment(issues, answers, topicId, brief) {
  const statuses = brief.views.map((view) => ({ view, status: viewAlignment(issues, answers, topicId, view.view_id) }));
  const matching = statuses.filter((item) => item.status === "matches").map((item) => item.view);
  const opposing = statuses.filter((item) => item.status === "opposes").map((item) => item.view);
  const sided = new Set(brief.views.flatMap((view) => view.holders));
  const withReader = new Set(matching.flatMap((view) => view.holders));
  const against = matching.filter((view) => view.best_against !== null).map((view) => ({ view, quote: view.best_against }));
  return {
    statuses,
    matching,
    opposing,
    known: matching.length + opposing.length > 0,
    withReader: withReader.size,
    sided: sided.size,
    against,
  };
}

export function answeredCount(issues, answers) {
  return issues.filter((issue) => answers[issue.issue_id] !== undefined).length;
}

// Stored answers are only valid for the snapshot whose issues they answered.
export function answersFor(stored, snapshotName) {
  return stored !== null && stored.snapshot === snapshotName ? stored.answers : {};
}

export function holderCount(brief) {
  return new Set(brief.views.flatMap((view) => view.holders)).size;
}

// A bar width class, in steps of 10%, so no inline style is ever needed (the page's CSP
// forbids them).
export function widthClass(part, whole) {
  if (whole <= 0) return "w-0";
  return `w-${Math.min(100, Math.max(part > 0 ? 10 : 0, Math.round((part / whole) * 10) * 10))}`;
}
