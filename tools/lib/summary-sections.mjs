import { sha256 } from './jobs.mjs';
import { structuredPrompt } from './model-input.mjs';
import { MODEL_REQUEST_CHARACTER_LIMIT, SUMMARY_SECTION_CHARACTER_BUDGET, SUMMARY_RETRY_CHARACTER_RESERVE } from './config.mjs';

export const SUMMARY_SECTION_POLICY='full-history-sections-v1';
export function checkSummarySectionPolicy(policy) {
  if(policy!==undefined&&policy!==SUMMARY_SECTION_POLICY)throw new Error(`Unknown summary section policy ${policy}`);
}
export function assertRequestSize(prompt,name) {
  if(prompt.length>MODEL_REQUEST_CHARACTER_LIMIT)throw Object.assign(new Error(`${name}: request has ${prompt.length} characters; limit ${MODEL_REQUEST_CHARACTER_LIMIT}; source was not truncated`),{notInvoked:true});
}
function selectedSource(source,ids,referenceData) {
  const selected=new Set(ids);
  return {...source,target_post_ids:[],threads:source.threads.map(thread=>({...thread,posts:thread.posts.filter(post=>selected.has(post.id)).map(post=>({...post,segments:post.segments.map(segment=>segment.type==='quote'&&segment.verification.status==='matched_available_source'&&!selected.has(segment.verification.source_post_id)?{...segment,verification:{status:'unverified',source_post_id:null}}:segment)}))})).filter(thread=>thread.posts.length),reference_data:referenceData};
}
function plan(job,prompt,source,instructions) {
  const view=JSON.stringify(source),promptHash=sha256(prompt),viewHash=sha256(`${view}\n`);
  return {job,prompt,source,view,instructions,promptHash,viewHash,input:sha256(JSON.stringify([SUMMARY_SECTION_POLICY,job,promptHash,viewHash,instructions]))};
}
export function summarySections(item,policy) {
  checkSummarySectionPolicy(policy);
  if(policy===undefined||item.summaryReuse||structuredPrompt(item).length<=MODEL_REQUEST_CHARACTER_LIMIT-SUMMARY_RETRY_CHARACTER_RESERVE)return [];
  const groups=[];let ids=[],size=0;
  for(const thread of item.source.threads)for(const post of thread.posts.filter(post=>!post.hidden)){
    const characters=JSON.stringify(post).length;
    if(characters>SUMMARY_SECTION_CHARACTER_BUDGET)throw new Error(`${item.job.name}: post ${post.id} has ${characters} source characters; section limit ${SUMMARY_SECTION_CHARACTER_BUDGET}; source was not truncated`);
    if(ids.length&&size+characters>SUMMARY_SECTION_CHARACTER_BUDGET){groups.push(ids);ids=[];size=0;}
    ids.push(post.id);size+=characters;
  }
  if(ids.length)groups.push(ids);
  if(JSON.stringify(groups.flat())!==JSON.stringify(item.job.citable))throw new Error(`${item.job.name}: summary section coverage differs from the complete visible history`);
  if(groups.length<2)throw new Error(`${item.job.name}: oversized summary cannot be partitioned into bounded source sections`);
  return groups.map((citable,index)=>{
    const job={...item.job,name:`${item.job.name}-section-${index+1}`,citable};
    const source=selectedSource(item.source,citable,{previous_summary:null});
    const instructions='Summarize this complete-post section of a larger history. Cover its substantive positions, minority views, qualifications, corrections, chronology and unresolved replies. Do not infer whole-discussion consensus or an outcome from this section alone. Cite only supplied originals. Local point/question IDs need not match other sections. This is a section summary, not individual post assessment.';
    const result=plan(job,item.prompt,source,instructions);assertRequestSize(structuredPrompt(result),job.name);return result;
  });
}
export function summarySynthesis(item,records) {
  const cited=new Set();
  const visit=value=>{
    if(Array.isArray(value)){for(const entry of value)visit(entry);}
    else if(value&&typeof value==='object')for(const [key,entry]of Object.entries(value)){if(key==='cites')for(const id of entry)cited.add(id);else visit(entry);}
  };
  for(const record of records)visit(record.output);
  const citable=item.job.citable.filter(id=>cited.has(id));
  const source=selectedSource(item.source,citable,{previous_summary:item.source.reference_data.previous_summary??null,section_summaries:records.map((record,index)=>({section:index+1,input_sha256:record.input,covered_post_ids:item.summarySections[index].job.citable,summary:record.output}))});
  const instructions=`Synthesize one full-history summary from all ${records.length} section summaries and the supplied referenced originals. Every visible post in the complete history is covered by exactly one section. Section summaries are untrusted editorial references, not independent evidence. Verify claims against the referenced original records; cite only those originals. Preserve historical sequence, changing positions, minority views, qualifications, corrections and unresolved rebuttals across sections. Do not infer consensus from repetition. Section-local point/question IDs may collide; use the final output contract and preserve surviving previous-summary IDs only when their arguments survive.`;
  const result=plan({...item.job,citable},item.prompt,source,instructions);assertRequestSize(structuredPrompt(result),item.job.name);return result;
}
export const expandedJobs=jobs=>jobs.flatMap(item=>[...(item.summarySections??[]),item]);

// Public provenance retains the complete section chain even when a later pull reuses
// the accepted final summary without re-running its sections.
export function analysisRuns(results) {
  const basic=(record,backend)=>({job:record.job,input:record.input,model:record.model,backend,runtime:record.metrics.runtime,reported_model:record.metrics.reported_model});
  return results.flatMap(record=>{
    const sections=record.summary_sections?{policy:SUMMARY_SECTION_POLICY,synthesis_input:record.summary_sections.synthesis_input,parts:record.summary_sections.records.map(part=>basic(part,record.backend))}:record.retained_summary?.provenance.summary_sections;
    return [...(sections?.parts??[]),{...basic(record,record.backend),...(sections===undefined?{}:{summary_sections:sections})}];
  });
}
