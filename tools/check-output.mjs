// Checks a job's output.json against the acceptance gate and prints every problem.
// Usage: node tools/check-output.mjs work/jobs/<job-name>
// Exit status 0 means the output would be accepted.

import { join } from "node:path";
import { readJsonStrict } from "./lib/fsio.mjs";
import { loadTopic } from "./lib/topic.mjs";
import { validateMarks, validateSummary } from "./lib/validate.mjs";

export function checkJob(directory, threads) {
  const job = readJsonStrict(join(directory, "job.json"));
  const output = readJsonStrict(join(directory, "output.json"));
  switch (job.task) {
    case "marks": return { job, output, problems: validateMarks(output, job, threads.find((thread) => thread.id === job.topic_id)) };
    case "summary": return { job, output, problems: validateSummary(output, job, threads) };
    default: throw new Error(`${directory}/job.json: unknown task ${JSON.stringify(job.task)}`);
  }
}

if (import.meta.main) {
  const directory = process.argv[2];
  if (directory === undefined) throw new Error("usage: node tools/check-output.mjs work/jobs/<job-name>");
  const { problems } = checkJob(directory, loadTopic().threads);
  if (problems.length === 0) {
    console.log("OK: the output passes every check.");
  } else {
    console.log(`${problems.length} problem(s):`);
    for (const problem of problems) console.log(`- ${problem}`);
    process.exitCode = 1;
  }
}
