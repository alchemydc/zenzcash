import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ImportStore, importTimestamp } from "../tools/lib/import-store.mjs";
import { runImport, discoverImport } from "../tools/import.mjs";
import { requireSubscription } from "../tools/lib/agent-runner.mjs";
import { goodMarks } from "./marks-fixture.mjs";
import { sampleThread, random } from "./helpers.mjs";
import { ISSUE_DETAIL_IDS } from "../site/js/summary-fields.js";
import { readJsonStrict, writeJsonAtomic } from "../tools/lib/fsio.mjs";
import { parseImportArgs } from "../tools/lib/import-options.mjs";
import { exportImport, receiveSources, exportAnalysis, acceptAnalysis, prepareImport, stagePreparedImport } from "../tools/lib/import-transfer.mjs";
import { analyzeImportTopics } from "../tools/lib/import-analysis.mjs";
import { REPLY_ANALYSIS_POLICY, retainedOutput, sameReplyContent } from "../tools/lib/reply-analysis.mjs";
import { frozenJobs, validateCandidate } from "../tools/lib/refresh-analysis.mjs";
import { sha256 } from "../tools/lib/jobs.mjs";
import { runProcess } from "../tools/lib/process.mjs";
import { SUMMARY_REUSE_POLICY,summaryReuse } from '../tools/lib/summary-reuse.mjs';
import { BATCH_REPAIR_POLICY } from '../tools/lib/batch-repair.mjs';

function harness({reviews=false}={}) {
  const root=mkdtempSync(join(tmpdir(),"zforum-import-")),path=join(root,"db.sqlite");
  const db=new DatabaseSync(path);
  db.exec("CREATE TABLE releases(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE published(topic TEXT PRIMARY KEY,release TEXT); CREATE TABLE source_pulls(snapshot TEXT,completed TEXT);");
  db.exec(readFileSync(new URL("../server/src/import-schema.sql",import.meta.url),"utf8"));
  if(reviews)db.exec("CREATE TABLE import_thread_reviews(thread INTEGER PRIMARY KEY,decision TEXT,classification TEXT,reason TEXT); PRAGMA user_version=7;");
  db.close();
  const store=new ImportStore(path);
  return {root,store,close:()=>{store.close();rmSync(root,{recursive:true,force:true});}};
}
const end="2026-11-02T00:00:00.000Z",start="2026-11-01T00:00:00.000Z";
const settings={model:"fixture",timeoutSeconds:5,maxCallsPerTopic:20,discoveryMaxPages:10,prompts:{summary:"summary prompt",marks:"marks prompt"}};
function mockPublication(h,packet,publish=()=>sha256('fixture-release')) {
  const state=h.store.active();
  assert.deepEqual(packet.topics.map(t=>t.id),state.topics.map(t=>t.id));
  h.store.transaction(()=>{
    for(const [index,topic]of packet.topics.entries()) {
      state.topics[index].release=publish(topic.data);state.topics[index].status='published';
      h.store.recordSummary(topic.id,topic.summary);
    }
    state.status='complete';state.finished_at=packet.finished_at;h.store.save(state);
  });
  return JSON.stringify(state);
}
test("strict UTC input, first-run requirement, unfinished resume, and backward coverage checkpoint",()=>{
  const h=harness();
  try {
    assert.equal(importTimestamp("2026-11-01T00:00:00Z"),start);
    for(const bad of ["yesterday","2026-02-30T00:00:00Z","2026-11-01T00:00:00","2026-11-01"]) assert.throws(()=>importTimestamp(bad),/exact UTC timestamp/);
    assert.throws(()=>h.store.begin(undefined,end,settings),/First import requires/);
    const first=h.store.begin(start,end,settings);
    assert.equal(h.store.begin(undefined,end,Object.fromEntries(Object.entries(settings).reverse())).id,first.id);
    assert.equal(h.store.begin(undefined,"2026-11-03T00:00:00Z",settings).id,first.id);
    assert.throws(()=>h.store.begin("2026-10-01T00:00:00Z",end,settings),/Unfinished import/);
    first.status="complete";h.store.save(first);
    const next=h.store.begin(undefined,"2026-11-03T00:00:00Z",settings);
    assert.equal(next.since,"2026-11-01T23:55:00.000Z");next.status="complete";h.store.save(next);
    const backfill=h.store.begin("2026-01-01T00:00:00Z","2026-11-04T00:00:00Z",settings);
    assert.equal(backfill.since,"2026-01-01T00:00:00.000Z");
  }finally{h.close();}
});
test("overlapping registrations deduplicate by source id across generated windows and preserve manual membership",()=>{
  const h=harness(),rng=random(89),ids=new Set();
  try{
    h.store.db.prepare("INSERT INTO releases VALUES(?,?)").run("merged",JSON.stringify({topic:{id:"manual-group",threads:[{id:1},{id:2}]}}));
    h.store.db.prepare("INSERT INTO published VALUES(?,?)").run("manual-group","merged");
    ids.add(1);ids.add(2);
    for(let i=0;i<100;i++){
      const found=Array.from({length:rng.int(0,30)},()=>({id:rng.int(1,60)}));
      found.forEach(t=>ids.add(t.id));
      const topics=h.store.register(found);
      assert.deepEqual(topics.flatMap(t=>t.threadIds).sort((a,b)=>a-b),[...ids].sort((a,b)=>a-b));
      assert.deepEqual(topics.find(t=>t.id==="manual-group").threadIds,[1,2]);
      assert.equal(h.store.db.prepare("SELECT count(*) n FROM import_threads").get().n,ids.size);
    }
  }finally{h.close();}
});
test("subscription guard rejects API credentials and missing ChatGPT tokens",()=>{
  assert.doesNotThrow(()=>requireSubscription({auth_mode:"chatgpt",tokens:{access_token:"fixture"}}));
  for(const auth of [{},{auth_mode:"apikey",OPENAI_API_KEY:"fixture"},{auth_mode:"chatgpt",tokens:{}},{auth_mode:"chatgpt",tokens:{access_token:"fixture"},OPENAI_API_KEY:"fixture"}]) assert.throws(()=>requireSubscription(auth),/API-key authentication is refused/);
});
test("discovery includes activity after the cutoff and requires stable complete pagination",async()=>{
  let calls=0;
  const get=async()=>({body:{topic_list:{topics:[{id:++calls<2?8:7,title:"Live",slug:"live",bumped_at:"2026-11-02T00:01:00Z",pinned:false}]}}});
  const report=await discoverImport({get,since:start,until:end,maxPages:5,progress:()=>{}});
  assert.equal(report.passes,3);assert.deepEqual(report.threads.map(t=>t.id),[7,8]);
});
test("full import resumes after AI interruption, publishes once, reuses unchanged jobs and records stable post ids",async()=>{
  const h=harness();let calls=0,fail=true,publications=0;
  const thread=sampleThread();
  const get=async path=>{
    if(path.startsWith("/latest"))return {body:{topic_list:{topics:[{id:7,title:thread.title,slug:thread.slug,bumped_at:start,pinned:false}]}}};
    if(path.startsWith("/u/"))return {body:{user:{created_at:"2020-01-01T00:00:00Z"}}};
    if(path.includes("/posts.json"))return {body:{post_stream:{posts:thread.posts.map(p=>({id:700+p.number,post_number:p.number,post_type:1,username:p.username,created_at:p.created_at,reply_to_post_number:p.reply_to,hidden:p.hidden,...(p.hidden?{}:{raw:p.raw})}))}}};
    return {body:{...thread,post_stream:{stream:thread.posts.map(p=>700+p.number)}}};
  };
  const modelRun=async({prompt})=>{
    calls++;
    if(fail&&calls===2)throw new Error("interrupted model session");
    let output;
    if(prompt.includes('"task":"summary"')){
      const s={text:"The opening post proposes ending funding.",cites:["7/1"]};
      output={task:"summary",topic:"thread-7",card:{title:"Funding",byline:"A funding discussion",keywords:["funding","grants"],interests:["grants"]},headline:"A funding proposal",overview:[s],points:[{id:"p1",...s}],issues:[{id:"q1",issue:"Should funding end?",description:s,decision_at_stake:s,positions_with_post_references:[{label:"Opening proposal",...s}],unresolved_status:s,points:["p1"],related_issues:[],...Object.fromEntries(ISSUE_DETAIL_IDS.map(id=>[id,[]]))}]};
    }else{output=goodMarks();output.posts.forEach(p=>{p.issue_ids=["q1"];});}
    return {output,runtime:"fixture",elapsed_ms:1,reported_model:null,cost_usd:null,usage:{input_tokens:10}};
  };
  const server=async(command,...args)=>{
    if(command==="publish-import") {publications++; return mockPublication(h,readJsonStrict(args[1]),data=>{assert.equal(data.topic.id,"thread-7");return sha256('fixture-release');});}
    return "";
  };
  const options={since:start,store:h.store,root:h.root,settings,get,server,modelRun,reviewNewThreads:false,clock:()=>end,progress:()=>{}};
  try{
    const fetched = await runImport(options);
    const continueRun = {...options,since:undefined,maxCalls:1};
    assert.equal(fetched.topics[0].status,"fetched");
    assert.equal(calls,0);assert.equal(publications,0);
    const previewPath=join(h.root,fetched.id,"preview.json");
    assert.deepEqual(readJsonStrict(previewPath).topics[0].jobs.map(job=>job.cache),["miss","depends-on-summary"]);
    assert.deepEqual(readJsonStrict(previewPath).topics[0].changed_posts.map(post=>post.post),["7/1","7/2","7/4"]);
    const beforePreview=h.store.active();
    await runImport({...continueRun,stage:"preview",get:()=>assert.fail("preview fetched"),modelRun:()=>assert.fail("preview called model")});
    assert.deepEqual(h.store.active(),beforePreview);
    await assert.rejects(runImport({...continueRun,stage:"publish"}),{message:"Analysis is incomplete; nothing published. Run analyze and review its preview first"});
    await assert.rejects(runImport({...continueRun,stage:"analyze"}),{message:"Global call limit 1 reached; review preview then resume analyze with an explicit limit"});
    assert.equal(calls,1);
    await runImport({...continueRun,stage:"preview"});
    assert.deepEqual(readJsonStrict(previewPath).topics[0].jobs.map(job=>job.cache),["reusable","miss"]);
    await assert.rejects(runImport({...continueRun,stage:"analyze"}),/interrupted model session/);
    assert.equal(publications,0);
    assert.equal(h.store.db.prepare("SELECT status FROM import_runs").get().status,"failed");
    fail=false;
    const analyzed=await runImport({...continueRun,stage:"analyze",get:()=>assert.fail("analyze fetched")});
    assert.equal(analyzed.topics[0].status,"analyzed");assert.equal(publications,0);
    assert.equal(readJsonStrict(previewPath).topics[0].candidate.title,"Funding");
    assert.deepEqual(readJsonStrict(previewPath).topics[0].jobs.map(job=>job.cache),["reusable","reusable"]);
    const result=await runImport({...continueRun,stage:"publish",get:()=>assert.fail("publish fetched"),modelRun:()=>assert.fail("publish called model")});
    assert.equal(result.status,"complete");assert.equal(calls,3);assert.equal(publications,1);
    assert.equal(result.topics[0].posts,4);
    const repeatOptions={...options,since:undefined,clock:()=>"2026-11-03T00:00:00Z"};
    const repeat=await runImport({...repeatOptions,since:"2026-10-01T00:00:00Z"});
    await runImport({...repeatOptions,stage:"analyze",maxCalls:1});
    await runImport({...repeatOptions,stage:"publish"});
    assert.equal(calls,3);assert.equal(publications,2);
    assert.deepEqual(repeat.topics[0].changes,{added:[],changed:[],unavailable:[]});
    assert.equal(h.store.db.prepare("SELECT count(*) n FROM import_posts").get().n,4);
    assert.deepEqual(h.store.db.prepare("SELECT id FROM import_posts ORDER BY id").all().map(r=>r.id),[701,702,703,704]);
    const before=h.store.previous("thread-7"),bad=structuredClone(before);bad.threads[0].posts[0].number=99;
    assert.throws(()=>h.store.recordSource(bad),/moved/);
    assert.deepEqual(h.store.previous("thread-7"),before);
  }finally{h.close();}
});

