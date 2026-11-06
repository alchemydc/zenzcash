// Deterministic structured source and target definitions; historical views are used
// only to reconstruct existing artifact hashes (D-134).

import { createHash } from "node:crypto";
import { sourceRecords, MODEL_INPUT_FORMAT } from './model-input.mjs';
import { historicalThreadView } from './historical-view.mjs';

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

export const postKey = (topicId, number) => `${topicId}/${number}`;

export function threadView(thread, options) {
  return JSON.stringify(sourceRecords([thread],{task:'marks',topic_id:thread.id,expected:options.focus===null?[]:[...options.focus]}));
}

const visible = (thread) => thread.posts.filter((post) => !post.hidden);

// Splits a thread's visible posts into the fewest runs that each stay near the budget,
// balanced by characters, keeping post order.
export function chunkThread(thread, budget) {
  const posts = visible(thread);
  const total = posts.reduce((sum, post) => sum + post.raw.length, 0);
  const count = Math.max(1, Math.ceil(total / budget));
  const target = total / count;
  const chunks = [[]];
  let filled = 0;
  for (const post of posts) {
    if (filled >= target * chunks.length && chunks.length < count) chunks.push([]);
    chunks.at(-1).push(post.number);
    filled += post.raw.length;
  }
  return chunks;
}

export function marksJobs(thread, budget, maxPosts = Infinity, format = MODEL_INPUT_FORMAT) {
  if(![null,MODEL_INPUT_FORMAT].includes(format))throw new Error(`Unknown model input format ${format}`);
  if (!(maxPosts === Infinity || (Number.isInteger(maxPosts) && maxPosts > 0))) throw new Error(`invalid marks job post limit ${maxPosts}`);
  const chunks = chunkThread(thread, budget).flatMap(numbers => {
    if (maxPosts === Infinity) return [numbers];
    return Array.from({length: Math.ceil(numbers.length / maxPosts)}, (_,index) => numbers.slice(index * maxPosts,(index + 1) * maxPosts));
  });
  return chunks.map((numbers) => {
    const from = numbers[0];
    const to = numbers.at(-1);
    const focus = new Set(numbers);
    return {
      job: { task: "marks", name: `marks-${thread.id}-${from}-${to}`, topic_id: thread.id, expected: numbers },
      view: format === MODEL_INPUT_FORMAT ? threadView(thread,{focus,quoteLimit:null}) : [
        `You write entries for the ${numbers.length} posts marked ▶ (t/${thread.id} #${from} to #${to}). Every other post is context only.`,
        historicalThreadView(thread, { focus, quoteLimit: null }),
      ].join("\n\n"),
    };
  });
}

export function summaryJob(topicId, threads, format = MODEL_INPUT_FORMAT) {
  if(![null,MODEL_INPUT_FORMAT].includes(format))throw new Error(`Unknown model input format ${format}`);
  return {
    job: { task: "summary", name: `summary-${topicId}`, topic: topicId, citable: threads.flatMap((thread) => visible(thread).map((post) => postKey(thread.id, post.number))) },
    view: format === MODEL_INPUT_FORMAT ? JSON.stringify(sourceRecords(threads,{task:'summary'})) : threads.map((thread) => historicalThreadView(thread, { focus: null, quoteLimit: 300 })).join("\n\n"),
  };
}
