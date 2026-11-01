// Pure lens logic: which posts the Calm lens folds, which chips a post shows, what muting
// costs the reader. No DOM here, so all of it is tested under node.

import { plainText } from "./markdown.js";

export const MUTE_DAYS = 30;
const CAUTION_CHIP_LIMIT = 2;

function grouped(items, key) {
  const groups = new Map();
  for (const item of items) {
    const value = key(item);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
  }
  return groups;
}

export function threadModel(thread, vocabulary) {
  const analysis = thread.analysis === null ? null : thread.analysis.output;
  const claims = analysis === null ? [] : analysis.claims;
  return {
    thread,
    vocabulary,
    analyzed: analysis !== null,
    signalInfo: new Map(vocabulary.signals.map((signal) => [signal.id, signal])),
    posts: new Map(thread.posts.map((post) => [post.number, post])),
    postAnalysis: new Map((analysis === null ? [] : analysis.posts).map((entry) => [entry.post_number, entry])),
    claims: new Map(claims.map((claim) => [claim.claim_id, claim])),
    firstStatements: grouped(claims, (claim) => claim.first_post),
    mindChanges: new Map((analysis === null ? [] : analysis.mind_changes).map((change) => [change.post_number, change])),
    alreadyAnswered: grouped(thread.analysis === null ? [] : thread.analysis.already_answered, (item) => item.post),
  };
}

function signalEntry(model, id, span, detail) {
  const info = model.signalInfo.get(id);
  if (info === undefined) throw new Error(`unknown signal id ${JSON.stringify(id)}`);
  return { id, name: info.name, polarity: info.polarity, source: info.source, span, detail };
}

// Every signal on a post: model signals (with spans), derived A5, deterministic signals.
export function postSignals(model, number) {
  const post = model.posts.get(number);
  if (post === undefined) throw new Error(`thread ${model.thread.topic.id} has no post #${number}`);
  const entries = [];
  const analysisEntry = model.postAnalysis.get(number);
  if (analysisEntry !== undefined) {
    for (const signal of analysisEntry.signals) entries.push(signalEntry(model, signal.signal, signal.span, signal.note));
  }
  for (const item of model.alreadyAnswered.get(number) ?? []) {
    const claim = model.claims.get(item.claim_id);
    entries.push(signalEntry(model, "A5", null, `restates "${claim.text}", already answered at #${item.answered_at}`));
  }
  for (const signal of post.signals) entries.push(signalEntry(model, signal.signal, signal.span, signal.detail));
  return entries;
}

const SOURCE_RANK = { model: 0, derived: 1, deterministic: 2, metadata: 3 };

// What a post shows as chips: up to two caution chips (model signals first, since they carry
// a quoted span and a reason), plus every positive signal. C2 and C3 are structural and
// shown by the lens itself rather than as chips.
export function chips(model, number) {
  const all = postSignals(model, number).filter((signal) => signal.id !== "C2" && signal.id !== "C3");
  const caution = all.filter((signal) => signal.polarity === "caution").sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
  const positive = all.filter((signal) => signal.polarity === "positive");
  const disclosure = all.filter((signal) => signal.polarity === "disclosure");
  return { caution: caution.slice(0, CAUTION_CHIP_LIMIT), hiddenCaution: Math.max(0, caution.length - CAUTION_CHIP_LIMIT), positive, disclosure };
}

// Why a post is protected from folding. Novelty and good faith are never folded: the first
// statement of any claim, a mind change, and any positive signal.
export function protections(model, number) {
  const reasons = [];
  const first = model.firstStatements.get(number);
  if (first !== undefined) reasons.push(`first statement of ${first.map((claim) => claim.claim_id).join(", ")}`);
  if (model.mindChanges.has(number)) reasons.push("a change of mind");
  for (const signal of postSignals(model, number)) {
    if (signal.polarity === "positive" && signal.id !== "E3") reasons.push(signal.name);
  }
  return [...new Set(reasons)];
}

