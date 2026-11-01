import assert from "node:assert/strict";
import test from "node:test";

import { activeMutes, calmDecision, chips, claimCards, coverage, excerpt, protections, threadModel, volumeNudge, withMute, withoutMute } from "../js/lens.js";

const vocabulary = {
  signals: [
    ["A1", "one-sided case", "model", "caution"], ["A2", "unsourced number", "deterministic", "caution"], ["A5", "already answered", "derived", "caution"],
    ["B3", "contempt", "model", "caution"], ["C1", "contentless agreement", "deterministic", "caution"], ["C2", "consecutive run", "deterministic", "caution"],
    ["D2", "self-disclosure", "model", "disclosure"], ["E1", "asks for evidence", "model", "positive"], ["E3", "mind change", "model", "positive"],
  ].map(([id, name, source, polarity]) => ({ id, name, source, polarity, category: "x", description: "d" })),
  calm_fold_signals: ["B1", "B2", "B3", "B4", "C1", "C2"],
  volume_nudge: { share: 0.15, min_posts: 4 },
};

function post(number, author, { hidden = false, signals = [], text = `post ${number}` } = {}) {
  return { number, author, author_title: null, author_group: null, created_at: "2026-10-20T10:00:00Z", reply_to: null, hidden, signals, segments: hidden ? [] : [{ kind: "text", markdown: text }] };
}

function sampleThread() {
  return {
    topic: { id: 100 },
    posts: [
      post(1, "op"),
      post(2, "bob", { signals: [{ signal: "A2", span: "20%", detail: "no link" }] }),
      post(3, "carol", { hidden: true }),
      post(4, "op"),
      post(5, "dave"),
      post(6, "dave", { signals: [{ signal: "C2", span: null, detail: "post 2 in a row by dave" }, { signal: "C1", span: "Agreed", detail: "short" }] }),
    ],
    volume_shares: [{ author: "op", posts: 2, share: 0.4 }, { author: "dave", posts: 2, share: 0.4 }, { author: "bob", posts: 1, share: 0.2 }],
    analysis: {
      output: {
        claims: [
          { claim_id: "c1", text: "End the fund.", asserted_in: [1, 5], first_post: 1, strongest_statement: 1, rebuttals: [2], strongest_rebuttal: 2, status: "contested" },
          { claim_id: "c2", text: "Dave's own point.", asserted_in: [6], first_post: 6, strongest_statement: 6, rebuttals: [], strongest_rebuttal: null, status: "unanswered" },
        ],
        posts: [
          { post_number: 1, tone: "calm", claim_ids: ["c1"], annotation: null, signals: [{ signal: "A1", span: "End", note: "one-sided" }] },
          { post_number: 2, tone: "warm", claim_ids: [], annotation: null, signals: [{ signal: "E1", span: "source?", note: "asks" }] },
          { post_number: 4, tone: "calm", claim_ids: [], annotation: null, signals: [{ signal: "E3", span: "fair", note: "concedes" }] },
          { post_number: 5, tone: "hostile", claim_ids: ["c1"], annotation: "claim: end it", signals: [{ signal: "B3", span: "idiot", note: "contempt" }, { signal: "D2", span: "I work at ZF", note: "discloses" }] },
          { post_number: 6, tone: "calm", claim_ids: ["c2"], annotation: null, signals: [] },
        ],
        mind_changes: [{ post_number: 4, changed_by: [2], span: "fair", note: "concedes" }],
      },
      already_answered: [{ post: 5, claim_id: "c1", answered_at: 2 }],
    },
  };
}

test("calm folds conduct signals and shows clean posts", () => {
  const model = threadModel(sampleThread(), vocabulary);
  assert.deepEqual(calmDecision(model, 1, new Set()), { mode: "full", reasons: [], keptBecause: [] });
  assert.equal(calmDecision(model, 3, new Set()).mode, "hidden");
  const folded = calmDecision(model, 5, new Set());
  assert.equal(folded.mode, "folded");
  assert.deepEqual(folded.reasons.map((reason) => reason.id), ["B3"]);
});

