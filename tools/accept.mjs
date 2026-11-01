// Accepts a checked job output into model/results/, recording what produced it.
// Usage: node tools/accept.mjs work/jobs/<job-name> --model <id> --backend primary-agent|subagent

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checkJob } from "./check-output.mjs";
import { PROMPTS_DIR, RESULTS_DIR } from "./lib/config.mjs";
import { writeJsonAtomic } from "./lib/fsio.mjs";
import { sha256 } from "./lib/jobs.mjs";
import { loadTopic } from "./lib/topic.mjs";

export function parseAcceptanceArgs(args) {
  const [directory, flag, model, backendFlag, backend] = args;
  if (args.length !== 5 || !directory || flag !== "--model" || !model?.trim() || backendFlag !== "--backend" || !["primary-agent", "subagent"].includes(backend)) {
    throw new Error(`invalid acceptance arguments ${JSON.stringify(args)}; usage: node tools/accept.mjs <job-directory> --model <model-id> --backend primary-agent|subagent`);
  }
  return { directory, model, backend };
}

if (import.meta.main) {
  const { directory, model, backend } = parseAcceptanceArgs(process.argv.slice(2));
  const { job, output, problems } = checkJob(directory, loadTopic().threads);
  if (problems.length > 0) throw new Error(`${directory}: output fails ${problems.length} check(s); run tools/check-output.mjs for the list`);
  if (basename(directory) !== job.name) throw new Error(`${directory}: directory name does not match job name ${job.name}`);
  const result = {
    task: job.task,
    job: job.name,
    backend,
    model,
    prompt_sha256: sha256(readFileSync(join(PROMPTS_DIR, `${job.task}.md`), "utf8")),
    view_sha256: sha256(readFileSync(join(directory, "view.md"), "utf8")),
    output,
  };
  writeJsonAtomic(join(RESULTS_DIR, job.task, `${job.name}.json`), result);
  console.log(`accepted ${job.name}`);
}
