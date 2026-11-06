import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256 } from './jobs.mjs';
import { readJsonStrict,writeJsonAtomic } from './fsio.mjs';
import { misleadingCharacter,visibleText,writeReviewJson } from './review-display.mjs';
import { importAudit } from './import-audit.mjs';

export const DETECTOR_VERSION=readJsonStrict(new URL('./review-contract.json',import.meta.url)).detector_version;
export const FINDINGS_FILE='suspicious-content-review.json';
const META_FILE='source-scan.json', ACK_FILE='source-review-ack.json';
const RULES=[
  {id:'role-header',reason:'Apparent role, system or operator boundary',pattern:/(?:^|[\r\n\u2028\u2029])\s*(?:#{1,6}\s*)?(?:\[?(?:system|developer|assistant|operator)(?:\]|\s+(?:message|instructions?))?\s*:|<\/?(?:system|assistant|developer)>|##\s*(?:▶\s*)?\d+\/\d+\s*·)/gi},
  {id:'agent-instruction',reason:'Apparent instruction addressed to an agent or overriding instructions',pattern:/\b(?:ignore|disregard|override)\s+(?:all\s+|the\s+|your\s+)?(?:previous|prior|above|system|developer)\s+instructions?\b|\b(?:codex|claude|assistant|coding agent|reviewer agent)\s*[,;:]\s*(?:please\s+)?(?:run|execute|read|ignore|exclude|include|delete|publish|approve|use)\b/gi},
  {id:'credential-tool-command',reason:'Apparent request to access credentials or execute tools',pattern:/\b(?:read|print|send|upload|copy|exfiltrate|reveal)\b[^\r\n.!?]{0,100}\b(?:credentials?|api[-_ ]?keys?|access[-_ ]?tokens?|auth\.json|private keys?)\b|\b(?:run|execute|invoke)\s+(?:the\s+)?(?:shell|terminal|bash|curl|wget|tools?|commands?)\b/gi},
  {id:'review-directive',reason:'Apparent directive to change a review or publication decision',pattern:/\b(?:mark|classify|label)\s+(?:this|that|the)\s+(?:thread|post|discussion)\b[^\r\n.!?]{0,80}\b(?:frivolous|substantive|excluded|included|safe|approved)\b|\b(?:exclude|include|approve|reject|publish)\s+(?:this|that|the)\s+(?:thread|post|discussion|candidate)\b/gi},
];
const DISCLAIMER='Suspicious patterns are review cues, not proof of malicious intent. Benign AI/security discussions can match, and ordinary-language injections can evade detection. No configured patterns detected does not prove prompt injection is absent.';

export function scanFields(fields) {
  const findings=[];
  const add=(source,rule,start,end)=>findings.push({thread:source.thread,post:source.post,field:source.field,rule:rule.id,reason:rule.reason,start,end,offset_unit:'UTF-16 code units',excerpt:visibleText(source.text.slice(Math.max(0,start-80),Math.min(source.text.length,end+120)))});
  for(const source of fields) {
    if(typeof source.text!=='string')throw new Error(`Unscanned source field ${source.field}: not a string`);
    let offset=0;
    for(const character of source.text){if(misleadingCharacter.test(character))add(source,{id:'misleading-character',reason:'Control or formatting character can conceal or rearrange text'},offset,offset+character.length);offset+=character.length;}
    for(const rule of RULES){rule.pattern.lastIndex=0;for(const match of source.text.matchAll(rule.pattern))add(source,rule,match.index,match.index+match[0].length);}
  }
  return findings;
}
export function snapshotFields(snapshot,prefix='source') {
  const fields=[];
  for(const thread of snapshot.threads) {
    fields.push({thread:thread.id,post:null,field:`${prefix}.title`,text:thread.title});
    for(const post of thread.posts.filter(post=>!post.hidden)) {
      const key=`${thread.id}/${post.number}`;
      fields.push({thread:thread.id,post:key,field:`${prefix}.raw`,text:post.raw});
      for(const [index,segment]of post.segments.entries()) fields.push({thread:thread.id,post:key,field:`${prefix}.segments[${index}].${segment.kind}`,text:segment.text});
    }
  }
  return fields;
}
function candidateFields(data) {
  const fields=snapshotFields({threads:data.topic.threads},'candidate');
  const visit=(value,path,thread=null,post=null)=>{
    if(typeof value==='string')fields.push({thread,post,field:path,text:value});
    else if(Array.isArray(value))value.forEach((item,index)=>visit(item,`${path}[${index}]`,thread,post));
    else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))visit(item,`${path}.${key}`,thread,post);
  };
  for(const key of ['card','headline','overview','points','issues'])visit(data.topic[key],`candidate.${key}`);
  for(const thread of data.topic.threads)for(const post of thread.posts.filter(post=>!post.hidden))visit(post.analysis,'candidate.analysis',thread.id,post.key);
  return fields;
}
export function reviewInput({run,phase,discovery=[],openings=[],snapshots=[],candidates=[],unavailable=[]}) {
  const fields=[...discovery.filter(thread=>typeof thread.title==='string').map(thread=>({thread:thread.id,post:null,field:'discovery.title',text:thread.title})),
    ...openings.flatMap(thread=>[{thread:thread.id,post:null,field:'opening.title',text:thread.title},{thread:thread.id,post:`${thread.id}/1`,field:'opening.raw',text:thread.raw}]),
    ...snapshots.flatMap(snapshot=>snapshotFields(snapshot)),...candidates.flatMap(candidateFields)];
  const candidate_digest=sha256(JSON.stringify(candidates));
  const source_digest=sha256(JSON.stringify({run,phase,fields,unavailable,candidate_digest}));
  return {run,phase,source_digest,candidate_digest,fields,unavailable};
}
export function scanReview(directory,input) {
  const base={format:'zforum-source-scan-1',scan_id:randomUUID(),run:input.run,phase:input.phase,source_digest:input.source_digest,candidate_digest:input.candidate_digest,detector_version:DETECTOR_VERSION,
    coverage:{fields:input.fields.length,characters:input.fields.reduce((sum,field)=>sum+(typeof field.text==='string'?field.text.length:0),0),unavailable:input.unavailable},note:DISCLAIMER};
  const meta=join(directory,META_FILE),report=join(directory,FINDINGS_FILE);
  writeJsonAtomic(meta,{...base,status:'running',finding_count:null,report_digest:null});
  try {
    const findings=scanFields(input.fields);
    const complete={...base,status:input.unavailable.length?'incomplete':'complete',finding_count:findings.length};
    let report_digest=null;
    if(findings.length){writeReviewJson(report,{...complete,source_label:'untrusted_forum_content',findings});report_digest=sha256(readFileSync(report,'utf8'));}
    else if(complete.status==='complete')rmSync(report,{force:true});
    const metadata={...complete,report_digest};
    writeJsonAtomic(meta,metadata);
    const ack=join(directory,ACK_FILE);
    if(existsSync(ack)&&!sameAcknowledgment(readJsonStrict(ack),metadata))rmSync(ack);
    return metadata;
  } catch(error){writeJsonAtomic(meta,{...base,status:'failed',finding_count:null,report_digest:null,error:error.message});throw error;}
}
function sameAcknowledgment(ack,meta) {return ack.run===meta.run&&ack.source_digest===meta.source_digest&&ack.candidate_digest===meta.candidate_digest&&ack.report_digest===meta.report_digest&&ack.detector_version===meta.detector_version;}
export function requireScan(directory,input,{acknowledged=true}={}) {
  const path=join(directory,META_FILE);
  if(!existsSync(path))throw new Error('Publication blocked: source scan metadata is missing; run preview');
  const meta=readJsonStrict(path);
  if(meta.status!=='complete'||meta.phase!=='candidate'||input.phase!=='candidate'||typeof meta.scan_id!=='string'||!meta.scan_id||meta.detector_version!==DETECTOR_VERSION||meta.run!==input.run||meta.source_digest!==input.source_digest||meta.candidate_digest!==input.candidate_digest||!Number.isSafeInteger(meta.finding_count)||meta.finding_count<0||!Array.isArray(meta.coverage?.unavailable)||meta.coverage.unavailable.length)throw new Error('Publication blocked: source scan is incomplete, failed or stale; run preview');
  if(meta.finding_count>0) {
    const report=join(directory,FINDINGS_FILE);
    if(!existsSync(report)||sha256(readFileSync(report,'utf8'))!==meta.report_digest)throw new Error('Publication blocked: suspicious-content report is missing or changed; run preview');
    const contents=readJsonStrict(report);
    if(contents.run!==meta.run||contents.scan_id!==meta.scan_id||contents.candidate_digest!==meta.candidate_digest||contents.source_digest!==meta.source_digest||contents.detector_version!==meta.detector_version||contents.status!=='complete'||!Array.isArray(contents.findings)||contents.findings.length!==meta.finding_count)throw new Error('Publication blocked: findings report does not match scan metadata');
    const ack=join(directory,ACK_FILE);
    if(acknowledged&&(!existsSync(ack)||!sameAcknowledgment(readJsonStrict(ack),meta)))throw new Error('Publication blocked: operator acknowledgment of the exact suspicious-content report and candidate is required');
  } else if(meta.report_digest!==null||existsSync(join(directory,FINDINGS_FILE)))throw new Error('Publication blocked: zero-findings scan has inconsistent report state; run preview');
  return meta;
}
export function acknowledgeReview(directory,input,{candidate_digest,report_digest,operator,reason}) {
  const meta=requireScan(directory,input,{acknowledged:false});
  if(meta.finding_count===0)throw new Error('No findings: no acknowledgment is required');
  if(candidate_digest!==meta.candidate_digest||report_digest!==meta.report_digest)throw new Error('Acknowledgment digests differ from the staged candidate/report');
  if(typeof operator!=='string'||!operator.trim()||operator.length>120||typeof reason!=='string'||!reason.trim()||reason.length>240)throw new Error('Acknowledgment requires an operator name (1–120 characters) and review reason (1–240 characters)');
  const ack={run:meta.run,source_digest:meta.source_digest,candidate_digest,report_digest,detector_version:meta.detector_version,operator,reason,acknowledged_at:new Date().toISOString()};
  importAudit(directory).record('review.acknowledgment',ack);
  writeJsonAtomic(join(directory,ACK_FILE),ack);
  return ack;
}
export function scanNotice(directory,meta) {
  if(meta.status!=='complete')return `Source scan ${meta.status}: ${meta.finding_count??'unknown'} findings; publication blocked. Unavailable fields: ${JSON.stringify(meta.coverage.unavailable)}.${meta.finding_count>0?` Review ${join(directory,FINDINGS_FILE)}; a final candidate scan is still required.`:''}`;
  if(meta.finding_count===0)return 'Source scan complete: no configured suspicious patterns detected; this does not establish absence of prompt injection.';
  return `Source scan complete: ${meta.finding_count} findings require human review and acknowledgment before publication. Review ${join(directory,FINDINGS_FILE)}. Candidate digest ${meta.candidate_digest}; report digest ${meta.report_digest}.`;
}
export function authorizePublication(directory,input,file) {
  const meta=requireScan(directory,input);
  const path=join(directory,'publication-review.json');
  writeJsonAtomic(path,{format:'zforum-publication-review-1',file_sha256:sha256(readFileSync(file,'utf8')),scan_id:meta.scan_id,run:meta.run,source_digest:meta.source_digest,candidate_digest:meta.candidate_digest,report_digest:meta.report_digest});
  return directory;
}