test("stage audit persists running work and closes failed and resumed analysis",async()=>{
  const h=harness();
  try {
    const m=miniOptions(h,1,2);
    const state=await runImport({...m.options,since:start});
    const events=()=>readJsonStrict(join(h.root,state.id,'audit-events.json')).filter(e=>e.category==='stage.analyze');
    await assert.rejects(runImport({...m.options,stage:'analyze',maxCalls:2,modelRun:async()=>{
      assert.deepEqual(events().map(e=>[e.status,e.elapsed_ms]),[['running',null]]);
      throw new Error('fixture interrupted runner');
    }}),{message:'fixture interrupted runner'});
    assert.deepEqual(events().map(e=>e.status),['failed']);
    await runImport({...m.options,stage:'analyze',maxCalls:2});
    assert.deepEqual(events().map(e=>e.status),['failed','complete']);
    for(const event of events())assert(Number.isFinite(event.elapsed_ms)&&event.elapsed_ms>=0);
    const audit=readJsonStrict(join(h.root,state.id,'audit.json'));
    assert.equal(audit.timings['stage.analyze'].operations,2);
    assert.equal(audit.timings['stage.analyze'].failed,1);
    assert.equal(audit.timings['stage.analyze'].incomplete,0);
  }finally{h.close();}
});

test("CLI stages require an explicit analysis allowance and reject mixed or malformed options",()=>{
  assert.deepEqual(parseImportArgs([]),{stage:"fetch",since:undefined,db:undefined,thread:undefined,maxCalls:0});
  assert.deepEqual(parseImportArgs(["fetch",start,"--thread","58723","--db","trial.sqlite"]),{stage:"fetch",since:start,db:"trial.sqlite",thread:58723,maxCalls:0});
  assert.equal(parseImportArgs(["analyze","--max-calls","2"]).maxCalls,2);
  for (const stage of ["preview","publish"]) assert.equal(parseImportArgs([stage,"--db","trial.sqlite"]).stage,stage);
  assert.throws(()=>parseImportArgs(["analyze"]),{message:"analyze requires --max-calls N (global attempt limit, including retries)"});
  for (const value of ["0","-1","2.5","NaN","1e2","9007199254740992"]) assert.throws(()=>parseImportArgs(["analyze","--max-calls",value]),{message:`--max-calls must be a positive integer, received ${JSON.stringify(value)}`});
  assert.throws(()=>parseImportArgs(["publish","--max-calls","2"]),{message:"--max-calls applies only to analyze"});
  assert.throws(()=>parseImportArgs(['publish','--review','x.json']),{message:'--review applies only to fetch'});
  assert.throws(()=>parseImportArgs(['fetch','--review','']),{message:'--review must name a decision file'});
  assert.throws(()=>parseImportArgs(["analyze","--thread","7","--max-calls","2"]),{message:"analyze uses the frozen run; timestamp and --thread apply only to fetch"});
  for (const args of [["--unknown","x"],["--db"],["--db","a","--db","b"]]) assert.throws(()=>parseImportArgs(args),/Invalid or repeated import option/);
});

