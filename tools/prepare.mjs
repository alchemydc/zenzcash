// Writes one directory per model job under work/jobs/: job.json (what the output must
// cover) and view.md (the posts, as the model reads them). Usage: node tools/prepare.mjs

import { join } from "node:path";
import { JOBS_DIR } from "./lib/config.mjs";
import { writeFileAtomic, writeJsonAtomic } from "./lib/fsio.mjs";
import { loadTopic, topicJobs } from "./lib/topic.mjs";
import { promptText } from "./lib/prompt.mjs";
import { structuredPrompt } from './lib/model-input.mjs';

const { threads } = loadTopic();
for (const { job, view } of topicJobs(threads)) {
  const directory = join(JOBS_DIR, job.name);
  writeJsonAtomic(join(directory, "job.json"), job);
  writeFileAtomic(join(directory, "view.md"), `${view}\n`);
  writeFileAtomic(join(directory, "prompt.md"), structuredPrompt({job,source:JSON.parse(view),prompt:promptText(job.task,{initial:true})}));
  const size = job.task === "marks" ? `${job.expected.length} posts` : `${job.citable.length} citable posts`;
  console.log(`${job.name}: ${size}, ${view.length} characters`);
}
