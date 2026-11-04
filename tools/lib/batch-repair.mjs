import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readJsonStrict,writeJsonAtomic } from './fsio.mjs';
import { sha256 } from './jobs.mjs';
import { RUBRIC_VERSION } from '../../site/js/rubric.js';
import { validateRunnerMetrics } from './provenance.mjs';

export const BATCH_REPAIR_POLICY='invalid-posts-v1';

export function validateRepairProvenance(repair,expected,name) {
  if(!repair||Object.keys(repair).sort().join(',')!=='attempts,policy'||repair.policy!==BATCH_REPAIR_POLICY||!Array.isArray(repair.attempts))throw new Error(`${name}: invalid repair provenance`);
  const seen=new Set();
  for(const attempt of repair.attempts) {
    if(!attempt||Object.keys(attempt).sort().join(',')!=='accepted_posts,metrics,output_sha256,request_sha256'||!Array.isArray(attempt.accepted_posts)||!['request_sha256','output_sha256'].every(key=>typeof attempt[key]==='string'&&/^[a-f0-9]{64}$/.test(attempt[key])))throw new Error(`${name}: invalid repair attempt provenance`);
    validateRunnerMetrics(attempt.metrics,name);
    for(const number of attempt.accepted_posts){if(!expected.includes(number)||seen.has(number))throw new Error(`${name}: duplicate or unexpected repaired post ${number}`);seen.add(number);}
  }
  if(seen.size!==expected.length)throw new Error(`${name}: repair provenance does not cover all accepted posts`);
}

export function batchRepair({item,threads,agent,model,directory,validate}) {
  const path=join(directory,'repairs',`${item.job.name}.json`);
  const envelope=posts=>({task:'marks',topic_id:item.job.topic_id,rubric_version:RUBRIC_VERSION,posts});
  const saved=existsSync(path)?readJsonStrict(path):{input:item.input,agent,model,output:envelope([]),attempts:[]};
  if(!saved||Object.keys(saved).sort().join(',')!=='agent,attempts,input,model,output'||saved.input!==item.input||saved.agent!==agent||saved.model!==model||!Array.isArray(saved.attempts))throw new Error(`${item.job.name}: repair checkpoint identity mismatch`);
  const accepted=new Map();
  if(!Array.isArray(saved.output?.posts))throw new Error(`${item.job.name}: invalid repair checkpoint posts`);
  const numbers=saved.output.posts.map(post=>post?.post_number);
  if(!isDeepStrictEqual(numbers,item.job.expected.filter(n=>numbers.includes(n))))throw new Error(`${item.job.name}: invalid repair checkpoint membership`);
  const errors=validate(saved.output,{...item.job,expected:numbers},threads);
  if(errors.length)throw new Error(`${item.job.name}: invalid repair checkpoint: ${errors.join('; ')}`);
  validateRepairProvenance({policy:BATCH_REPAIR_POLICY,attempts:saved.attempts},numbers,item.job.name);
  for(const post of saved.output.posts)accepted.set(post.post_number,post);
  const pending=()=>item.job.expected.filter(number=>!accepted.has(number));
  const output=()=>envelope(item.job.expected.filter(n=>accepted.has(n)).map(n=>accepted.get(n)));
  return {
    get remaining(){return pending();},
    get output(){return output();},
    get provenance(){return {policy:BATCH_REPAIR_POLICY,attempts:saved.attempts};},
    get record(){
      if(pending().length||!saved.attempts.length)throw new Error(`${item.job.name}: repair is incomplete`);
      const last=saved.attempts.at(-1);
      return {agent,model,input:item.input,request_sha256:last.request_sha256,task:item.job.task,job:item.job.name,prompt_sha256:item.promptHash,view_sha256:item.viewHash,
        output:output(),metrics:last.metrics,repair:{policy:BATCH_REPAIR_POLICY,attempts:saved.attempts}};
    },
    request() {
      return {...item,job:{...item.job,expected:pending()}};
    },
    accept(raw,job,prompt,metrics) {
      const acceptedNow=[];
      const envelopeValid=Array.isArray(raw?.posts)&&validate({...raw,posts:[]},{...job,expected:[]},threads).length===0&&isDeepStrictEqual(raw.posts.map(post=>post?.post_number),job.expected);
      if(envelopeValid)for(const post of raw.posts) {
        if(validate({...raw,posts:[post]},{...job,expected:[post.post_number]},threads).length===0){accepted.set(post.post_number,post);acceptedNow.push(post.post_number);}
      }
      saved.attempts.push({request_sha256:sha256(prompt),output_sha256:sha256(JSON.stringify(raw)),accepted_posts:acceptedNow,metrics});
      saved.output=output();writeJsonAtomic(path,saved);
      return acceptedNow;
    }
  };
}