test("scoped runs preserve full coverage across generated later cutoffs",()=>{
  const h=harness();
  try {
    const full=h.store.begin(start,end,settings);full.status="complete";h.store.save(full);
    for(let i=1;i<=40;i++) {
      const until=new Date(Date.parse(end)+i*86400000).toISOString();
      const scoped=h.store.begin(undefined,until,settings,7);
      assert.equal(scoped.since,"2026-11-01T23:55:00.000Z");
      assert.throws(()=>h.store.begin(undefined,until,settings,8),{message:"Unfinished import scope is 7; cannot switch to thread 8"});
      scoped.status="complete";h.store.save(scoped);
    }
    assert.equal(h.store.begin(undefined,"2027-01-01T00:00:00.000Z",settings).since,"2026-11-01T23:55:00.000Z");
  } finally { h.close(); }
});

function miniOptions(h, topicCount=1, postCount=1) {
  const calls=[],requests=[],published=[],prompts=[];
  const get=async path=>{
    requests.push(path);
    if(path.startsWith("/latest")) return {body:{topic_list:{topics:Array.from({length:topicCount},(_,i)=>({id:7+i,title:"Funding",slug:"funding",bumped_at:start,pinned:false}))}}};
    if(path.startsWith("/u/")) return {body:{user:{created_at:"2020-01-01T00:00:00Z"}}};
    const id=Number(path.split("/")[2].split(".")[0]);
    if(path.includes("/posts.json")) return {body:{post_stream:{posts:Array.from({length:postCount},(_,i)=>({id:id*100+i+1,post_number:i+1,post_type:1,username:"alice",created_at:start,reply_to_post_number:null,hidden:false,raw:sampleThread().posts[0].raw}))}}};
    return {body:{id,title:"Funding",slug:"funding",created_at:start,post_stream:{stream:Array.from({length:postCount},(_,i)=>id*100+i+1)}}};
  };
  const modelRun=async({prompt})=>{
    prompts.push(prompt);
    const job=JSON.parse(prompt.split('\n').find(line=>line.startsWith('{"job":'))).job;
    calls.push(job.name);
    let output;
    if(job.task==="summary") {
      const id=Number(job.citable[0].split("/")[0]),s={text:"The opening post proposes ending funding.",cites:[`${id}/1`]};
      output={task:"summary",topic:job.topic,card:{title:"Funding",byline:"A funding discussion",keywords:["funding","grants"],interests:["grants"]},headline:"A funding proposal",overview:[s],points:[{id:"p1",...s}],issues:[{id:"q1",issue:"Should funding end?",description:s,decision_at_stake:s,positions_with_post_references:[{label:"Opening proposal",...s}],unresolved_status:s,points:["p1"],related_issues:[],...Object.fromEntries(ISSUE_DETAIL_IDS.map(id=>[id,[]]))}]};
    } else {
      output=goodMarks();output.topic_id=job.topic_id;
      output.posts=job.expected.map(number=>({...goodMarks().posts[0],post_number:number,post_ref:`${job.topic_id}/${number}`,issue_ids:["q1"]}));
    }
    return {output,runtime:"fixture",elapsed_ms:1,reported_model:null,cost_usd:null,usage:{input_tokens:10,output_tokens:5}};
  };
  return {calls,requests,published,prompts,options:{store:h.store,root:h.root,reviewNewThreads:false,settings:{...settings,concurrency:3},get,modelRun,
    server:async(command,...args)=>command==="publish-import"?mockPublication(h,readJsonStrict(args[1]),data=>{published.push(data.topic.id);return sha256(`fixture-${data.topic.id}`);}):'',clock:()=>end,progress:()=>{}}};
}

test("remote import transfers only artifacts, validates against production, and preserves account state",async()=>{
  const h=harness(),m=miniOptions(h,2),local=mkdtempSync(join(tmpdir(),"zforum-worker-"));
  try {
    h.store.db.exec("CREATE TABLE accounts(id TEXT, credential TEXT); INSERT INTO accounts VALUES('reader','keep');");
    const fetched=await runImport({...m.options,since:start});
    const sources=exportImport(h.store.active(),h.root);
    assert.equal(JSON.stringify(sources).includes('"credential"'),false);
    const state=receiveSources(sources,local);
    await analyzeImportTopics({state,root:local,maxCalls:4,modelRun:m.options.modelRun,save:()=>{},progress:()=>{}});
    assert.equal(h.store.active().topics[0].status,"fetched");
    const bundle=exportAnalysis(state,local);
    const original=h.store.active();
    const wrongRun=structuredClone(bundle);wrongRun.run="different";
    assert.throws(()=>acceptAnalysis(wrongRun,h.store,h.root,()=>{}),{message:"Analysis does not match the active frozen import"});
    const traversal=structuredClone(bundle);traversal.topics[0].files["../escape.json"]="{}";
    assert.throws(()=>acceptAnalysis(traversal,h.store,h.root,()=>{}),{message:"Invalid transfer artifact: ../escape.json"});
    const corrupt=structuredClone(bundle);corrupt.topics[1].files["site.json"]="{}";
    assert.throws(()=>acceptAnalysis(corrupt,h.store,h.root,()=>{}),{message:"candidate site file changed after validation"});
    assert.deepEqual(h.store.active(),original);
    const accepted=acceptAnalysis(bundle,h.store,h.root,()=>{});
    assert.deepEqual(accepted.topics.map(t=>t.status),["analyzed","analyzed"]);
    assert.equal(m.published.length,0);
    assert.deepEqual(h.store.db.prepare("SELECT * FROM accounts").all().map(row=>({...row})),[{id:"reader",credential:"keep"}]);
    acceptAnalysis(bundle,h.store,h.root,()=>{});
    await runImport({...m.options,stage:"publish",get:()=>assert.fail("publication fetched"),modelRun:()=>assert.fail("publication called AI")});
    assert.equal(m.published.length,2);
    assert.equal(h.store.db.prepare("SELECT credential FROM accounts").get().credential,"keep");
    assert.equal(h.store.active(),null);
    assert.equal(fetched.topics.length,2);
  } finally {h.close();rmSync(local,{recursive:true,force:true});}
});

test("receiving analysis keeps topic names independent of staging and archive directories",async()=>{
  for (const names of [["funding","funding-previous"],["incoming","previous"],["previous","previous-previous"]]) {
    const h=harness(),m=miniOptions(h,2);
    try {
      for (const [index,name] of names.entries()) {
        const release=`baseline-${index}`;
        h.store.db.prepare("INSERT INTO releases VALUES(?,?)").run(release,JSON.stringify({topic:{id:name,threads:[{id:7+index}]}}));
        h.store.db.prepare("INSERT INTO published VALUES(?,?)").run(name,release);
      }
      await runImport({...m.options,since:start});
      await runImport({...m.options,stage:"analyze",maxCalls:4});
      const bundle=exportAnalysis(h.store.active(),h.root);
      for (let retry=0;retry<2;retry++) {
        const accepted=acceptAnalysis(bundle,h.store,h.root,()=>{});
        assert.deepEqual(accepted.topics.map(topic=>topic.id),names);
        assert.deepEqual(accepted.topics.map(topic=>topic.status),["analyzed","analyzed"]);
      }
      assert.equal(m.published.length,0);
    } finally {h.close();}
  }
});

