// Loads the ZCG topic's threads from the snapshot and derives its model jobs. Shared by
// prepare (writes the jobs), check/accept (validate outputs) and build (re-derives the
// views to prove each accepted result still matches its input).

import { JOB_CHARACTER_BUDGET, SNAPSHOT_DIR, TOPIC } from "./config.mjs";
import { marksJobs, summaryJob } from "./jobs.mjs";
import { readManifest, readThread } from "./snapshot.mjs";

export function loadTopic() {
  const manifest = readManifest(SNAPSHOT_DIR);
  const threads = TOPIC.threadIds.map((id) => readThread(SNAPSHOT_DIR, manifest, id));
  return { snapshotAt: manifest.finishedAt, threads };
}

export function topicJobs(threads) {
  return [...threads.flatMap((thread) => marksJobs(thread, JOB_CHARACTER_BUDGET)), summaryJob(TOPIC.id, threads)];
}
