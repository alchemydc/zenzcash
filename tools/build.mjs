// Assembles site/data/zcg.json from the snapshot, the account dates and the accepted model
// results. Every result is re-checked: its prompt and input must be the ones that exist
// now, and its output must pass the acceptance gate again. Any problem stops the build.
// Usage: node tools/build.mjs

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNTS_FILE, FORUM_ORIGIN, RESULTS_DIR, SITE_DATA_FILE } from "./lib/config.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { postKey, sha256 } from "./lib/jobs.mjs";
import { loadTopic, topicJobs } from "./lib/topic.mjs";
import { validateSummary } from "./lib/validate.mjs";
import { validateMarks } from "./lib/validate-marks.mjs";
import { promptHash } from "./lib/prompt.mjs";
import { MODEL_BACKENDS } from "./lib/provenance.mjs";
import { SITE_DATA_FORMAT } from "../site/js/vocab.js";
import { INTEREST_IDS } from "../site/js/vocab.js";
import { TONE_BANDS, SUPPORT_BANDS, AGE_BANDS, POST_VERSIONS, ids } from "../site/js/reader-options.js";

export const readingContract = () => ({ toneBands: ids(TONE_BANDS), supportBands: ids(SUPPORT_BANDS), ageBands: [...ids(AGE_BANDS), "custom"], postVersions: ids(POST_VERSIONS), preferredVersion: ["neutral", "original"], threadView: ["all", "thread"], postOrder: ["newest", "oldest"], interests: INTEREST_IDS });

const RESULT_KEYS = ["task", "job", "backend", "model", "prompt_sha256", "view_sha256", "output"];

function loadResult(job, view, threads) {
  const path = join(RESULTS_DIR, job.task, `${job.name}.json`);
  if (!existsSync(path)) return { missing: job.name };
  const result = readJsonStrict(path);
  const keys = Object.keys(result).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...RESULT_KEYS].sort())) throw new Error(`${path}: keys are ${keys.join(", ")}, expected ${RESULT_KEYS.join(", ")}`);
  if (!MODEL_BACKENDS.includes(result.backend) || typeof result.model !== "string" || result.model.trim() === "") throw new Error(`${path}: invalid model/backend provenance ${JSON.stringify({ model: result.model, backend: result.backend })}`);
  if (result.task !== job.task || result.job !== job.name) throw new Error(`${path}: is for ${result.task}/${result.job}, expected ${job.task}/${job.name}`);
  if (result.prompt_sha256 !== promptHash(job.task, { initial: true })) throw new Error(`${path}: produced with a different initial prompt or rubric for ${job.task}; re-run the job`);
  if (result.view_sha256 !== sha256(`${view}\n`)) throw new Error(`${path}: produced from different posts (input changed); re-run the job`);
  const problems = job.task === "marks"
    ? validateMarks(result.output, job, threads.find((thread) => thread.id === job.topic_id), threads)
    : validateSummary(result.output, job, threads);
  if (problems.length > 0) throw new Error(`${path}: fails the acceptance gate:\n- ${problems.join("\n- ")}`);
  return { result };
}

export function buildSiteData({ snapshotAt, threads }, accounts, results) {
  const marks = new Map();
  const runs = new Map();
  for (const result of results.filter((entry) => entry.task === "marks")) {
    for (const entry of result.output.posts) marks.set(postKey(result.output.topic_id, entry.post_number), entry);
    const provenance = { artifact_sha256: sha256(JSON.stringify(result)), input: result.input ?? null, request_sha256: result.request_sha256 ?? null, job: result.job, model: result.model, backend: result.backend, prompt_sha256: result.prompt_sha256, view_sha256: result.view_sha256, runtime: result.metrics?.runtime ?? null };
    for (const entry of result.output.posts) runs.set(postKey(result.output.topic_id, entry.post_number), provenance);
  }
  const summary = results.find((entry) => entry.task === "summary").output;
  const createdAt = new Map(threads.flatMap((thread) => thread.posts.map((post) => [postKey(thread.id, post.number), post.created_at])));
  const account = (username) => {
    const record = accounts[username];
    if (record === undefined) throw new Error(`no account record for @${username}; run node tools/fetch-accounts.mjs`);
    return record;
  };
  return {
    format: SITE_DATA_FORMAT,
    snapshot_at: snapshotAt,
    source_sha256: sha256(JSON.stringify(threads)),
    forum_origin: FORUM_ORIGIN,
    feedback_version: sha256(JSON.stringify([...marks].map(([key, entry]) => [key, entry.neutral_rendition]).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))),
    models: [...new Set(results.map((entry) => `${entry.model} (${entry.backend})`))].sort(),
    topic: {
      id: summary.topic,
      card: summary.card,
      headline: summary.headline,
      overview: summary.overview,
      points: summary.points.map((point) => ({ ...point, first_at: createdAt.get(point.cites[0]) })),
      issues: summary.issues,
      threads: threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        url: `${FORUM_ORIGIN}/t/${thread.slug}/${thread.id}`,
        created_at: thread.created_at,
        posts: thread.posts.map((post) => {
          const key = postKey(thread.id, post.number);
          const entry = post.hidden ? null : marks.get(key);
          if (entry === undefined) throw new Error(`no marks for ${key}`);
          return {
            key,
            number: post.number,
            author: post.username,
            account: account(post.username),
            created_at: post.created_at,
            reply_to: post.reply_to,
            hidden: post.hidden,
            raw: post.raw,
            own_text: post.own_text,
            segments: post.segments,
            analysis: entry,
            ...(runs.has(key) ? { analysis_run: runs.get(key) } : {}),
          };
        }),
      })),
    },
  };
}

if (import.meta.main) {
  const topic = loadTopic();
  const loaded = topicJobs(topic.threads).map(({ job, view }) => loadResult(job, view, topic.threads));
  const missing = loaded.filter((entry) => entry.missing !== undefined).map((entry) => entry.missing);
  if (missing.length > 0) throw new Error(`missing accepted results for: ${missing.join(", ")}`);
  const accounts = readJsonStrict(ACCOUNTS_FILE).accounts;
  writeJsonAtomic(SITE_DATA_FILE, buildSiteData(topic, accounts, loaded.map((entry) => entry.result)));
  writeJsonAtomic(join(SITE_DATA_FILE, "..", "reading-contract.json"), readingContract());
  console.log(`wrote ${SITE_DATA_FILE}`);
}