test("reply content equality ignores serialized object order but detects substantive changes",()=>{
  const rng=random(561),posts=sampleThread().posts;
  const reorder=value=>{
    if(Array.isArray(value))return value.map(reorder);
    if(value===null||typeof value!=='object')return value;
    const entries=Object.entries(value);
    for(let i=entries.length-1;i>0;i--){const j=rng.int(0,i);[entries[i],entries[j]]=[entries[j],entries[i]];}
    return Object.fromEntries(entries.map(([key,v])=>[key,reorder(v)]));
  };
  for(let iteration=0;iteration<100;iteration++)for(const post of posts) {
    const reordered=reorder(post);assert.equal(sameReplyContent(post,reordered),true);
    for(const field of ['raw','own_text','reply_to','segments']) {
      const edited=structuredClone(reordered);
      if(field==='segments')edited.segments=[{kind:'text',text:'changed'}];
      else if(field==='reply_to')edited.reply_to=(post.reply_to??0)+1;
      else edited[field]=`${post[field]??''} changed`;
      assert.equal(sameReplyContent(post,edited),false);
    }
    const metadata={...reordered,username:'renamed',created_at:'2026-11-03T00:00:00Z'};
    assert.equal(sameReplyContent(post,metadata),true);
  }
});

test("optimized imports summarize afresh, preserve accepted replies, and analyze only additions or edits",async()=>{
  const h=harness();let round=0,release=0;
  const execute=async(postCount,{edit=false,limit=10,model="fixture"}={})=>{
    const m=miniOptions(h,1,postCount),get=m.options.get,modelRun=m.options.modelRun;
    const options={...m.options,settings:{...m.options.settings,analysisPolicy:REPLY_ANALYSIS_POLICY,model},
      clock:()=>new Date(Date.parse(end)+(++round)*86400000).toISOString(),
      get:async path=>{const value=await get(path);if(edit&&path.includes("/posts.json"))value.body.post_stream.posts.find(p=>p.post_number===2).raw+='\nEdited clarification.';return value;},
      modelRun:async args=>{const result=await modelRun(args);if(result.output.task==='marks')for(const post of result.output.posts)post.issue_ids=[];return result;},
      server:async(command,...args)=>{
        if(command!=="publish-import")return '';
        return mockPublication(h,readJsonStrict(args[1]),data=>{
          const id=sha256(`release-${++release}`);data.release_id=id;
          h.store.db.prepare("INSERT INTO releases VALUES(?,?)").run(id,JSON.stringify(data));
          h.store.db.prepare("INSERT INTO published VALUES(?,?) ON CONFLICT(topic) DO UPDATE SET release=excluded.release").run(data.topic.id,id);
          return id;
        });
      }};
    const state=await runImport({...options,since:release===0?start:undefined});
    await runImport({...options,stage:'analyze',maxCalls:limit});
    const transfer=exportAnalysis(h.store.active(),h.root);
    acceptAnalysis(transfer,h.store,h.root,()=>{});
    const candidate=readJsonStrict(join(h.root,state.id,'thread-7','candidate','site.json'));
    await runImport({...options,stage:'publish'});
    return {m,state,candidate};
  };
  try {
    const first=await execute(3);
    assert.equal(first.m.calls.filter(name=>name.startsWith('summary-')).length,1);
    assert.equal(first.m.calls.filter(name=>name.startsWith('marks-')).length,1);
    const second=await execute(4);
    assert.deepEqual(second.m.calls,['summary-thread-7','marks-7-4-4']);
    for(let i=0;i<3;i++) {
      assert.deepEqual(second.candidate.topic.threads[0].posts[i].analysis,first.candidate.topic.threads[0].posts[i].analysis);
      assert.deepEqual(second.candidate.topic.threads[0].posts[i].analysis_run,first.candidate.topic.threads[0].posts[i].analysis_run);
    }
    const third=await execute(4,{edit:true});
    assert.deepEqual(third.m.calls,['summary-thread-7','marks-7-2-2']);
    assert.notDeepEqual(third.candidate.topic.threads[0].posts[1].analysis_run,second.candidate.topic.threads[0].posts[1].analysis_run);
    assert.deepEqual(third.candidate.topic.threads[0].posts[0].analysis_run,first.candidate.topic.threads[0].posts[0].analysis_run);
    const fourth=await execute(4,{edit:true,model:'next-model'});
    assert.deepEqual(fourth.m.calls,['summary-thread-7']);
    assert.deepEqual(fourth.candidate.topic.threads[0].posts.map(p=>p.analysis),third.candidate.topic.threads[0].posts.map(p=>p.analysis));
    const snapshot=readJsonStrict(join(h.root,fourth.state.id,'thread-7','snapshot.json'));
    const plans=frozenJobs(snapshot,fourth.state.settings.prompts);
    assert.equal(plans.filter(p=>p.reuse).length,4);
    const identities=new Map(plans.filter(p=>p.reuse).map(p=>[p.job.name,p.input]));
    const metadata=structuredClone(snapshot);metadata.threads[0].posts[0].username='renamed';metadata.threads[0].posts[0].created_at='2026-11-01T01:00:00Z';
    for(const post of metadata.threads[0].posts)post.segments=post.segments.map(segment=>Object.fromEntries(Object.entries(segment).reverse()));
    assert.deepEqual(new Map(frozenJobs(metadata,fourth.state.settings.prompts).filter(p=>p.reuse).map(p=>[p.job.name,p.input])),identities);
    for(let added=1;added<=20;added++) {
      const extended=structuredClone(snapshot),thread=extended.threads[0];
      for(let n=0;n<added;n++)thread.posts.push({...thread.posts[0],number:100+n,forum_id:10000+n,raw:'A new reply.',own_text:'A new reply.',segments:[{kind:'text',text:'A new reply.'}]});
      const fresh=frozenJobs(extended,fourth.state.settings.prompts);
      assert.deepEqual(new Map(fresh.filter(p=>p.reuse).map(p=>[p.job.name,p.input])),identities);
      for(const plan of fresh.filter(p=>!p.reuse&&p.job.task==='marks'))assert.deepEqual(plan.job.issues,[]);
    }
    const hidden=structuredClone(snapshot);hidden.threads[0].posts[0]={...hidden.threads[0].posts[0],hidden:true,raw:null,own_text:null,segments:null};
    hidden.analysisBaseline.threads[0].posts[1].analysis.context_refs=['7/1'];
    const hiddenPlans=frozenJobs(hidden,fourth.state.settings.prompts);
    assert.equal(hiddenPlans.filter(p=>p.job.task==='marks'&&!p.reuse).length,0);
    const retained=hiddenPlans.find(p=>p.job.name==='reuse-7-2');
    const projected=retainedOutput(retained.reuse.output,hidden).posts[0];
    assert.deepEqual(projected.context_refs,[]);
    assert.match(projected.context_limitations.at(-1),/no longer publicly available/);
    assert.equal(projected.neutral_rendition,retained.reuse.output.posts[0].neutral_rendition);
    const reused=plans.find(p=>p.reuse),directory=join(h.root,fourth.state.id,'thread-7','candidate');
    const path=join(directory,`${reused.job.name}.json`),record=readJsonStrict(path);record.output.posts[0].summary='Tampered retained result';writeJsonAtomic(path,record);
    assert.throws(()=>validateCandidate(directory,snapshot,fourth.state.settings.prompts),/reused analysis differs/);
  } finally {h.close();}
});

