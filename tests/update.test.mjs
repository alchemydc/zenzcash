import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverRecent } from "../tools/lib/discovery.mjs";
import { analyzeCandidate, frozenJobs, validateCandidate } from "../tools/lib/refresh-analysis.mjs";
import { sourceChanges, fetchSnapshot } from "../tools/lib/refresh-source.mjs";
import { readJsonStrict, writeJsonAtomic } from "../tools/lib/fsio.mjs";
import { summaryJob } from "../tools/lib/jobs.mjs";
import { validateSummary } from "../tools/lib/validate.mjs";
import { goodMarks } from "./marks-fixture.mjs";
import { sampleThread } from "./helpers.mjs";
import { ISSUE_DETAIL_IDS } from "../site/js/summary-fields.js";
import { recordedForum } from "../tools/replay-updates.mjs";
import { marksJobs } from "../tools/lib/jobs.mjs";
import { post } from "./helpers.mjs";
import { BATCH_REPAIR_POLICY } from '../tools/lib/batch-repair.mjs';
import { REPLY_ANALYSIS_POLICY } from '../tools/lib/reply-analysis.mjs';

const since = "2026-10-25T00:00:00Z", until = "2026-11-01T23:00:00Z";
const listing = (id, bumped_at, pinned = false) => ({id,title:`Thread ${id}`,slug:`thread-${id}`,bumped_at,pinned});
test("weekly discovery selects active older threads, deduplicates pages and ignores old pins", async () => {
  const pages = [
    [listing(1,"2020-01-01T00:00:00Z",true),listing(57058,until),listing(58723,since)],
    [listing(57058,until),listing(57218,"2026-10-30T00:00:00Z")],
    [listing(1,"2020-01-01T00:00:00Z",true),listing(2,"2026-10-24T23:59:59Z")],
  ];
  const paths=[];
  const result=await discoverRecent({since,until,get:async(path)=>{paths.push(path);return {body:{topic_list:{topics:pages[paths.length-1],more_topics_url:"/latest?page=next"}}};}});
  assert.deepEqual(result.selected,["bug-bounties","zebra-disclosure","konclave"]);
  assert.deepEqual(result.threads.map(t=>t.id),[57058,57218,58723]);
  assert.deepEqual(paths,[0,1,2].map(page=>`/latest.json?order=activity&page=${page}`));
  const empty=await discoverRecent({since,until,get:async()=>({body:{topic_list:{topics:[]}}})});
  assert.deepEqual(empty.threads,[]);
  await assert.rejects(discoverRecent({since:until,until:since,get:async()=>{throw Error("must not fetch");}}),/invalid discovery window/);
  await assert.rejects(discoverRecent({since,until,get:async()=>({unavailable:403})}),/topic list unavailable or malformed/);
  await assert.rejects(discoverRecent({since,until,maxPages:1,get:async()=>({body:{topic_list:{topics:[listing(57058,until)],more_topics_url:"next"}}})}),/exceeded 1 pages/);
  await assert.rejects(discoverRecent({since,until,get:async()=>({body:{topic_list:{topics:[listing(57058,"bad")]}}})}),/malformed topic 57058/);
  await assert.rejects(discoverRecent({since,until,get:async()=>({body:{topic_list:{topics:[listing(57058,until)],more_topics_url:"next"}}})}),/pagination made no progress/);
});

