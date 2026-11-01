import { checker } from './checker.mjs';
import { postKey } from './jobs.mjs';
import { CLAIM_TYPES, CONFIDENCES, DIMENSION_IDS, FLAG_IDS, FUNCTIONS, NULL_REASONS, RUBRIC_VERSION, SCOPES, SEVERITIES, VERIFICATION_STATUSES } from '../../site/js/rubric.js';

export const collapseWhitespace = (text) => text.replace(/\s+/g, ' ').trim();
const ENTRY_KEYS = ['post_number', 'post_ref', 'summary', 'function', 'context_refs', 'context_limitations', 'claims', 'dimensions', 'tone_peak', 'flags', 'display_label', 'neutral_rendition', 'editor_analysis', 'rewrite_changes', 'issue_ids', 'needs_human_review'];

export function validateMarks(output, job, thread, threads = [thread]) {
  const { problems, report, exactKeys, text, list } = checker();
  const oneOf = (value, values, where) => { if (!values.includes(value)) report(where, `must be one of ${values.join(', ')}; got ${JSON.stringify(value)}`); };
  const strings = (value, where, min = 0) => list(value, min, 100, where).forEach((item, i) => text(item, 1000, `${where}[${i}]`));
  const distinct = (values, where) => { if (new Set(values).size !== values.length) report(where, 'must not contain duplicates'); };
  const score = (value, where) => { if (!Number.isInteger(value) || value < 0 || value > 3) report(where, `must be an integer 0–3; got ${JSON.stringify(value)}`); };
  const visible = new Set(threads.flatMap(t => t.posts.filter(p => !p.hidden).map(p => postKey(t.id, p.number))));
  const refs = (value, where) => {
    const values = list(value, 0, visible.size, where);
    distinct(values, where);
    for (const key of values) if (!visible.has(key)) report(where, `unknown or hidden post ${JSON.stringify(key)}`);
    return values;
  };
  if (!exactKeys(output, ['task', 'topic_id', 'rubric_version', 'posts'], 'output')) return problems;
  if (output.task !== 'marks') report('output.task', 'must be "marks"');
  if (output.topic_id !== job.topic_id) report('output.topic_id', `must be ${job.topic_id}`);
  if (output.rubric_version !== RUBRIC_VERSION) report('output.rubric_version', `must be ${RUBRIC_VERSION}`);
  const entries = list(output.posts, job.expected.length, job.expected.length, 'output.posts');
  const numbers = entries.map(e => e?.post_number);
  if (JSON.stringify(numbers) !== JSON.stringify(job.expected)) report('output.posts', `must cover exactly posts ${job.expected.join(', ')} in that order; got ${numbers.join(', ')}`);
  const byNumber = new Map(thread.posts.map(p => [p.number, p]));
  entries.forEach((entry, index) => {
    const where = `posts[${index}] (#${entry?.post_number})`;
    if (!exactKeys(entry, ENTRY_KEYS, where)) return;
    const post = byNumber.get(entry.post_number);
    if (post === undefined || post.hidden) { report(where, 'must refer to a visible post in the assigned thread'); return; }
    const own = collapseWhitespace(post.own_text);
    const span = (value, at) => {
      text(value, 8000, at);
      if (typeof value === 'string' && !own.includes(collapseWhitespace(value))) report(at, `not verbatim authored text: ${JSON.stringify(value.slice(0, 100))}`);
    };
    const spans = (value, at, minimum) => list(value, minimum, 50, at).forEach((value, i) => span(value, `${at}[${i}]`));
    const passage = (value, at) => {
      span(value.exact_span, `${at}.exact_span`);
      oneOf(value.severity, SEVERITIES, `${at}.severity`);
      oneOf(value.scope, SCOPES, `${at}.scope`);
      oneOf(value.confidence, CONFIDENCES, `${at}.confidence`);
    };
    if (entry.post_ref !== postKey(thread.id, post.number)) report(`${where}.post_ref`, `must be ${postKey(thread.id, post.number)}`);
    text(entry.summary, 160, `${where}.summary`);
    const functions = list(entry.function, 1, FUNCTIONS.length, `${where}.function`);
    distinct(functions, `${where}.function`);
    functions.forEach(f => oneOf(f, FUNCTIONS, `${where}.function`));
    const context = refs(entry.context_refs, `${where}.context_refs`);
    if (post.reply_to !== null) {
      const parent = postKey(thread.id, post.reply_to);
      if (visible.has(parent) && !context.includes(parent)) report(`${where}.context_refs`, `must include available parent ${parent}`);
    }
    strings(entry.context_limitations, `${where}.context_limitations`);
    const claimIds = new Set();
    list(entry.claims, 0, 50, `${where}.claims`).forEach((claim, i) => {
      const at = `${where}.claims[${i}]`;
      if (!exactKeys(claim, ['claim_id', 'exact_span', 'paraphrase', 'type', 'support_refs', 'assumptions', 'verification_status'], at)) return;
      if (typeof claim.claim_id !== 'string' || !/^c[1-9][0-9]*$/.test(claim.claim_id) || claim.claim_id.trim() !== claim.claim_id) report(`${at}.claim_id`, 'must look like c1');
      if (claimIds.has(claim.claim_id)) report(`${at}.claim_id`, 'duplicate claim id');
      claimIds.add(claim.claim_id);
      span(claim.exact_span, `${at}.exact_span`);
      text(claim.paraphrase, 1500, `${at}.paraphrase`);
      oneOf(claim.type, CLAIM_TYPES, `${at}.type`);
      refs(claim.support_refs, `${at}.support_refs`);
      strings(claim.assumptions, `${at}.assumptions`);
      oneOf(claim.verification_status, VERIFICATION_STATUSES, `${at}.verification_status`);
    });
    if (exactKeys(entry.dimensions, DIMENSION_IDS, `${where}.dimensions`)) {
      for (const id of DIMENSION_IDS) {
        const value = entry.dimensions[id];
        const at = `${where}.dimensions.${id}`;
        if (!exactKeys(value, ['score', 'confidence', 'rationale', 'evidence_spans', 'null_reason'], at)) continue;
        if (value.score === null) oneOf(value.null_reason, NULL_REASONS, `${at}.null_reason`);
        else { score(value.score, `${at}.score`); if (value.null_reason !== null) report(`${at}.null_reason`, 'must be null for an assessed score'); }
        oneOf(value.confidence, CONFIDENCES, `${at}.confidence`);
        text(value.rationale, 400, `${at}.rationale`);
        spans(value.evidence_spans, `${at}.evidence_spans`, value.score === null ? 0 : 1);
      }
    }
    if (entry.tone_peak !== null) {
      const peak = entry.tone_peak;
      if (exactKeys(peak, ['score', 'exact_span', 'severity', 'scope', 'confidence'], `${where}.tone_peak`)) {
        score(peak.score, `${where}.tone_peak.score`);
        passage(peak, `${where}.tone_peak`);
        if (entry.dimensions?.tone?.score === null || peak.score > entry.dimensions?.tone?.score) report(`${where}.tone_peak.score`, 'cannot be higher than assessed predominant tone');
      }
    } else if (entry.dimensions?.tone?.score !== null) report(`${where}.tone_peak`, 'required when tone is assessed');
    const seenFlags = new Set();
    list(entry.flags, 0, 100, `${where}.flags`).forEach((flag, i) => {
      const at = `${where}.flags[${i}]`;
      if (!exactKeys(flag, ['code', 'exact_span', 'explanation', 'target', 'severity', 'scope', 'confidence'], at)) return;
      oneOf(flag.code, FLAG_IDS, `${at}.code`);
      passage(flag, at);
      text(flag.explanation, 600, `${at}.explanation`);
      text(flag.target, 200, `${at}.target`);
      const key = JSON.stringify([flag.code, flag.exact_span]);
      if (seenFlags.has(key)) report(at, 'duplicate code/span pair');
      seenFlags.add(key);
    });
    text(entry.display_label, 120, `${where}.display_label`);
    if (entry.neutral_rendition !== null) text(entry.neutral_rendition, post.own_text.length * 2 + 1000, `${where}.neutral_rendition`);
    list(entry.editor_analysis, 0, 12, `${where}.editor_analysis`).forEach((note, i) => {
      const at = `${where}.editor_analysis[${i}]`;
      if (!exactKeys(note, ['text', 'evidence_spans', 'interpretation', 'confidence'], at)) return;
      text(note.text, 600, `${at}.text`);
      spans(note.evidence_spans, `${at}.evidence_spans`, 1);
      if (typeof note.interpretation !== 'boolean') report(`${at}.interpretation`, 'must be a boolean');
      oneOf(note.confidence, CONFIDENCES, `${at}.confidence`);
    });
    const preserved = new Set();
    list(entry.rewrite_changes, entry.neutral_rendition === null ? 0 : 1, entry.neutral_rendition === null ? 0 : 100, `${where}.rewrite_changes`).forEach((change, i) => {
      const at = `${where}.rewrite_changes[${i}]`;
      if (!exactKeys(change, ['source_span', 'operation', 'preserved_claim_ids'], at)) return;
      span(change.source_span, `${at}.source_span`);
      text(change.operation, 600, `${at}.operation`);
      for (const id of list(change.preserved_claim_ids, 0, claimIds.size, `${at}.preserved_claim_ids`)) {
        if (!claimIds.has(id)) report(`${at}.preserved_claim_ids`, `unknown claim ${JSON.stringify(id)}`);
        preserved.add(id);
      }
    });
    if (entry.neutral_rendition !== null) for (const id of claimIds) if (!preserved.has(id)) report(`${where}.rewrite_changes`, `does not account for claim ${id}`);
    const issues = list(entry.issue_ids, 0, 6, `${where}.issue_ids`);
    distinct(issues, `${where}.issue_ids`);
    issues.forEach(id => oneOf(id, ['q1','q2','q3','q4','q5','q6'], `${where}.issue_ids`));
    if (exactKeys(entry.needs_human_review, ['needed', 'reasons'], `${where}.needs_human_review`)) {
      const review = entry.needs_human_review;
      if (typeof review.needed !== 'boolean') report(`${where}.needs_human_review.needed`, 'must be a boolean');
      strings(review.reasons, `${where}.needs_human_review.reasons`, review.needed ? 1 : 0);
      if (!review.needed && Array.isArray(review.reasons) && review.reasons.length > 0) report(`${where}.needs_human_review.reasons`, 'must be empty when review is not needed');
    }
  });
  return problems;
}