test('future pulls reuse checked summaries only for unchanged source and matching prompts',async()=>{
  const h=harness();let round=0,release=0;
  const scenarios=[
    {count:3,expected:['summary-thread-7','marks-7-1-3']},
    {count:3,profile:true,expected:[]},
    {count:4,expected:['summary-thread-7','marks-7-4-4']},
    {count:4,edit:true,expected:['summary-thread-7','marks-7-2-2']},
    {count:4,edit:true,hidden:true,expected:['summary-thread-7']},
    {count:4,edit:true,removed:true,expected:['summary-thread-7']},
    {count:4,edit:true,removed:true,title:'Renamed',expected:['summary-thread-7']},
    {count:4,edit:true,removed:true,title:'Renamed',summaryPrompt:'Revised summary prompt',expected:['summary-thread-7']},
    {count:4,edit:true,removed:true,title:'Renamed',summaryPrompt:'Revised summary prompt',expected:[]},
  ];
  try {
    let previous=null;
    for(const scenario of scenarios) {
      const m=miniOptions(h,1,scenario.count),date=new Date(Date.parse(end)+(round++)*86400000).toISOString();
      const options={...m.options,clock:()=>date,settings:{...m.options.settings,analysisPolicy:REPLY_ANALYSIS_POLICY,summaryReusePolicy:SUMMARY_REUSE_POLICY,batchRepairPolicy:BATCH_REPAIR_POLICY,
        prompts:{...m.options.settings.prompts,summary:scenario.summaryPrompt??settings.prompts.summary}},
        get:async path=>{
          const result=await m.options.get(path);
          if(path.startsWith('/u/')&&scenario.profile)result.body.user.created_at='2021-01-01T00:00:00Z';
          if(path.includes('/posts.json')) {
            const post=result.body.post_stream.posts.find(p=>p.post_number===2);
            if(scenario.edit)post.raw+=' A correction.';
            if(scenario.hidden)post.hidden=true;
            if(scenario.removed)result.body.post_stream.posts=result.body.post_stream.posts.filter(p=>p.post_number!==2);
          }else if(path.startsWith('/t/')){
            if(scenario.title)result.body.title=scenario.title;
            if(scenario.removed)result.body.post_stream.stream=result.body.post_stream.stream.filter(id=>id!==702);
          }
          return result;
        },
        modelRun:async args=>{const result=await m.options.modelRun(args);if(result.output.task==='marks')result.output.posts.forEach(post=>{post.issue_ids=[];});return result;},
        server:async(command,...args)=>{
          assert.equal(command,'publish-import');
          return mockPublication(h,readJsonStrict(args[1]),data=>{
            const id=sha256(`future-release-${++release}`);data.release_id=id;
            h.store.db.prepare('INSERT INTO releases VALUES(?,?)').run(id,JSON.stringify(data));
            h.store.db.prepare('INSERT INTO published VALUES(?,?) ON CONFLICT(topic) DO UPDATE SET release=excluded.release').run(data.topic.id,id);
            return id;
          });
        }};
      const state=await runImport({...options,since:release===0?start:undefined});
      await runImport({...options,stage:'analyze',maxCalls:5});
      assert.deepEqual(m.calls,scenario.expected);
      const directory=join(h.root,state.id,'thread-7','candidate'),data=readJsonStrict(join(directory,'site.json'));
      const audit=readJsonStrict(join(h.root,state.id,'audit.json'));
      assert.equal(audit.savings.retained_summaries,scenario.expected.length===0?1:0);
      if(scenario.expected.length===0) {
        assert.deepEqual(data.topic.overview,previous.topic.overview);
        assert.deepEqual(data.analysis_runs.find(r=>r.job==='summary-thread-7'),previous.analysis_runs.find(r=>r.job==='summary-thread-7'));
        const snapshot=readJsonStrict(join(h.root,state.id,'thread-7','snapshot.json'));
        const job=frozenJobs(snapshot,state.settings.prompts)[0].job;
        const changes=[
          s=>{s.threads[0].title+=' changed';},s=>{s.threads[0].slug+='-changed';},
          s=>{s.threads[0].id+=100;},s=>{s.threads[0].created_at='2022-01-01T00:00:00Z';},
          s=>{s.threads[0].posts.pop();},s=>{s.threads.push({...s.threads[0],id:99});},
        ];
        for(const postIndex of snapshot.threads[0].posts.keys())for(const field of ['raw','own_text','username','created_at','reply_to','number','hidden','segments','forum_id']) {
          changes.push(s=>{const post=s.threads[0].posts[postIndex];post[field]=field==='hidden'?!post.hidden:field==='segments'?[]:field==='reply_to'||field==='number'||field==='forum_id'?999:`${post[field]} changed`;});
        }
        for(const change of changes){const changed=structuredClone(snapshot);change(changed);assert.equal(summaryReuse(changed,state.settings.prompts.summary,job),null);}
        const path=join(directory,'summary-thread-7.json'),record=readJsonStrict(path),tampered=structuredClone(record);
        tampered.output.headline='Tampered';writeJsonAtomic(path,tampered);
        assert.throws(()=>validateCandidate(directory,snapshot,state.settings.prompts),{message:'summary-thread-7: reused summary differs from accepted baseline'});
        writeJsonAtomic(path,record);
      }
      if(scenario.profile)assert.equal(data.topic.threads[0].posts[0].account.created_at,'2021-01-01T00:00:00Z');
      await runImport({...options,stage:'publish'});previous=data;
    }
  }finally{h.close();}
});

test('profile requests are shared across topics and counted separately from cache hits',async()=>{
  const h=harness(),m=miniOptions(h,8,2);
  try {
    const state=await runImport({...m.options,since:start});
    assert.deepEqual(m.requests.filter(path=>path.startsWith('/u/')),['/u/alice.json']);
    const audit=readJsonStrict(join(h.root,state.id,'audit.json'));
    assert.equal(audit.savings.profile_cache_hits,7);
    assert.equal(audit.savings.profile_cache_misses,1);
    assert.equal(audit.timings['fetch.profiles'].operations,1);
  }finally{h.close();}
});

