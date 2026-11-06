import { join } from "node:path";
import { existsSync } from 'node:fs';
import { readJsonStrict } from './fsio.mjs';
import { analyzeCandidate, validateCandidate,frozenJobs,previewAnalysis } from "./refresh-analysis.mjs";
import { importSnapshot } from "./import-preview.mjs";
import { importAudit,estimateAnalysis,historicalAttempts,writeImportAudit } from './import-audit.mjs';
import { assertLocalPreparation } from './preparation-boundary.mjs';
import { datedReplies } from './reply-window.mjs';
import { expandedJobs } from './summary-sections.mjs';

export async function analyzeImportTopics({ state, root, maxCalls, modelRun, save, progress }) {
  assertLocalPreparation(root);
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1) throw new Error(`Analysis requires a positive global call limit, received ${maxCalls}`);
  let calls = 0;
  const run = async options => {
    if (calls >= maxCalls) throw Object.assign(new Error(`Global call limit ${maxCalls} reached; review preview then resume analyze with an explicit limit`),{notInvoked:true});
    calls++;
    return modelRun(options);
  };
  const settings = state.settings;
  const audit=importAudit(join(root,state.id));
  const history=historicalAttempts(root,state.id);
  const estimates=state.topics.map(topic=>{const snapshot=importSnapshot(join(root,state.id),topic);return {id:topic.id,dated_replies:datedReplies(snapshot).size,jobs:previewAnalysis({directory:join(root,state.id,topic.id,'candidate'),cacheDirectory:join(root,'cache'),snapshot,prompts:settings.prompts,agent:'codex',model:settings.model})};});
  const estimate=()=>{
    const forecast=estimateAnalysis(estimates.filter(t=>!['analyzed','published'].includes(state.topics.find(s=>s.id===t.id).status)),history,settings.concurrency??1);
    audit.record('analysis.estimate',{status:'complete',...forecast});
    progress(`Estimated remaining analysis: ${forecast.lower_ms===null?'unknown (no timing samples)':`${Math.ceil(forecast.lower_ms/60000)}–${Math.ceil(forecast.upper_ms/60000)} minutes`}; ${forecast.remaining_jobs} uncached jobs before retries.`);
    writeImportAudit(state,root,{topics:state.topics.map(topic=>{
      const manifest=join(root,state.id,topic.id,'candidate','manifest.json');
      const estimate=estimates.find(t=>t.id===topic.id);
      return {id:topic.id,dated_replies:estimate.dated_replies,attempts:existsSync(manifest)?readJsonStrict(manifest).attempts:[],jobs:estimate.jobs.map(job=>['analyzed','published'].includes(topic.status)&&!['accepted-reply','accepted-summary'].includes(job.cache)?{...job,cache:'reusable'}:job)};
    })},()=>{});
  };
  estimate();
  for (const topic of [...state.topics].sort((a,b)=>a.posts-b.posts || a.threadIds[0]-b.threadIds[0])) {
    if (["analyzed","published"].includes(topic.status)) continue;
    const snapshot = importSnapshot(join(root,state.id),topic);
    const candidate = join(root,state.id,topic.id,"candidate");
    const started = performance.now();
    const plans=expandedJobs(frozenJobs(snapshot,settings.prompts));
    progress(`Codex: ${topic.id}, ${topic.visible} visible posts; ${plans.filter(p=>p.reuse).length} retained replies and ${plans.filter(p=>p.summaryReuse).length} retained summaries (no model calls), ${plans.filter(p=>!p.summaryReuse&&p.job.task==='summary').length} fresh summary, ${plans.filter(p=>!p.reuse&&p.job.task==='marks').length} reply batches`);
    topic.analysis = await analyzeCandidate({directory:candidate,cacheDirectory:join(root,"cache"),snapshot,prompts:settings.prompts,agent:"codex",model:settings.model,maxJobs:settings.maxCallsPerTopic,timeoutSeconds:settings.timeoutSeconds,budget:0,run,progress,concurrency:settings.concurrency});
    const checked = await audit.measure('analysis.validation',{topic:topic.id},()=>validateCandidate(candidate,snapshot,settings.prompts));
    topic.analysis_ms = performance.now()-started;
    audit.record('analysis.topic',{topic:topic.id,status:'complete',elapsed_ms:topic.analysis_ms});
    topic.title = checked.data.topic.card.title;
    topic.status = "analyzed";
    history.push(...topic.analysis.attempts);
    save();
    estimate();
  }
  return calls;
}
