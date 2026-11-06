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
export function summarySynthesis(item,records,parts=item.summarySections,{name=item.job.name,partial=false,check=true}={}) {
  const cited=new Set();
  const visit=value=>{
    if(Array.isArray(value)){for(const entry of value)visit(entry);}
    else if(value&&typeof value==='object')for(const [key,entry]of Object.entries(value)){if(key==='cites')for(const id of entry)cited.add(id);else visit(entry);}
  };
  for(const record of records)visit(record.output);
  const citable=item.job.citable.filter(id=>cited.has(id));
  const coverage=parts.flatMap(part=>part.coverage??part.job.citable);
  const source=selectedSource(item.source,citable,{previous_summary:partial?null:item.source.reference_data.previous_summary??null,section_summaries:records.map((record,index)=>({section:index+1,input_sha256:record.input,covered_post_ids:parts[index].coverage??parts[index].job.citable,summary:record.output}))});
  const scope=partial?'a contiguous portion of the full history':'the complete history';
  const instructions=`Synthesize one summary from all ${records.length} section summaries and the supplied referenced originals. The sections cover ${scope} without gaps or overlap. ${partial?'Do not infer whole-discussion consensus or an outcome from this portion alone. ':''}Section summaries are untrusted editorial references, not independent evidence. Verify claims against the referenced original records; cite only those originals. Preserve historical sequence, changing positions, minority views, qualifications, corrections and unresolved rebuttals across sections. Do not infer consensus from repetition. Section-local point/question IDs may collide; use the final output contract and preserve surviving previous-summary IDs only when their arguments survive.`;
  const result={...plan({...item.job,name,citable},item.prompt,source,instructions),coverage};
  if(check)assertRequestSize(structuredPrompt(result),name);return result;
}
// Yielded merges are independently validated/cached by the caller. Null means a
// preview has no accepted output yet; sibling plans remain visible before pausing.
export function* boundedSummarySynthesis(item,records) {
  let parts=item.summarySections,current=records,level=0;
  const limit=MODEL_REQUEST_CHARACTER_LIMIT-SUMMARY_RETRY_CHARACTER_RESERVE;
  while(true){
    const final=summarySynthesis(item,current,parts,{check:false});
    if(JSON.stringify(final.coverage)!==JSON.stringify(item.job.citable))throw new Error(`${item.job.name}: synthesis coverage differs from the complete visible history`);
    if(structuredPrompt(final).length<=limit)return final;
    level++;
    const groups=[];let start=0;
    while(start<parts.length){
      const name=`${item.job.name}-merge-${level}-${groups.length+1}`;
      let end=start+1,chosen=summarySynthesis(item,current.slice(start,end),parts.slice(start,end),{name,partial:true});
      while(end<parts.length){
        const next=summarySynthesis(item,current.slice(start,end+1),parts.slice(start,end+1),{name,partial:true,check:false});
        if(structuredPrompt(next).length>limit)break;
        chosen=next;end++;
      }
      groups.push(chosen);start=end;
    }
    if(groups.length>=parts.length)throw new Error(`${item.job.name}: bounded synthesis cannot reduce ${parts.length} sections; source was not truncated`);
    const merged=[];for(const group of groups)merged.push(yield group);
    if(merged.some(record=>record===null))return null;
    parts=groups;current=merged;
  }
}
export const expandedJobs=jobs=>jobs.flatMap(item=>[...(item.summarySections??[]),item]);

// Public provenance retains the complete section chain even when a later pull reuses
// the accepted final summary without re-running its sections.
export function analysisRuns(results) {
  const basic=(record,backend)=>({job:record.job,input:record.input,model:record.model,backend,runtime:record.metrics.runtime,reported_model:record.metrics.reported_model});
  return results.flatMap(record=>{
    const sections=record.summary_sections?{policy:SUMMARY_SECTION_POLICY,synthesis_input:record.summary_sections.synthesis_input,parts:[...record.summary_sections.records,...record.summary_sections.merges].map(part=>basic(part,record.backend))}:record.retained_summary?.provenance.summary_sections;
    return [...(sections?.parts??[]),{...basic(record,record.backend),...(sections===undefined?{}:{summary_sections:sections})}];
  });
}