test("prepared optimized import stages without models, network, personal replacement or cutoff advancement",async()=>{
  const draft=harness(),production=harness(),m=miniOptions(draft,1,2);
  const options={...m.options,settings:{...m.options.settings,analysisPolicy:REPLY_ANALYSIS_POLICY},modelRun:async args=>{
    const result=await m.options.modelRun(args);if(result.output.task==='marks')result.output.posts.forEach(post=>{post.issue_ids=[];});return result;
  }};
  try {
    production.store.db.exec("CREATE TABLE accounts(id TEXT PRIMARY KEY,label TEXT); INSERT INTO accounts VALUES('existing','Preserve me');");
    await runImport({...options,since:start});
    assert.throws(()=>prepareImport(draft.store,draft.root),{message:"Prepare requires a fully analyzed, unpublished import"});
    await runImport({...options,stage:'analyze',maxCalls:2});
    const bundle=prepareImport(draft.store,draft.root);
    const stale=structuredClone(bundle);stale.base_cutoff=start;
    await assert.rejects(stagePreparedImport(stale,production.store,production.root,()=>assert.fail('stale server call'),()=>{}),{message:"Production import cutoff changed since preparation"});
    const corrupt=structuredClone(bundle);corrupt.source.topics[0].files['site.json']='{}';
    await assert.rejects(stagePreparedImport(corrupt,production.store,production.root,()=>assert.fail('corrupt server call'),()=>{}),{message:"candidate site file changed after validation"});
    assert.equal(production.store.active(),null);
    // A fresh production directory is used after intentionally placing corrupt scratch artifacts.
    const root=join(production.root,'staging');
    const calls=[];
    const server=async(command,...args)=>{calls.push(command);return '';};
    const state=await stagePreparedImport(bundle,production.store,root,server,()=>{});
    assert.equal(state.id,bundle.source.state.id);
    assert.deepEqual(state.topics.map(t=>t.status),['analyzed']);
    assert.equal(production.store.cutoff(),null);
    assert.deepEqual(calls,['record-pull']);
    assert.equal(production.store.db.prepare('SELECT label FROM accounts').get().label,'Preserve me');
    assert.equal(production.store.db.prepare('SELECT count(*) n FROM published').get().n,0);
    await stagePreparedImport(bundle,production.store,root,server,()=>{});
    const changed=structuredClone(bundle);changed.source.state.settings.model='different-model';
    await assert.rejects(stagePreparedImport(changed,production.store,root,server,()=>{}),{message:"Prepared import differs from the active frozen import"});
    const other=structuredClone(bundle);other.source.state.id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await assert.rejects(stagePreparedImport(other,production.store,root,server,()=>{}),{message:"Another production import is unfinished"});
  } finally {draft.close();production.close();}
});

test("every hidden/deleted/removed combination and interrupted pull preserves published data until explicit publication",async()=>{
  // Three states plus visible for each of two replies; the opening remains public.
  for(let mask=0;mask<16;mask++) {
    const h=harness(),m=miniOptions(h,1,3);
    try {
      h.store.db.exec("CREATE TABLE restrictions(post TEXT PRIMARY KEY,observed INTEGER); INSERT INTO restrictions VALUES('other/1',1);");
      await runImport({...m.options,since:start});
      await runImport({...m.options,stage:'analyze',maxCalls:2});
      const data=readJsonStrict(join(h.root,h.store.active().id,'thread-7','candidate','site.json'));
      h.store.db.prepare('INSERT INTO releases VALUES(?,?)').run('baseline',JSON.stringify(data));
      h.store.db.prepare('INSERT INTO published VALUES(?,?)').run('thread-7','baseline');
      await runImport({...m.options,stage:'publish'});
      const tables=['releases','published','restrictions','source_pulls'];
      const publicState=()=>tables.map(table=>h.store.db.prepare(`SELECT * FROM ${table}`).all());
      const baseline=publicState(),cutoff=h.store.cutoff();
      let interrupted=true;
      const mode=number=>(mask>>((number-2)*2))&3;
      const get=async path=>{
        const result=await m.options.get(path);
        if(path.includes('/posts.json')) {
          result.body.post_stream.posts=result.body.post_stream.posts.filter(p=>p.post_number===1||mode(p.post_number)!==3);
          for(const p of result.body.post_stream.posts)if(p.post_number>1) {
            if(mode(p.post_number)===1)p.hidden=true;
            if(mode(p.post_number)===2)p.deleted_at=end;
          }
        } else if(path.startsWith('/t/'))result.body.post_stream.stream=result.body.post_stream.stream.filter(id=>id===701||mode(id-700)!==3);
        if(path.startsWith('/u/')&&interrupted)throw new Error('fixture interrupted after source observations');
        return result;
      };
      const options={...m.options,get,clock:()=>"2026-11-03T00:00:00.000Z",server:()=>assert.fail('preparation invoked a server operation')};
      await assert.rejects(runImport(options),{message:'fixture interrupted after source observations'});
      assert.deepEqual(publicState(),baseline);
      interrupted=false;
      const state=await runImport(options);
      assert.deepEqual(state.topics[0].changes.unavailable.sort(),[2,3].filter(n=>mode(n)!==0).map(n=>`7/${n}`));
      await runImport({...options,stage:'preview'});
      await runImport({...options,stage:'analyze',maxCalls:2});
      assert.deepEqual(publicState(),baseline);
      assert.equal(h.store.cutoff(),cutoff);
    } finally {h.close();}
  }
});

test("real SQLite staging keeps restrictions and published content intact, then publishes hidden posts atomically",async()=>{
  const h=harness(),productionRoot=mkdtempSync(join(tmpdir(),'zforum-staging-boundary-')),m=miniOptions(h,1,3);
  let production;
  const db=join(productionRoot,'live.sqlite');
  const server=async(command,...args)=>(await runProcess('server/target/release/zforum-server',[command,'--db',db,...args],{timeoutSeconds:30})).stdout;
  const options={...m.options,settings:{...m.options.settings,analysisPolicy:REPLY_ANALYSIS_POLICY,summaryReusePolicy:SUMMARY_REUSE_POLICY,batchRepairPolicy:BATCH_REPAIR_POLICY},modelRun:async args=>{
    const result=await m.options.modelRun(args);if(result.output.task==='marks')result.output.posts.forEach(post=>{post.issue_ids=[];});return result;
  }};
  try {
    await server('report');production=new ImportStore(db);
    await runImport({...options,since:start});await runImport({...options,stage:'analyze',maxCalls:2});
    const baseline=prepareImport(h.store,h.root);
    await stagePreparedImport(baseline,production,productionRoot,server,()=>{});
    await runImport({...options,store:production,root:productionRoot,server,stage:'publish'});
    const first=production.published('thread-7');
    // Seed the next local draft with the actual published baseline, retaining its source.
    h.store.db.prepare('INSERT INTO releases VALUES(?,?)').run(first.release_id,JSON.stringify(first));
    h.store.db.prepare('INSERT INTO published VALUES(?,?)').run('thread-7',first.release_id);
    const completed=production.db.prepare('SELECT state FROM import_runs WHERE id=?').get(baseline.source.state.id);
    h.store.save(JSON.parse(completed.state));
    h.store.recordSummary('thread-7',production.summary('thread-7'));
    assert.deepEqual(h.store.summaryBaseline('thread-7',options.settings.prompts.summary),production.summaryBaseline('thread-7',options.settings.prompts.summary));
    const changed={...options,clock:()=>"2026-11-03T00:00:00.000Z",get:async path=>{
      const result=await m.options.get(path);if(path.includes('/posts.json'))result.body.post_stream.posts[1].hidden=true;return result;
    }};
    await runImport(changed);await runImport({...changed,stage:'analyze',maxCalls:2});
    const bundle=prepareImport(h.store,h.root),calls=[];
    const watchedServer=async(command,...args)=>{calls.push(command);return server(command,...args);};
    const before=production.published('thread-7');
    for(let retry=0;retry<2;retry++) {
      await stagePreparedImport(bundle,production,productionRoot,watchedServer,()=>{});
      assert.deepEqual(production.published('thread-7'),before);
      assert.deepEqual(production.db.prepare('SELECT * FROM restrictions').all(),[]);
      assert.equal(production.cutoff(),end);
    }
    assert.deepEqual(calls,['record-pull','record-pull']);
    await runImport({...changed,store:production,root:productionRoot,server:watchedServer,stage:'publish'});
    const after=production.published('thread-7');
    assert.notEqual(after.release_id,before.release_id);
    assert.equal(after.topic.threads[0].posts[1].hidden,true);
    assert.equal(after.topic.threads[0].posts[1].raw,null);
    assert.equal(after.topic.threads[0].posts[0].hidden,false);
    assert.equal(after.visibility_pending,undefined);
    assert.deepEqual(production.db.prepare('SELECT post FROM restrictions ORDER BY post').all().map(row=>row.post),['7/2']);
    assert.equal(production.cutoff(),'2026-11-03T00:00:00.000Z');
    assert.deepEqual(calls,['record-pull','record-pull','publish-import']);
  } finally {production?.close();h.close();rmSync(productionRoot,{recursive:true,force:true});}
});

