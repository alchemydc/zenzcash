// Accepts a checked job output into model/results/, recording what produced it.
// Usage: node tools/accept.mjs work/jobs/<job-name> --model claude-sonnet-5-5

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checkJob } from "./check-output.mjs";
import { PROMPTS_DIR, RESULTS_DIR } from "./lib/config.mjs";
import { writeJsonAtomic } from "./lib/fsio.mjs";
import { sha256 } from "./lib/jobs.mjs";
import { loadTopic } from "./lib/topic.mjs";

const [directory, flag, model] = process.argv.slice(2);
if (directory === undefined || flag !== "--model" || model === undefined) throw new Error("usage: node tools/accept.mjs work/jobs/<job-name> --model <model-id>");
const { job, output, problems } = checkJob(directory, loadTopic().threads);
if (problems.length > 0) throw new Error(`${directory}: output fails ${problems.length} check(s); run tools/check-output.mjs for the list`);
if (basename(directory) !== job.name) throw new Error(`${directory}: directory name does not match job name ${job.name}`);
const result = {
  task: job.task,
  job: job.name,
  backend: "subagent",
  model,
  prompt_sha256: sha256(readFileSync(join(PROMPTS_DIR, `${job.task}.md`), "utf8")),
  view_sha256: sha256(readFileSync(join(directory, "view.md"), "utf8")),
  output,
};
writeJsonAtomic(join(RESULTS_DIR, job.task, `${job.name}.json`), result);
console.log(`accepted ${job.name}`);
