import { sha256, summaryJob, marksJobDefinitions, threadView, postKey } from "./jobs.mjs";
import { JOB_CHARACTER_BUDGET, REFRESH_JOB_POST_LIMIT } from "./config.mjs";
import { RUBRIC_VERSION } from "../../site/js/rubric.js";
import { validateMarks } from "./validate-marks.mjs";
import { isDeepStrictEqual } from "node:util";
import { summaryReuse } from './summary-reuse.mjs';
import { BATCH_REPAIR_POLICY } from './batch-repair.mjs';
import { MODEL_INPUT_FORMAT, sourceRecords } from './model-input.mjs';
import { historicalThreadView } from './historical-view.mjs';

export const REPLY_ANALYSIS_POLICY = "reply-reuse-v1";

export function sameReplyContent(left,right) {
  const content=post=>[post.raw,post.own_text,post.segments,post.reply_to];
  return isDeepStrictEqual(content(left),content(right));
}

export function analysisBaseline(data) {
  if (data === null) return null;
  return {release:data.release_id,issues:data.topic.issues,threads:data.topic.threads.map(thread=>({
    id:thread.id,posts:thread.posts.map(post=>({number:post.number,raw:post.raw,own_text:post.own_text,segments:post.segments,
      reply_to:post.reply_to,username:post.author,created_at:post.created_at,hidden:post.hidden,
      analysis:post.analysis,analysis_run:post.analysis_run})),
  }))};
}

function priorEntries(snapshot) {
  const baseline=snapshot.analysisBaseline;
  const entries=new Map();
  if (baseline === null) return entries;
  if (!baseline || !Array.isArray(baseline.threads) || !Array.isArray(baseline.issues)) throw new Error("Invalid frozen analysis baseline");
  for(const thread of baseline.threads) for(const post of thread.posts) {
    if(post.hidden)continue;
    const key=postKey(thread.id,post.number);
    if(entries.has(key))throw new Error(`Duplicate baseline reply ${key}`);
    entries.set(key,{thread,post});
  }
  return entries;
}

