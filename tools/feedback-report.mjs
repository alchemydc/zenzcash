// Prints the restatement feedback readers have given (SPEC §7, D-50). Readers never see each
// other's answers; this is how the zforum team reads them.
// Usage: node tools/feedback-report.mjs [path-to-older-feedback.json]

import { readFileSync } from "node:fs";
import { parseAnswers } from "../site/js/logic.js";
import { FEEDBACK_MAX } from "../site/js/vocab.js";
import { parseStrictJson } from "./lib/strict-json.mjs";
import { currentFeedbackPath } from "./lib/feedback-path.mjs";

// The server writes this format (server/src/feedback.rs, `FORMAT`).
export const FEEDBACK_FORMAT = "zforum-feedback-1";
const POST_KEY = /^[1-9][0-9]*\/[1-9][0-9]*$/;
const READER_ID = /^[0-9a-f]{32}$/;
const FEEDBACK = [
  { id: "emotions", label: "Emotions", question: "This restatement helped me avoid negative feelings." },
  { id: "head", label: "Head", question: "I got something out of this that I wouldn't have had if it wasn't restated." },
];

const scale = (values) => ({ count: values.length, mean: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length });
const byPostKey = (a, b) => {
  const [topicA, postA] = a.split("/").map(Number);
  const [topicB, postB] = b.split("/").map(Number);
  return topicA - topicB || postA - postB;
};

// Per restated post, and over all of them: how many readers answered each question, and the
// mean answer. Every reader counts once per post.
export function summarizeFeedback(store) {
  const fail = (message) => {
    throw new Error(`feedback store is invalid: ${message}`);
  };
  if (store === null || typeof store !== "object" || Array.isArray(store) || JSON.stringify(Object.keys(store).sort()) !== '["entries","format"]') fail(`expected {format, entries}, got keys ${JSON.stringify(Object.keys(store ?? {}))}`);
  if (store.format !== FEEDBACK_FORMAT) fail(`format is ${JSON.stringify(store.format)}, expected ${JSON.stringify(FEEDBACK_FORMAT)}`);
  const all = Object.fromEntries(FEEDBACK.map((item) => [item.id, []]));
  const posts = Object.keys(store.entries).sort(byPostKey).map((key) => {
    if (!POST_KEY.test(key)) fail(`${JSON.stringify(key)} is not a post key`);
    const readers = Object.entries(store.entries[key]);
    if (readers.length === 0) fail(`${key} has no readers; the server never writes that`);
    const answers = readers.map(([reader, value]) => {
      if (!READER_ID.test(reader)) fail(`${key}: ${JSON.stringify(reader)} is not a reader id`);
      return parseAnswers(value, `${key}/${reader}`, 0);
    });
    const row = { key, readers: readers.length };
    for (const item of FEEDBACK) {
      const values = answers.map((answer) => answer[item.id]).filter((value) => value !== null);
      all[item.id].push(...values);
      row[item.id] = scale(values);
    }
    return row;
  });
  return { posts, overall: Object.fromEntries(FEEDBACK.map((item) => [item.id, scale(all[item.id])])) };
}

const cell = ({ count, mean }) => (count === 0 ? "—" : `${mean.toFixed(1)}/${FEEDBACK_MAX} (${count})`);

export function formatReport(summary) {
  if (summary.posts.length === 0) return "No restatement feedback yet.";
  const header = ["post", "readers", ...FEEDBACK.map((item) => item.label.toLowerCase())];
  const rows = [
    ...summary.posts.map((row) => [row.key, String(row.readers), ...FEEDBACK.map((item) => cell(row[item.id]))]),
    ["all posts", "", ...FEEDBACK.map((item) => cell(summary.overall[item.id]))],
  ];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const line = (row) => row.map((text, column) => text.padEnd(widths[column])).join("  ").trimEnd();
  return [
    line(header),
    ...rows.map(line),
    "",
    "Each answer cell is the mean score (number of readers who answered).",
    ...FEEDBACK.map((item) => `${item.label}: ${item.question}`),
  ].join("\n");
}

if (import.meta.main) {
  const path = process.argv[2] ?? currentFeedbackPath();
  // The server creates the file with the first answer, so its absence means none yet.
  let text = null;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  console.log(text === null ? `No restatement feedback yet (${path} does not exist).` : formatReport(summarizeFeedback(parseStrictJson(text, path))));
}