test("publication response failure preserves an already committed import",async()=>{
  const h=harness(),m=miniOptions(h,2);
  try {
    const state=await runImport({...m.options,since:start});await runImport({...m.options,stage:'analyze',maxCalls:4});
    let calls=0;
    const server=async(command,...flags)=>{assert.equal(command,'publish-import');calls++;const packet=readJsonStrict(flags[1]);assert.deepEqual(packet.topics.map(t=>t.id),['thread-7','thread-8']);mockPublication(h,packet);return '{}';};
    await assert.rejects(runImport({...m.options,stage:'publish',server}),{message:`Import ${state.id} is already atomically published; reporting failed: Atomic publication returned invalid release identities`});
    assert.equal(calls,1);assert.equal(h.store.active(),null);assert.equal(h.store.cutoff(),end);
  }finally{h.close()}
});

test("excluded discovery threads receive no fetch or model work while tracked topics remain intact",async()=>{
  const h=harness(),m=miniOptions(h,2);
  try {
    const options={...m.options,settings:{...m.options.settings,excludedDiscoveryThreads:[8]}};
    const state=await runImport({...options,since:start});
    assert.deepEqual(state.topics.map(t=>t.id),['thread-7']);assert.deepEqual(state.discovery.excluded_threads,[8]);
    assert.equal(m.requests.some(path=>path.startsWith('/t/8')),false);
    await runImport({...options,stage:'analyze',maxCalls:2});assert.deepEqual(m.calls,['summary-thread-7','marks-7-1-1']);
  }finally{h.close()}
  const tracked=harness(),existing=miniOptions(tracked,2);
  try {
    tracked.store.register([{id:8}]);
    const state=await runImport({...existing.options,since:start,settings:{...existing.options.settings,excludedDiscoveryThreads:[8]}});
    assert.deepEqual(state.topics.map(t=>t.id),['thread-7','thread-8']);
    assert.equal(existing.requests.some(path=>path.startsWith('/t/8')),true);
  }finally{tracked.close()}
});

test("future new threads require a bounded cheap review before history/model work and remember exclusions",async()=>{
  const h=harness({reviews:true}),m=miniOptions(h,2),originalGet=m.options.get;
  const get=async path=>{const result=await originalGet(path);if(/^\/t\/\d+\.json/.test(path))result.body.post_stream.posts=[{post_number:1,hidden:false,raw:'opening '.repeat(200)}];return result;};
  const options={...m.options,get,reviewNewThreads:true,settings:{...m.options.settings,analysisPolicy:REPLY_ANALYSIS_POLICY},modelRun:async args=>{const result=await m.options.modelRun(args);if(result.output.task==='marks')result.output.posts.forEach(p=>{p.issue_ids=[];});return result;}};
  try {
    const first=await runImport({...options,since:start});assert.equal(first.review.status,'pending');assert.deepEqual(first.topics,[]);assert.deepEqual(m.calls,[]);
    assert.equal(m.requests.some(path=>path.includes('/posts.json')||path.startsWith('/u/')),false);
    const file=join(h.root,first.id,'new-thread-review.json'),review=readJsonStrict(file);
    assert.deepEqual(review.threads.map(t=>t.excerpt.length),[600,600]);
    await assert.rejects(runImport({...options,stage:'analyze',maxCalls:4}),{message:'New-thread review is pending; confirm the staged decisions with fetch --review FILE before analysis or publication'});
    review.threads.forEach((t,index)=>Object.assign(t,{classification:index?'frivolous':'substantive',decision:index?'exclude':'include',reason:index?'Social-only thread':'Grant proposal'}));
    writeJsonAtomic(file,review);
    const duplicate=structuredClone(review);duplicate.threads[1].id=duplicate.threads[0].id;const duplicated=join(h.root,'duplicate.json');writeJsonAtomic(duplicated,duplicate);
    await assert.rejects(runImport({...options,reviewFile:duplicated}),{message:'New-thread review repeats thread IDs'});
    const corrupt=structuredClone(review);corrupt.threads[0].title='Changed source';const wrong=join(h.root,'wrong.json');writeJsonAtomic(wrong,corrupt);
    await assert.rejects(runImport({...options,reviewFile:wrong}),{message:'New-thread review source changed at position 0'});
    assert.equal(h.store.threadReview(7),null);assert.equal(h.store.threadReview(8),null);
    const fetched=await runImport({...options,reviewFile:file});assert.deepEqual(fetched.topics.map(t=>t.id),['thread-7']);assert.equal(fetched.review.status,'confirmed');
    await runImport({...options,reviewFile:file});
    await assert.rejects(runImport({...options,reviewFile:wrong}),{message:'New-thread review source changed at position 0'});
    assert.equal(m.requests.some(path=>path.startsWith('/t/8/posts.json')),false);assert.deepEqual(h.store.threadReview(8),{decision:'exclude',classification:'frivolous',reason:'Social-only thread'});
    await runImport({...options,stage:'analyze',maxCalls:2});assert.deepEqual(m.calls,['summary-thread-7','marks-7-1-1']);
    const production=harness({reviews:true});try{
      production.store.db.exec("CREATE TABLE accounts(id TEXT,label TEXT); INSERT INTO accounts VALUES('reader','preserve');");
      const prepared=prepareImport(h.store,h.root);await stagePreparedImport(prepared,production.store,production.root,async()=>'',()=>{});
      assert.deepEqual(production.store.threadReview(8),{decision:'exclude',classification:'frivolous',reason:'Social-only thread'});assert.equal(production.store.active().topics[0].status,'analyzed');assert.equal(production.store.cutoff(),null);assert.equal(production.store.db.prepare('SELECT label FROM accounts').get().label,'preserve');
    }finally{production.close();}
    await runImport({...options,stage:'publish'});
    m.requests.length=0;const next=await runImport({...options,clock:()=>"2026-11-03T00:00:00.000Z"});assert.equal(next.review,null);assert.deepEqual(next.topics.map(t=>t.id),['thread-7']);assert.equal(m.requests.some(path=>path.startsWith('/t/8')),false);
    const reopened=new ImportStore(join(h.root,'db.sqlite'),{readOnly:true});try{assert.deepEqual(reopened.threadReview(8),{decision:'exclude',classification:'frivolous',reason:'Social-only thread'});}finally{reopened.close();}
  }finally{h.close()}
});