test("novelty guarantee: the first statement of a claim is never folded, even when muted or flagged", () => {
  const model = threadModel(sampleThread(), vocabulary);
  const decision = calmDecision(model, 6, new Set(["dave"]));
  assert.equal(decision.mode, "full");
  assert.deepEqual(decision.reasons.map((reason) => reason.id), ["muted", "C2", "C1"]);
  assert.deepEqual(decision.keptBecause, ["first statement of c2"]);
  assert.equal(calmDecision(model, 1, new Set(["op"])).mode, "full");
});

test("mind changes and positive signals are protected; restatements by muted authors fold", () => {
  const model = threadModel(sampleThread(), vocabulary);
  assert.deepEqual(protections(model, 4), ["a change of mind"]);
  assert.deepEqual(protections(model, 2), ["asks for evidence"]);
  assert.deepEqual(calmDecision(model, 2, new Set(["bob"])), { mode: "full", reasons: [{ id: "muted", name: "you muted bob", span: null, detail: null }], keptBecause: ["asks for evidence"] });
  assert.equal(calmDecision(model, 5, new Set(["dave"])).mode, "folded");
});

test("property: no muting choice ever folds the first statement of any claim", () => {
  const model = threadModel(sampleThread(), vocabulary);
  const authors = ["op", "bob", "carol", "dave"];
  for (let mask = 0; mask < 1 << authors.length; mask += 1) {
    const muted = new Set(authors.filter((_, index) => mask & (1 << index)));
    for (const claim of model.claims.values()) assert.equal(calmDecision(model, claim.first_post, muted).mode, "full", `mask ${mask}`);
  }
});

test("chips: at most two caution chips, model first; positives and disclosures separate; C2 never a chip", () => {
  const model = threadModel(sampleThread(), vocabulary);
  const five = chips(model, 5);
  assert.deepEqual(five.caution.map((chip) => chip.id), ["B3", "A5"]);
  assert.equal(five.hiddenCaution, 0);
  assert.deepEqual(five.disclosure.map((chip) => chip.id), ["D2"]);
  assert.match(five.caution[1].detail, /already answered at #2$/);
  assert.deepEqual(chips(model, 6).caution.map((chip) => chip.id), ["C1"]);
  assert.deepEqual(chips(model, 2).positive.map((chip) => chip.id), ["E1"]);
});

test("coverage counts what muting hides and what the guarantee keeps", () => {
  const model = threadModel(sampleThread(), vocabulary);
  assert.deepEqual(coverage(model, new Set(["dave"])), { authors: ["dave"], posts: 2, share: 0.4, claimsOnlyByMuted: 1, keptByNovelty: 1 });
  assert.deepEqual(coverage(model, new Set()), { authors: [], posts: 0, share: 0, claimsOnlyByMuted: 0, keptByNovelty: 0 });
});

test("claim cards are ordered by first appearance with participants", () => {
  const cards = claimCards(threadModel(sampleThread(), vocabulary));
  assert.deepEqual(cards.map((card) => [card.claim.claim_id, card.participants, card.statement.number, card.rebuttal?.number ?? null]), [["c1", ["op", "dave"], 1, 2], ["c2", ["dave"], 6, null]]);
});

test("volume nudge respects both thresholds", () => {
  assert.deepEqual(volumeNudge(sampleThread(), vocabulary), { author: "op", posts: 2, share: 0.4 });
  assert.equal(volumeNudge(sampleThread(), { ...vocabulary, volume_nudge: { share: 0.5, min_posts: 4 } }), null);
  assert.equal(volumeNudge(sampleThread(), { ...vocabulary, volume_nudge: { share: 0.15, min_posts: 6 } }), null);
});

test("mutes expire after 30 days and can be removed", () => {
  const now = 1_000_000;
  const stored = withMute({}, "dave", now);
  assert.deepEqual([...activeMutes(stored, now + 29 * 86_400_000)], ["dave"]);
  assert.deepEqual([...activeMutes(stored, now + 30 * 86_400_000)], []);
  assert.deepEqual(withoutMute(stored, "dave"), {});
});

test("unknown signal ids fail loudly", () => {
  const thread = sampleThread();
  thread.posts[0].signals = [{ signal: "Z9", span: null, detail: "?" }];
  assert.throws(() => chips(threadModel(thread, vocabulary), 1), { message: 'unknown signal id "Z9"' });
});

test("excerpt cuts at a word boundary", () => {
  assert.equal(excerpt("one two three four five", 100), "one two three four five");
  assert.equal(excerpt("alpha beta gamma delta", 14), "alpha beta…");
});
