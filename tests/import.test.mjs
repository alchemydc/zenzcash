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

function harness() {
  const root=mkdtempSync(join(tmpdir(),"zforum-import-")),path=join(root,"db.sqlite");
  const db=new DatabaseSync(path);
  db.exec("CREATE TABLE releases(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE published(topic TEXT PRIMARY KEY,release TEXT); CREATE TABLE source_pulls(snapshot TEXT,completed TEXT);");
  db.exec(readFileSync(new URL("../server/src/import-schema.sql",import.meta.url),"utf8")); db.close();
  const store=new ImportStore(path);
  return {root,store,close:()=>{store.close();rmSync(root,{recursive:true,force:true});}};
}
const end="2026-11-02T00:00:00.000Z",start="2026-11-01T00:00:00.000Z";
const settings={model:"fixture",timeoutSeconds:5,maxCallsPerTopic:20,discoveryMaxPages:10,prompts:{summary:"summary prompt",marks:"marks prompt"}};
test("strict UTC input, first-run requirement, unfinished resume, and backward coverage checkpoint",()=>{
  const h=harness();
  try {
    assert.equal(importTimestamp("2026-11-01T00:00:00Z"),start);
    for(const bad of ["yesterday","2026-02-30T00:00:00Z","2026-11-01T00:00:00","2026-11-01"]) assert.throws(()=>importTimestamp(bad),/exact UTC timestamp/);
    assert.throws(()=>h.store.begin(undefined,end,settings),/First import requires/);
    const first=h.store.begin(start,end,settings);
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
    if(command==="publish") {publications++; const data=readJsonStrict(args[1]);assert.equal(data.topic.id,"thread-7");return "fixture-release";}
    return "";
  };
  const options={since:start,store:h.store,root:h.root,settings,get,server,modelRun,clock:()=>end,progress:()=>{}};
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

test("CLI stages require an explicit analysis allowance and reject mixed or malformed options",()=>{
  assert.deepEqual(parseImportArgs([]),{stage:"fetch",since:undefined,db:undefined,thread:undefined,maxCalls:0});
  assert.deepEqual(parseImportArgs(["fetch",start,"--thread","58723","--db","trial.sqlite"]),{stage:"fetch",since:start,db:"trial.sqlite",thread:58723,maxCalls:0});
  assert.equal(parseImportArgs(["analyze","--max-calls","2"]).maxCalls,2);
  for (const stage of ["preview","publish"]) assert.equal(parseImportArgs([stage,"--db","trial.sqlite"]).stage,stage);
  assert.throws(()=>parseImportArgs(["analyze"]),{message:"analyze requires --max-calls N (global attempt limit, including retries)"});
  for (const value of ["0","-1","2.5","NaN","1e2","9007199254740992"]) assert.throws(()=>parseImportArgs(["analyze","--max-calls",value]),{message:`--max-calls must be a positive integer, received ${JSON.stringify(value)}`});
  assert.throws(()=>parseImportArgs(["publish","--max-calls","2"]),{message:"--max-calls applies only to analyze"});
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
    const job=JSON.parse(prompt.split("\n").find(line=>line.startsWith('{"task":')));
    calls.push(job.name);
    let output;
    if(job.task==="summary") {
      const id=Number(job.topic.slice(7)),s={text:"The opening post proposes ending funding.",cites:[`${id}/1`]};
      output={task:"summary",topic:job.topic,card:{title:"Funding",byline:"A funding discussion",keywords:["funding","grants"],interests:["grants"]},headline:"A funding proposal",overview:[s],points:[{id:"p1",...s}],issues:[{id:"q1",issue:"Should funding end?",description:s,decision_at_stake:s,positions_with_post_references:[{label:"Opening proposal",...s}],unresolved_status:s,points:["p1"],related_issues:[],...Object.fromEntries(ISSUE_DETAIL_IDS.map(id=>[id,[]]))}]};
    } else {
      output=goodMarks();output.topic_id=job.topic_id;
      output.posts=job.expected.map(number=>({...goodMarks().posts[0],post_number:number,post_ref:`${job.topic_id}/${number}`,issue_ids:["q1"]}));
    }
    return {output,runtime:"fixture",elapsed_ms:1,reported_model:null,cost_usd:null,usage:{input_tokens:10,output_tokens:5}};
  };
  return {calls,requests,published,prompts,options:{store:h.store,root:h.root,settings:{...settings,concurrency:3},get,modelRun,
    server:async(command,...args)=>{if(command==="publish")published.push(args);return "fixture-release";},clock:()=>end,progress:()=>{}}};
}

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