test("new-thread review decisions cover inclusion, exclusion and mixed windows without paid classification",async()=>{
  for(const mask of [0,1,2,3]){
    const h=harness({reviews:true}),m=miniOptions(h,2),get=m.options.get;
    const options={...m.options,reviewNewThreads:true,get:async path=>{const result=await get(path);if(/^\/t\/\d+\.json/.test(path))result.body.post_stream.posts=[{post_number:1,hidden:false,raw:'A short opening.'}];return result;}};
    try{
      const state=await runImport({...options,since:start}),file=join(h.root,state.id,'new-thread-review.json'),review=readJsonStrict(file);
      review.threads.forEach((t,i)=>Object.assign(t,{classification:mask&(1<<i)?'frivolous':'uncertain',decision:mask&(1<<i)?'exclude':'include',reason:mask&(1<<i)?'Social-only':'Keep uncertain material'}));writeJsonAtomic(file,review);
      const fetched=await runImport({...options,reviewFile:file});assert.deepEqual(fetched.topics.map(t=>t.id),[7,8].filter((id,i)=>!(mask&(1<<i))).map(id=>`thread-${id}`));assert.deepEqual(m.calls,[]);
      for(const id of [7,8])if(mask&(1<<(id-7)))assert.equal(m.requests.some(path=>path.startsWith(`/t/${id}/posts.json`)),false);
      await runImport({...options,stage:'analyze',maxCalls:4});await runImport({...options,stage:'publish'});assert.equal(h.store.active(),null);assert.equal(h.store.cutoff(),end);
    }finally{h.close()}
  }
});

test("global analysis allowance spans topics, retries and concurrent marks",async()=>{
  for (const limit of [1,2,3,4,5,6]) {
    const h=harness(),m=miniOptions(h,3);
    try {
      await runImport({...m.options,since:start});
      const result=runImport({...m.options,stage:"analyze",maxCalls:limit});
      if(limit<6) await assert.rejects(result,{message:`Global call limit ${limit} reached; review preview then resume analyze with an explicit limit`});
      else await result;
      assert.equal(m.calls.length,limit);assert.equal(m.published.length,0);
    } finally {h.close();}
  }
  const h=harness(),m=miniOptions(h,1,17);
  try {
    await runImport({...m.options,since:start});
    await assert.rejects(runImport({...m.options,stage:"analyze",maxCalls:2}),{message:"Global call limit 2 reached; review preview then resume analyze with an explicit limit"});
    assert.equal(m.calls.length,2);
    await runImport({...m.options,stage:"analyze",maxCalls:2});
    assert.equal(m.calls.length,4);assert.equal(m.published.length,0);
  } finally {h.close();}
  for(const limit of [1,2]) {
    const h=harness(),m=miniOptions(h);let count=0;
    try {
      await runImport({...m.options,since:start});
      await assert.rejects(runImport({...m.options,stage:"analyze",maxCalls:limit,modelRun:async options=>{count++;const result=await m.options.modelRun(options);result.output.card.interests=[];return result;}}),{message:`Global call limit ${limit} reached; review preview then resume analyze with an explicit limit`});
      assert.equal(count,limit);assert.equal(m.published.length,0);
    } finally {h.close();}
  }
});

test("scoped fetch requests only its thread and validates frozen inputs before later stages",async()=>{
  const h=harness(),m=miniOptions(h,3);
  try {
    const state=await runImport({...m.options,since:start,thread:7});
    const fetchPreview=readJsonStrict(join(h.root,state.id,"preview.json"));
    assert.deepEqual(state.topics.map(topic=>topic.id),["thread-7"]);
    assert.equal(m.requests.some(path=>path.startsWith("/latest")),false);
    assert.equal(m.calls.length,0);assert.equal(m.published.length,0);
    const path=join(h.root,state.id,"thread-7","snapshot.json"),original=readJsonStrict(path);
    writeJsonAtomic(path,{...original,accounts:{}});
    await assert.rejects(runImport({...m.options,stage:"analyze",maxCalls:2}),{message:"Frozen snapshot changed: thread-7"});
    assert.equal(m.calls.length,0);
    writeJsonAtomic(path,original);
    await runImport({...m.options,stage:"analyze",maxCalls:2});
    assert.equal(fetchPreview.topics[0].jobs[0].prompt_characters,m.prompts[0].length);
    assert.equal(fetchPreview.topics[0].jobs[1].prompt_characters,null);
    const site=join(h.root,state.id,"thread-7","candidate","site.json");
    writeJsonAtomic(site,{...readJsonStrict(site),snapshot_at:"changed"});
    await assert.rejects(runImport({...m.options,stage:"publish"}),{message:"candidate site file changed after validation"});
    assert.equal(m.published.length,0);
  } finally {h.close();}
});

test("fetch retry preserves the original change comparison after a source checkpoint failure",async()=>{
  const h=harness(),m=miniOptions(h);
  const record=h.store.recordSource.bind(h.store);let failed=false;
  h.store.recordSource=snapshot=>{record(snapshot);if(!failed){failed=true;throw new Error("checkpoint interruption");}};
  try {
    await assert.rejects(runImport({...m.options,since:start}),{message:"checkpoint interruption"});
    const state=await runImport(m.options);
    assert.deepEqual(state.topics[0].changes,{added:["7/1"],changed:[],unavailable:[]});
    assert.equal(m.calls.length,0);assert.equal(m.published.length,0);
  } finally {h.close();}
});

test("later stages require a completed pull; candidate corruption blocks all publication",async()=>{
  const h=harness(),m=miniOptions(h,2);
  try {
    for (const stage of ["preview","analyze","publish"]) await assert.rejects(runImport({...m.options,stage,maxCalls:2}),{message:`No unfinished import to ${stage}; run scripts/zforum import first`});
    const begun=h.store.begin(start,end,m.options.settings);
    await assert.rejects(runImport({...m.options,stage:"analyze",maxCalls:2}),{message:"Fetch is incomplete; run scripts/zforum import before analyze"});
    assert.equal(m.calls.length,0);
    await runImport(m.options);
    await runImport({...m.options,stage:"analyze",maxCalls:4});
    const site=join(h.root,begun.id,"thread-8","candidate","site.json");
    writeJsonAtomic(site,{...readJsonStrict(site),snapshot_at:"changed"});
    await assert.rejects(runImport({...m.options,stage:"publish"}),{message:"candidate site file changed after validation"});
    assert.equal(m.published.length,0);
  } finally {h.close();}
});

test("publication rejects stale releases but permits retry after a published candidate",()=>{
  const h=harness();
  try {
    const candidate={topic:{id:"thread-7",threads:[{id:7,posts:[{key:"7/1"}]}]}};
    h.store.assertPublicationBase("thread-7",null,candidate);
    const published=structuredClone(candidate);published.release_id="new";
    Object.assign(published.topic.threads[0].posts[0],{source_revision:"source",rendition_version:"rendition"});
    h.store.db.prepare("INSERT INTO releases VALUES(?,?)").run("new",JSON.stringify(published));
    h.store.db.prepare("INSERT INTO published VALUES(?,?)").run("thread-7","new");
    assert.doesNotThrow(()=>h.store.assertPublicationBase("thread-7",null,candidate));
    assert.throws(()=>h.store.assertPublicationBase("thread-7",null,{...candidate,headline:"Different"}),{message:"Published content for thread-7 changed since fetch; review the new release before publishing"});
  } finally {h.close();}
});
