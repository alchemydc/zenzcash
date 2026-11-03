import { join } from "node:path";
import { analyzeCandidate, validateCandidate,frozenJobs } from "./refresh-analysis.mjs";
import { importSnapshot } from "./import-preview.mjs";

export async function analyzeImportTopics({ state, root, maxCalls, modelRun, save, progress }) {
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1) throw new Error(`Analysis requires a positive global call limit, received ${maxCalls}`);
  let calls = 0;
  const run = async options => {
    if (calls >= maxCalls) throw new Error(`Global call limit ${maxCalls} reached; review preview then resume analyze with an explicit limit`);
    calls++;
    return modelRun(options);
  };
  const settings = state.settings;
  for (const topic of [...state.topics].sort((a,b)=>a.posts-b.posts || a.threadIds[0]-b.threadIds[0])) {
    if (["analyzed","published"].includes(topic.status)) continue;
    const snapshot = importSnapshot(join(root,state.id),topic);
    const candidate = join(root,state.id,topic.id,"candidate");
    const started = Date.now();
    const plans=frozenJobs(snapshot,settings.prompts);
    progress(`Codex: ${topic.id}, ${topic.visible} visible posts; ${plans.filter(p=>p.reuse).length} retained replies (no model calls), ${plans.filter(p=>!p.reuse&&p.job.task==='summary').length} summary, ${plans.filter(p=>!p.reuse&&p.job.task==='marks').length} reply batches`);
    topic.analysis = await analyzeCandidate({directory:candidate,cacheDirectory:join(root,"cache"),snapshot,prompts:settings.prompts,agent:"codex",model:settings.model,maxJobs:settings.maxCallsPerTopic,timeoutSeconds:settings.timeoutSeconds,budget:0,run,progress,concurrency:settings.concurrency});
    const checked = validateCandidate(candidate,snapshot,settings.prompts);
    topic.analysis_ms = Date.now()-started;
    topic.title = checked.data.topic.card.title;
    topic.status = "analyzed";
    save();
  }
  return calls;
}
