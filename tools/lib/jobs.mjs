// Model jobs: what each subagent (or, later, an API call) is given. A job is a prompt file,
// a markdown view of the posts, and a job.json naming exactly which posts the output must
// cover. Everything here is a pure function of the threads, so views can be re-derived and
// compared at build time.

import { createHash } from "node:crypto";

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

export const postKey = (topicId, number) => `${topicId}/${number}`;

function quoteLabel(source) {
  if (source === null) return "quoting";
  return source.post === null ? `quoting @${source.username}` : `quoting @${source.username} t/${source.topic}#${source.post}`;
}

function clip(text, limit) {
  return limit === null || text.length <= limit ? text : `${text.slice(0, limit)} …[quote clipped]`;
}

function postView(topicId, post, { focus, quoteLimit }) {
  const marker = focus !== null && focus.has(post.number) ? "▶ " : "";
  const reply = post.reply_to === null ? "" : ` · replying to #${post.reply_to}`;
  const head = `## ${marker}${postKey(topicId, post.number)} · @${post.username} · ${post.created_at.slice(0, 16).replace("T", " ")} UTC${reply}`;
  if (post.hidden) return `${head}\n[Hidden by the forum community. No text, and no entry needed.]`;
  const body = post.segments.map((segment) => (segment.kind === "text"
    ? segment.text
    : `[${quoteLabel(segment.source)}]\n${clip(segment.text, quoteLimit).split("\n").map((line) => `> ${line}`).join("\n")}\n[end quote]`));
  return [head, ...body].join("\n\n");
}

export function threadView(thread, options) {
  return [`# Thread t/${thread.id}: ${thread.title}`, ...thread.posts.map((post) => postView(thread.id, post, options))].join("\n\n");
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

export function marksJobs(thread, budget) {
  return chunkThread(thread, budget).map((numbers) => {
    const from = numbers[0];
    const to = numbers.at(-1);
    const focus = new Set(numbers);
    return {
      job: { task: "marks", name: `marks-${thread.id}-${from}-${to}`, topic_id: thread.id, expected: numbers },
      view: [
        `You write entries for the ${numbers.length} posts marked ▶ (t/${thread.id} #${from} to #${to}). Every other post is context only.`,
        threadView(thread, { focus, quoteLimit: null }),
      ].join("\n\n"),
    };
  });
}

export function summaryJob(topicId, threads) {
  return {
    job: { task: "summary", name: `summary-${topicId}`, topic: topicId, citable: threads.flatMap((thread) => visible(thread).map((post) => postKey(thread.id, post.number))) },
    view: threads.map((thread) => threadView(thread, { focus: null, quoteLimit: 300 })).join("\n\n"),
  };
}
