// Reads threads from a crawl snapshot written by the archived crawler
// (archive/research-prototype/zforum/crawl.py). This is a boundary: fields are checked, not
// assumed, and anything unexpected stops the run naming the topic and post.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStrictJson } from "./strict-json.mjs";
import { ownText, segments } from "./quotes.mjs";

const readJson = (path) => parseStrictJson(readFileSync(path, "utf8"), path);

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function timestamp(value, where) {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) throw new Error(`${where}: expected a UTC timestamp, got ${JSON.stringify(value)}`);
  return value;
}

export function readManifest(snapshotDir) {
  const manifest = readJson(join(snapshotDir, "manifest.json"));
  if (manifest.format !== "zforum-crawl-1") throw new Error(`${snapshotDir}: unexpected manifest format ${JSON.stringify(manifest.format)}`);
  return { finishedAt: timestamp(manifest.finished_at, "manifest.finished_at"), topics: new Map(manifest.topics.map((entry) => [entry.id, entry])) };
}

export function parsePost(raw, topicId) {
  const where = `t/${topicId} post id ${raw.id}`;
  if (raw.post_type !== 1) throw new Error(`${where}: post_type ${raw.post_type} is not a regular post`);
  if (!Number.isInteger(raw.post_number) || raw.post_number < 1) throw new Error(`${where}: bad post_number ${JSON.stringify(raw.post_number)}`);
  if (typeof raw.username !== "string" || raw.username === "") throw new Error(`${where}: missing username`);
  if (typeof raw.hidden !== "boolean") throw new Error(`${where}: hidden must be a boolean`);
  // Flag-hidden posts carry no raw text at all (archive WORKLOG F-19); visible ones always do.
  if (raw.hidden === ("raw" in raw)) throw new Error(`${where}: raw must be present exactly when the post is not hidden`);
  if (!raw.hidden && typeof raw.raw !== "string") throw new Error(`${where}: raw must be a string`);
  const replyTo = raw.reply_to_post_number;
  if (replyTo !== null && !(Number.isInteger(replyTo) && replyTo >= 1)) throw new Error(`${where}: bad reply_to_post_number ${JSON.stringify(replyTo)}`);
  const text = raw.hidden ? null : raw.raw;
  return {
    number: raw.post_number,
    username: raw.username,
    created_at: timestamp(raw.created_at, `${where}.created_at`),
    reply_to: replyTo,
    hidden: raw.hidden,
    raw: text,
    own_text: text === null ? null : ownText(text),
    segments: text === null ? null : segments(text),
  };
}

export function readThread(snapshotDir, manifest, topicId) {
  const entry = manifest.topics.get(topicId);
  if (entry === undefined) throw new Error(`t/${topicId} is not in the snapshot ${snapshotDir}`);
  if (entry.scope.kind !== "full") throw new Error(`t/${topicId} was crawled with scope ${JSON.stringify(entry.scope)}, but a topic page needs the whole thread`);
  const topic = readJson(join(snapshotDir, entry.topic_file));
  const byId = new Map(topic.post_stream.posts.map((post) => [post.id, post]));
  for (const file of entry.post_files) for (const post of readJson(join(snapshotDir, file)).post_stream.posts) byId.set(post.id, post);
  const stream = topic.post_stream.stream;
  const missing = stream.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`t/${topicId}: posts ${missing.join(", ")} are in the stream but were not crawled`);
  const posts = stream.map((id) => parsePost(byId.get(id), topicId)).sort((a, b) => a.number - b.number);
  return { id: topicId, title: topic.title, slug: topic.slug, created_at: timestamp(topic.created_at, `t/${topicId}.created_at`), posts };
}