const snapshot = () => ({topic:"test",snapshotAt:until,threads:[sampleThread()],accounts:Object.fromEntries(["alice","bob","carol"].map(name=>[name,{created_at:"2020-01-01T00:00:00Z",status:"ok"}]))});
const summary = () => {
  const statement={text:"The opening post proposes ending funding.",cites:["7/1"]};
  return {task:"summary",topic:"test",card:{title:"Funding",byline:"A funding discussion",keywords:["funding","grants"],interests:["grants"]},headline:"A funding proposal",overview:[statement],points:[{id:"p1",...statement}],issues:[{id:"q1",issue:"Should funding end?",description:structuredClone(statement),decision_at_stake:structuredClone(statement),positions_with_post_references:[{label:"Opening proposal",...structuredClone(statement)}],unresolved_status:{text:"No outcome is established in the opening post.",cites:["7/1"]},points:["p1"],related_issues:[],...Object.fromEntries(ISSUE_DETAIL_IDS.map(id=>[id,[]]))}]};
};
test("one-post summary accepts one question and position with all citation checks intact", () => {
  const threads=[{...sampleThread(),posts:[sampleThread().posts[0]]}];
  const job={...summaryJob("test",threads).job,adaptive:true};
  assert.deepEqual(validateSummary(summary(),job,threads),[]);
  const bad=summary();bad.overview[0].cites=["7/2"];
  assert.deepEqual(validateSummary(bad,job,threads),['overview[0].cites: "7/2" is not a visible post in this topic (use "topicId/postNumber")']);
});
test("fresh runs reuse exact validated analysis, resume interruption, and invalidate changed source or model", async () => {
  const root=mkdtempSync(join(tmpdir(),"zforum-update-"));
  try {
    let calls=0;
    const run=async({prompt})=>{
      calls++;
      const output=prompt.includes('"task":"summary"')?summary():goodMarks();
      if(output.task==="marks")output.posts.forEach(post=>{post.issue_ids=["q1"];});
      return {output,runtime:"fixture",elapsed_ms:5,reported_model:null,cost_usd:null,usage:{input_tokens:10}};
    };
    const options={directory:join(root,"first"),cacheDirectory:join(root,"cache"),snapshot:snapshot(),prompts:{marks:"marks",summary:"summary"},agent:"codex",model:"fixture",maxJobs:1,timeoutSeconds:5,budget:1,run};
    await assert.rejects(analyzeCandidate(options),/job limit 1 reached/);
    assert.equal(calls,1);
    await analyzeCandidate(options);
    assert.equal(calls,2);
    const first=validateCandidate(options.directory,options.snapshot,options.prompts);
    assert.equal(first.data.topic.id,"test");
    const later={...options.snapshot,snapshotAt:"2026-11-02T00:00:00Z"};
    const repeat={...options,directory:join(root,"repeat"),snapshot:later};
    const report=await analyzeCandidate(repeat);
    assert.equal(calls,2);
    assert.deepEqual(report.jobs.map(job=>job.reused),[true,true]);
    const second=validateCandidate(repeat.directory,later,options.prompts);
    assert.deepEqual(second.data.topic,first.data.topic);
    assert.equal(second.data.source_sha256,first.data.source_sha256);
    const edited=structuredClone(later);
    edited.threads[0].posts[0].raw += " A correction.";
    edited.threads[0].posts[0].own_text += " A correction.";
    edited.threads[0].posts[0].segments.push({kind:"text",text:"A correction."});
    await analyzeCandidate({...options,directory:join(root,"edited"),snapshot:edited,maxJobs:2});
    assert.equal(calls,4);
    await analyzeCandidate({...options,directory:join(root,"model"),model:"another",maxJobs:2});
    assert.equal(calls,6);
    assert.notEqual(frozenJobs(edited,options.prompts)[0].input,frozenJobs(later,options.prompts)[0].input);
    const file=join(repeat.directory,"summary-test.json"), corrupt=readJsonStrict(file);
    corrupt.output.overview[0].cites=["7/999"];writeJsonAtomic(file,corrupt);
    assert.throws(()=>validateCandidate(repeat.directory,later,options.prompts),/not a visible post/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("bounded full-history replay detects added, edited, hidden and removed posts independently of creation age", async () => {
  const before={threads:[{id:7,title:"Replay",slug:"replay",created_at:since,posts:[1,2,3].map(number=>({number,username:"alice",created_at:since,reply_to:null,hidden:false,raw:`Post ${number}`,own_text:`Post ${number}`,segments:[{kind:"text",text:`Post ${number}`}]}))}]};
  const requests=[];
  const get=async(path)=>{
    requests.push(path);
    if(path.startsWith("/u/"))return {body:{user:{created_at:since}}};
    if(path.includes("/posts.json"))return {body:{post_stream:{posts:[{id:1,post_type:1,post_number:1,username:"alice",created_at:since,reply_to_post_number:null,hidden:false,raw:"Old post edited"},{id:2,post_type:1,post_number:2,username:"alice",created_at:since,reply_to_post_number:null,hidden:true},{id:4,post_type:1,post_number:4,username:"alice",created_at:until,reply_to_post_number:1,hidden:false,raw:"New reply"}]}}};
    return {body:{id:7,title:"Replay",slug:"replay",created_at:since,post_stream:{stream:[1,2,4]}}};
  };
  const options={get,previous:before,topic:{id:"test",threadIds:[7]},checkpoint:async()=>{},clock:()=>until};
  const after=await fetchSnapshot(options);
  assert.deepEqual(sourceChanges(before,after),{added:["7/4"],changed:["7/1"],unavailable:["7/2","7/3"]});
  assert.equal(after.threads[0].posts[1].raw,null);
  const repeat=await fetchSnapshot({...options,previous:after});
  assert.deepEqual(sourceChanges(after,repeat),{added:[],changed:[],unavailable:[]});
  assert.equal(after.source_sha256,repeat.source_sha256);
  assert.ok(requests.every(path=>path.startsWith("/t/7")||path==="/u/alice.json"));
});

test("live job post caps cover every target exactly once and retain complete context",()=>{
  for(let size=1;size<=40;size++) {
    const thread={id:7,title:"Generated",posts:Array.from({length:size},(_,i)=>post(i+1,"alice",since,`Evidence ${i+1}`))};
    const jobs=marksJobs(thread,40000,8);
    assert.deepEqual(jobs.flatMap(({job})=>job.expected),thread.posts.map(post=>post.number));
    assert.ok(jobs.every(({job})=>job.expected.length>=1 && job.expected.length<=8));
    for(const {view} of jobs) assert.ok(view.includes(`Evidence ${size}`));
  }
  assert.throws(()=>marksJobs(sampleThread(),40000,0),/invalid marks job post limit 0/);
});

test("validation retries preserve rejected output and usage and count against the job cap",async()=>{
  const root=mkdtempSync(join(tmpdir(),"zforum-retries-"));
  try {
    let calls=0;
    const run=async({prompt})=>{
      calls++;
      const output=prompt.includes('"task":"summary"')?summary():goodMarks();
      if(calls===1)output.overview[0].cites=["7/999"];
      if(calls===2){assert.match(prompt,/not a visible post/);assert.match(prompt,/Previous output:/);}
      if(output.task==="marks")output.posts.forEach(post=>{post.issue_ids=["q1"];});
      return {output,runtime:"fixture",elapsed_ms:5,reported_model:null,cost_usd:0.1,usage:{input_tokens:10}};
    };
    const options={directory:join(root,"candidate"),snapshot:snapshot(),prompts:{marks:"marks",summary:"summary"},agent:"codex",model:"fixture",maxJobs:2,timeoutSeconds:5,budget:1,run};
    await assert.rejects(analyzeCandidate(options),/job limit 2 reached/);
    const failed=readJsonStrict(join(options.directory,"manifest.json"));
    assert.deepEqual(failed.attempts.map(a=>a.accepted),[false,true]);
    assert.equal(failed.invoked,2);
    const result=await analyzeCandidate({...options,maxJobs:1});
    assert.equal(result.invoked,1);assert.equal(calls,3);
    assert.deepEqual(result.attempts.map(a=>a.cost_usd),[0.1,0.1,0.1]);
    assert.deepEqual(result.jobs.map(job=>job.reused),[true,false]);
    validateCandidate(options.directory,options.snapshot,options.prompts);
    let rejected=0;
    await assert.rejects(analyzeCandidate({...options,directory:join(root,"never-valid"),maxJobs:10,run:async()=>{rejected++;return {output:{},runtime:"fixture",elapsed_ms:1,cost_usd:null};}}),/validation failed/);
    assert.equal(rejected,3);
  }finally{rmSync(root,{recursive:true,force:true});}
});

const requestJob=prompt=>JSON.parse(prompt.match(/\nJob .*:\n(\{[^\n]+\})/)[1]);
const repairSnapshot=()=>({...snapshot(),analysisPolicy:REPLY_ANALYSIS_POLICY,analysisBaseline:null,importRun:'fixture-run',batchRepairPolicy:BATCH_REPAIR_POLICY});
const repairMarks=expected=>{const output=goodMarks();output.posts=output.posts.filter(post=>expected.includes(post.post_number));output.posts.forEach(post=>{post.issue_ids=[];});return output;};
const fixtureResult=output=>({output,runtime:'fixture',elapsed_ms:1,reported_model:null,cost_usd:null,usage:{input_tokens:100,output_tokens:output.task==='marks'?output.posts.length*10:10}});

test('partial batch repairs retain valid replies across call-limit interruption and resume',async()=>{
  const root=mkdtempSync(join(tmpdir(),'zforum-repair-')),requested=[];let batch=0;
  try{
    const options={directory:root,snapshot:repairSnapshot(),prompts:{marks:'marks',summary:'summary'},agent:'codex',model:'fixture',maxJobs:2,timeoutSeconds:5,budget:1,run:async({prompt})=>{
      const job=requestJob(prompt);if(job.task==='summary')return fixtureResult(summary());
      requested.push(job.expected);batch++;
      const output=repairMarks(job.expected);
      if(batch===1)output.posts.find(post=>post.post_number===2).claims[0].type='proposal';
      if(batch<=2){const post=output.posts.find(post=>post.post_number===4);post.neutral_rendition='ZCG should end.';post.rewrite_changes=[];}
      return fixtureResult(output);
    }};
    await assert.rejects(analyzeCandidate(options),{message:'job limit 2 reached; resume this candidate to continue'});
    assert.deepEqual(readJsonStrict(join(root,'repairs','marks-7-1-4.json')).output.posts.map(p=>p.post_number),[1]);
    await assert.rejects(analyzeCandidate({...options,maxJobs:1}),{message:'job limit 1 reached; resume this candidate to continue'});
    assert.deepEqual(readJsonStrict(join(root,'repairs','marks-7-1-4.json')).output.posts.map(p=>p.post_number),[1,2]);
    const report=await analyzeCandidate({...options,maxJobs:1});
    assert.deepEqual(requested,[[1,2,4],[2,4],[4]]);
    const record=readJsonStrict(join(root,'marks-7-1-4.json'));
    assert.deepEqual(record.output,repairMarks([1,2,4]));
    assert.deepEqual(record.repair.attempts.map(a=>a.accepted_posts),[[1],[2],[4]]);
    assert.deepEqual(report.attempts.filter(a=>a.task==='marks').map(a=>[a.requested_posts,a.accepted_posts,a.accepted]),[[[1,2,4],[1],false],[[2,4],[2],false],[[4],[4],true]]);
    assert.equal(report.attempts.reduce((n,a)=>n+a.usage.output_tokens,0),70);
    const built=validateCandidate(root,options.snapshot,options.prompts).data;
    for(const post of built.topic.threads[0].posts.filter(p=>!p.hidden))assert.equal(post.analysis_run.request_sha256,record.repair.attempts.find(a=>a.accepted_posts.includes(post.number)).request_sha256);
    // A completed repair checkpoint also survives loss of the final record write.
    rmSync(join(root,'marks-7-1-4.json'));
    const resumed=await analyzeCandidate({...options,run:()=>assert.fail('completed repair invoked a model')});
    assert.equal(resumed.invoked,0);assert.deepEqual(readJsonStrict(join(root,'marks-7-1-4.json')).output,record.output);
    for(const [change,message]of [
      [r=>{r.repair.attempts[1].accepted_posts=[1];},'marks-7-1-4: duplicate or unexpected repaired post 1'],
      [r=>{r.repair.attempts[0].accepted_posts=[];},'marks-7-1-4: repair provenance does not cover all accepted posts'],
      [r=>{r.repair.attempts[0].output_sha256='invalid';},'marks-7-1-4: invalid repair attempt provenance'],
      [r=>{r.repair.attempts[0].metrics.elapsed_ms=-1;},'marks-7-1-4: invalid runner metrics'],
      [r=>{r.request_sha256='a'.repeat(64);},'marks-7-1-4: repair metrics differ from the last attempt'],
    ]) {
      const invalid=structuredClone(record);change(invalid);writeJsonAtomic(join(root,'marks-7-1-4.json'),invalid);
      assert.throws(()=>validateCandidate(root,options.snapshot,options.prompts),{message});
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('all valid/invalid reply subsets repair only invalid records while malformed envelopes retain none',async()=>{
  const root=mkdtempSync(join(tmpdir(),'zforum-repair-subsets-'));
  try{
    for(let mask=0;mask<8;mask++) {
      const requested=[];let batch=0;
      const options={directory:join(root,`mask-${mask}`),snapshot:repairSnapshot(),prompts:{marks:'marks',summary:'summary'},agent:'codex',model:'fixture',maxJobs:3,timeoutSeconds:5,budget:1,run:async({prompt})=>{
        const job=requestJob(prompt);if(job.task==='summary')return fixtureResult(summary());
        requested.push(job.expected);const output=repairMarks(job.expected);
        if(batch++===0)output.posts.forEach((post,i)=>{if(mask&(1<<i))post.claims[0].type='experience';});
        return fixtureResult(output);
      }};
      await analyzeCandidate(options);
      const invalid=[1,2,4].filter((n,i)=>mask&(1<<i));
      assert.deepEqual(requested,mask?[[1,2,4],invalid]:[[1,2,4]]);
      assert.deepEqual(readJsonStrict(join(options.directory,'marks-7-1-4.json')).output,repairMarks([1,2,4]));
    }
    for(const kind of ['task','topic','rubric','order','duplicate','missing','extra']) {
      let batch=0;const requested=[];
      const options={directory:join(root,kind),snapshot:repairSnapshot(),prompts:{marks:'marks',summary:'summary'},agent:'codex',model:'fixture',maxJobs:3,timeoutSeconds:5,budget:1,run:async({prompt})=>{
        const job=requestJob(prompt);if(job.task==='summary')return fixtureResult(summary());
        requested.push(job.expected);const output=repairMarks(job.expected);
        if(batch++===0){
          if(kind==='task')output.task='invalid';
          if(kind==='topic')output.topic_id=8;
          if(kind==='rubric')output.rubric_version='invalid';
          if(kind==='order')output.posts.reverse();
          if(kind==='duplicate')output.posts[1]=output.posts[0];
          if(kind==='missing')output.posts.pop();
          if(kind==='extra')output.extra=true;
        }
        return fixtureResult(output);
      }};
      const report=await analyzeCandidate(options);
      assert.deepEqual(requested,[[1,2,4],[1,2,4]]);
      assert.deepEqual(report.attempts.filter(a=>a.task==='marks')[0].accepted_posts,[]);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("recorded source replay round trips visible and hidden posts through the production parser",async()=>{
  const source=snapshot();
  const rebuilt=await fetchSnapshot({get:recordedForum(source),previous:{threads:[]},topic:{id:"test",threadIds:[7]},checkpoint:async()=>{},clock:()=>until});
  assert.deepEqual(rebuilt.threads,source.threads);
  await assert.rejects(recordedForum(source)("/unexpected"),/unexpected replay request/);
});

test('failed model invocations remain auditable with known or explicitly unknown usage',async()=>{
 const root=mkdtempSync(join(tmpdir(),'zforum-failed-audit-'));
 try {
  for(const usage of [null,{input_tokens:11,cached_input_tokens:3,output_tokens:7}]) {
   const directory=join(root,usage===null?'unknown':'known');
   const options={directory,snapshot:snapshot(),prompts:{marks:'marks',summary:'summary'},agent:'codex',model:'fixture',maxJobs:1,timeoutSeconds:5,budget:1,run:async()=>{throw Object.assign(new Error('fixture runner failed'),{metrics:{runtime:'fixture',usage,cost_usd:null}});}};
   await assert.rejects(analyzeCandidate(options),/fixture runner failed/);
   const manifest=readJsonStrict(join(directory,'manifest.json'));
   assert.equal(manifest.attempts.length,1);const attempt=manifest.attempts[0];
   assert.equal(attempt.status,'failed');assert.equal(attempt.accepted,false);assert.deepEqual(attempt.usage,usage);assert.equal(attempt.timing,'monotonic');assert(Number.isFinite(attempt.elapsed_ms)&&attempt.elapsed_ms>=0);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