// The Calm lens decision for one post: {mode: "hidden" | "full" | "folded", reasons, keptBecause}.
export function calmDecision(model, number, mutedAuthors) {
  const post = model.posts.get(number);
  if (post === undefined) throw new Error(`thread ${model.thread.topic.id} has no post #${number}`);
  if (post.hidden) return { mode: "hidden", reasons: [], keptBecause: [] };
  const foldSignals = postSignals(model, number).filter((signal) => model.vocabulary.calm_fold_signals.includes(signal.id));
  const muted = mutedAuthors.has(post.author);
  if (foldSignals.length === 0 && !muted) return { mode: "full", reasons: [], keptBecause: [] };
  const reasons = [...(muted ? [{ id: "muted", name: `you muted ${post.author}`, span: null, detail: null }] : []), ...foldSignals];
  const kept = protections(model, number);
  if (kept.length > 0) return { mode: "full", reasons, keptBecause: kept };
  return { mode: "folded", reasons, keptBecause: [] };
}

// What muting costs in this thread. Muting needs the claim analysis: without it the novelty
// guarantee cannot be enforced, so muting is unavailable on unanalyzed threads.
export function coverage(model, mutedAuthors) {
  const visible = model.thread.posts.filter((post) => !post.hidden);
  const mutedHere = [...new Set(visible.map((post) => post.author))].filter((author) => mutedAuthors.has(author));
  const mutedPosts = visible.filter((post) => mutedAuthors.has(post.author));
  const claimsOnlyByMuted = [...model.claims.values()].filter((claim) => claim.asserted_in.every((number) => mutedAuthors.has(model.posts.get(number).author)));
  const keptByNovelty = mutedPosts.filter((post) => model.firstStatements.has(post.number)).length;
  return {
    authors: mutedHere,
    posts: mutedPosts.length,
    share: visible.length === 0 ? 0 : mutedPosts.length / visible.length,
    claimsOnlyByMuted: claimsOnlyByMuted.length,
    keptByNovelty,
  };
}

export function volumeNudge(thread, vocabulary) {
  const visible = thread.posts.filter((post) => !post.hidden).length;
  const top = thread.volume_shares[0];
  if (top === undefined || visible < vocabulary.volume_nudge.min_posts || top.share < vocabulary.volume_nudge.share) return null;
  return { author: top.author, posts: top.posts, share: top.share };
}

// Mutes are {author: expiresAtMilliseconds}; expired ones are dropped.
export function activeMutes(stored, nowMilliseconds) {
  return new Set(Object.entries(stored).filter(([, expires]) => expires > nowMilliseconds).map(([author]) => author));
}

export function withMute(stored, author, nowMilliseconds) {
  return { ...stored, [author]: nowMilliseconds + MUTE_DAYS * 24 * 60 * 60 * 1000 };
}

export function withoutMute(stored, author) {
  return Object.fromEntries(Object.entries(stored).filter(([name]) => name !== author));
}

// The claim digest, ordered by where each claim first appeared.
export function claimCards(model) {
  return [...model.claims.values()]
    .sort((a, b) => a.first_post - b.first_post)
    .map((claim) => ({
      claim,
      participants: [...new Set(claim.asserted_in.map((number) => model.posts.get(number).author))],
      statement: model.posts.get(claim.strongest_statement),
      rebuttal: claim.strongest_rebuttal === null ? null : model.posts.get(claim.strongest_rebuttal),
    }));
}

export function ownText(post) {
  return post.segments.filter((segment) => segment.kind === "text").map((segment) => plainText(segment.markdown)).join(" ");
}

export function excerpt(text, limit) {
  const flat = text.replace(/\s+/g, " ").trim();
  if ([...flat].length <= limit) return flat;
  const cut = [...flat].slice(0, limit).join("");
  return `${cut.slice(0, cut.lastIndexOf(" ") > limit * 0.6 ? cut.lastIndexOf(" ") : cut.length)}…`;
}
