// Writes one directory per model job under work/jobs/: job.json (what the output must
// cover) and view.md (the posts, as the model reads them). Usage: node tools/prepare.mjs

import { join } from "node:path";
import { JOBS_DIR } from "./lib/config.mjs";
import { writeFileAtomic } from "./lib/fsio.mjs";
import { loadTopic, topicJobs } from "./lib/topic.mjs";
import { promptText } from "./lib/prompt.mjs";
import { structuredPrompt } from './lib/model-input.mjs';
import { writeReviewJson } from './lib/review-display.mjs';
import { visibleText } from '../site/js/source-characters.js';

export function prepareJob(directory,{job,view},prompt) {
  const request=structuredPrompt({job,source:JSON.parse(view),prompt});
  writeReviewJson(join(directory, "job.json"), job);
  writeFileAtomic(join(directory, "view.md"), `${visibleText(view)}\n`);
  writeFileAtomic(join(directory, "prompt.md"), request);
}

if(import.meta.main){
  const { threads } = loadTopic();
  for (const item of topicJobs(threads)) {
    prepareJob(join(JOBS_DIR,item.job.name),item,promptText(item.job.task,{initial:true}));
    const size=item.job.task==='marks'?`${item.job.expected.length} posts`:`${item.job.citable.length} citable posts`;
    console.log(`${item.job.name}: ${size}, ${visibleText(item.view).length} characters`);
  }
}
