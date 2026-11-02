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
import { readJsonStrict } from "../tools/lib/fsio.mjs";

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
    await assert.rejects(runImport(options),/interrupted model session/);
    assert.equal(publications,0);
    assert.equal(h.store.db.prepare("SELECT status FROM import_runs").get().status,"failed");
    fail=false;
    const result=await runImport({...options,since:undefined});
    assert.equal(result.status,"complete");assert.equal(calls,3);assert.equal(publications,1);
    assert.equal(result.topics[0].posts,4);
    const repeat=await runImport({...options,since:"2026-10-01T00:00:00Z",clock:()=>"2026-11-03T00:00:00Z"});
    assert.equal(calls,3);assert.equal(publications,2);
    assert.deepEqual(repeat.topics[0].changes,{added:[],changed:[],unavailable:[]});
    assert.equal(h.store.db.prepare("SELECT count(*) n FROM import_posts").get().n,4);
    assert.deepEqual(h.store.db.prepare("SELECT id FROM import_posts ORDER BY id").all().map(r=>r.id),[701,702,703,704]);
    const before=h.store.previous("thread-7"),bad=structuredClone(before);bad.threads[0].posts[0].number=99;
    assert.throws(()=>h.store.recordSource(bad),/moved/);
    assert.deepEqual(h.store.previous("thread-7"),before);
  }finally{h.close();}
});
