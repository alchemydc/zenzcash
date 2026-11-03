import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importAudit,summarizeAttempts,estimateAnalysis} from '../tools/lib/import-audit.mjs';
import {forumClient} from '../tools/lib/forum-client.mjs';

test('audit preserves concurrent and nested operations across separate writers, including failure',async()=>{
 const root=mkdtempSync(join(tmpdir(),'audit-'));try{
  const a=importAudit(root),b=importAudit(root);
  await Promise.all([a.measure('outer',{},async()=>{await b.measure('inner',{},async()=>42);}),b.measure('other',{},async()=>{} )]);
  await assert.rejects(a.measure('failure',{},async()=>{throw Error('fixture failure');}),/fixture failure/);
  assert.deepEqual(a.events.map(e=>e.category).sort(),['failure','inner','other','outer']);
  for(const e of a.events){assert(Number.isFinite(e.elapsed_ms)&&e.elapsed_ms>=0);assert.notEqual(e.status,'running');}
  assert.equal(a.events.find(e=>e.category==='failure').status,'failed');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('known token totals exclude unknown usage, cached input is not added twice, retries count',()=>{
 const rows=[{accepted:true,status:'complete',elapsed_ms:10,usage:{input_tokens:100,cached_input_tokens:40,output_tokens:20}},{accepted:false,status:'complete',elapsed_ms:20,usage:{input_tokens:80,cached_input_tokens:10,output_tokens:30}},{accepted:false,status:'failed',elapsed_ms:30,usage:null},{accepted:null,status:'running',elapsed_ms:null,usage:null}];
 assert.deepEqual(summarizeAttempts(rows),{invocations:4,accepted:1,rejected:1,failed:1,incomplete:1,model_time_ms:60,unknown_time:1,input_tokens:180,cached_input_tokens:50,output_tokens:50,unknown_usage:2});
 for(let repeats=0;repeats<20;repeats++){const result=summarizeAttempts(Array.from({length:repeats},()=>rows).flat());assert.equal(result.input_tokens,180*repeats);assert.equal(result.invocations,4*repeats);assert.equal(result.unknown_usage,2*repeats);}
});
test('estimates model sequential summaries and concurrent reply waves, excluding retained/cache hits',()=>{
 const history=[{task:'summary',accepted:true,timing:'monotonic',elapsed_ms:1000},{task:'marks',accepted:true,timing:'monotonic',elapsed_ms:2000}];
 for(let replies=0;replies<20;replies++)for(const concurrency of [1,2,3]){
  const topics=[{jobs:[{task:'summary',cache:'miss'},...Array.from({length:replies},()=>({task:'marks',cache:'miss'})),{task:'marks',cache:'accepted-reply'},{task:'summary',cache:'reusable'}]}];
  const result=estimateAnalysis(topics,history,concurrency);assert.equal(result.remaining_jobs,replies+1);assert.equal(result.lower_ms,1000+Math.ceil(replies/concurrency)*2000);assert.equal(result.upper_ms,result.lower_ms*1.3);
 }
 assert.equal(estimateAnalysis([{jobs:[{task:'summary',cache:'miss'}]}],[],2).lower_ms,null);
 assert.equal(estimateAnalysis([],[],2).lower_ms,0);
});
test('forum audit counts actual HTTP attempts and rate-limit waits separately',async()=>{
 const events=[];let tries=0;
 const get=forumClient({wait:async()=>{},request:async()=>++tries===1?new Response('',{status:429,headers:{'retry-after':'1'}}):Response.json({ok:true})});
 assert.deepEqual(await get('/latest.json',{observe:e=>events.push(e)}),{body:{ok:true}});
 assert.deepEqual(events.filter(e=>e.category==='forum.http').map(e=>[e.attempt,e.http_status]),[[1,429],[2,200]]);
 assert.equal(events.filter(e=>e.category==='forum.backoff').length,1);
 const fail=forumClient({wait:async()=>{},request:async()=>{throw Error('offline');}});
 await assert.rejects(fail('/latest.json',{observe:e=>events.push(e)}),/offline/);
 assert.equal(events.at(-1).http_status,null);assert.equal(events.at(-1).status,'failed');
});