export function reusableReplyPlans(snapshot,prompts) {
  if(snapshot.batchRepairPolicy!==undefined&&snapshot.batchRepairPolicy!==BATCH_REPAIR_POLICY)throw new Error(`Unknown batch repair policy ${snapshot.batchRepairPolicy}`);
  const prior=priorEntries(snapshot), plans=[];
  const format=snapshot.modelInputFormat??null;
  const overview=summaryJob(snapshot.topic,snapshot.threads,format);
  overview.job.adaptive=true;
  overview.job.import_run=snapshot.importRun;
  if(typeof snapshot.importRun!=="string"||!snapshot.importRun)throw new Error("Incremental summary requires a frozen import run");
  overview.view += "\n\nSummarize the entire supplied discussion afresh. New replies do not have to appear in the summary if they add nothing material. Preserve a prior point ID only when that argument survives; do not manufacture additions to justify this update.";
  if(snapshot.previousSummary)overview.view+=`\n\nPrevious question/point IDs for continuity only (not evidence or a requirement to retain prominence):\n${JSON.stringify(snapshot.previousSummary)}`;
  const retained=summaryReuse(snapshot,prompts.summary,overview.job);
  plans.push({...overview,prompt:prompts.summary,...(retained===null?{}:{summaryReuse:retained})});
  for(const thread of snapshot.threads) {
    const pending=[];
    for(const post of thread.posts) {
      if(post.hidden)continue;
      const old=prior.get(postKey(thread.id,post.number));
      if(old && sameReplyContent(old.post,post)) {
        const output={task:"marks",topic_id:thread.id,rubric_version:RUBRIC_VERSION,posts:[old.post.analysis]};
        const job={task:"marks",name:`reuse-${thread.id}-${post.number}`,topic_id:thread.id,expected:[post.number],issues:old.post.analysis.issue_ids.map(id=>({id}))};
        const problems=validateMarks(output,job,old.thread,snapshot.analysisBaseline.threads);
        if(problems.length)throw new Error(`Invalid accepted baseline ${thread.id}/${post.number}: ${problems.join("; ")}`);
        if(!old.post.analysis_run)throw new Error(`Missing accepted provenance ${thread.id}/${post.number}`);
        plans.push({job,view:"",prompt:prompts.marks,reuse:{output,provenance:old.post.analysis_run,release:snapshot.analysisBaseline.release}});
      } else pending.push(post);
    }
    if(!pending.length)continue;
    const jobs=marksJobDefinitions({...thread,posts:pending},JOB_CHARACTER_BUDGET,REFRESH_JOB_POST_LIMIT);
    for(const job of jobs) {
      const numbers=new Set(job.expected);
      const context=new Set(numbers);
      const byNumber=new Map(thread.posts.map(p=>[p.number,p]));
      // Include the opening post, nearby preceding posts, reply ancestors and quoted originals.
      const first=thread.posts.find(p=>!p.hidden);if(first)context.add(first.number);
      for(const number of numbers) {
        const index=thread.posts.findIndex(p=>p.number===number);
        for(const p of thread.posts.slice(Math.max(0,index-3),index))if(!p.hidden)context.add(p.number);
      }
      const queue=[...context];
      for(let index=0;index<queue.length;index++) {
        const p=byNumber.get(queue[index]);if(!p||p.hidden)continue;
        const refs=[p.reply_to,...(p.segments??[]).filter(s=>s.kind==="quote"&&s.source?.topic===thread.id).map(s=>s.source.post)];
        for(const number of refs)if(number!==null&&byNumber.has(number)&&!byNumber.get(number).hidden&&!context.has(number)){context.add(number);queue.push(number);}
      }
      const selected={...thread,posts:thread.posts.filter(p=>context.has(p.number)&&!p.hidden)};
      plans.push({job:{...job,issues:[],context_posts:selected.posts.map(p=>p.number)},prompt:prompts.marks,view:`Only the assigned new/edited replies need analysis. Context is bounded to the opening, nearby, reply-parent and quoted posts; do not claim the whole history was supplied. Record missing context honestly. Question tagging is independent: issue_ids must be [].\n${(format===null?historicalThreadView:threadView)(selected,{focus:numbers,quoteLimit:null})}`});
    }
  }
  return plans.map(item=>{
    const threads=item.job.task==='summary'?snapshot.threads:snapshot.threads.filter(thread=>thread.id===item.job.topic_id).map(thread=>({...thread,posts:thread.posts.filter(post=>(item.job.context_posts??item.job.expected).includes(post.number))}));
    item.source=sourceRecords(threads,item.job,{previous_summary:item.job.task==='summary'?snapshot.previousSummary??null:null});
    item.instructions=item.job.task==='summary'?'Summarize the entire supplied discussion afresh. New replies need not appear if they add nothing material. Previous summary IDs are continuity references, not evidence or a requirement to retain prominence. Preserve a prior point ID only when that argument survives.':'Only assigned new/edited replies need analysis. Context is bounded to the opening, nearby, reply-parent and quoted posts. Record missing context honestly. Question tagging is independent: issue_ids must be [].';
    if(format===MODEL_INPUT_FORMAT&&!item.reuse)item.view=JSON.stringify(item.source);
    if(typeof item.prompt!=="string"||!item.prompt.trim())throw new Error(`missing frozen ${item.job.task} prompt`);
    const promptHash=sha256(item.prompt),viewHash=sha256(`${item.view}\n`);
    const identity=[REPLY_ANALYSIS_POLICY,item.job,promptHash,viewHash,item.reuse??null];
    if(format===MODEL_INPUT_FORMAT&&!item.reuse)identity.push(format,item.instructions);
    if(snapshot.summaryReusePolicy!==undefined&&item.job.task==='summary')identity.push(snapshot.summaryReusePolicy,item.summaryReuse??null);
    if(snapshot.batchRepairPolicy!==undefined&&item.job.task==='marks'&&!item.reuse)identity.push(snapshot.batchRepairPolicy);
    return {...item,...(snapshot.batchRepairPolicy!==undefined&&item.job.task==='marks'&&!item.reuse?{repairPolicy:snapshot.batchRepairPolicy}:{}),promptHash,viewHash,input:sha256(JSON.stringify(identity))};
  });
}

export function reusedRecord(item) {
  const provenance=item.reuse.provenance;
  return {agent:"retained",model:provenance.model,input:item.input,task:"marks",job:item.job.name,prompt_sha256:provenance.prompt_sha256,view_sha256:provenance.view_sha256,output:item.reuse.output,reused_from:item.reuse,metrics:{runtime:provenance.runtime,reported_model:null,elapsed_ms:0,usage:null,cost_usd:null}};
}

export function validateReusedRecord(record,item) {
  if(JSON.stringify(record)!==JSON.stringify(reusedRecord(item)))throw new Error(`${item.job.name}: reused analysis differs from accepted baseline`);
}

export function retainedOutput(output,snapshot) {
  const visible=new Set(snapshot.threads.flatMap(t=>t.posts.filter(p=>!p.hidden).map(p=>postKey(t.id,p.number))));
  const result=structuredClone(output);
  for(const entry of result.posts) {
    const missing=entry.context_refs.filter(key=>!visible.has(key));
    entry.context_refs=entry.context_refs.filter(key=>visible.has(key));
    for(const claim of entry.claims){missing.push(...claim.support_refs.filter(key=>!visible.has(key)));claim.support_refs=claim.support_refs.filter(key=>visible.has(key));}
    if(missing.length)entry.context_limitations.push("Original assessment retained; some of its original context is no longer publicly available.");
  }
  return result;
}
