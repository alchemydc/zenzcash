import assert from "node:assert/strict";
import test from "node:test";
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TOPIC, RESULTS_DIR, PROMPTS_DIR, REPO_ROOT } from "../tools/lib/config.mjs";
import { corpusSnapshot } from './corpus-fixture.mjs';
import { readJsonStrict, writeJsonAtomic } from "../tools/lib/fsio.mjs";
import { fetchSnapshot, sourceChanges } from "../tools/lib/refresh-source.mjs";
import { forumClient } from "../tools/lib/forum-client.mjs";
import { analyzeCandidate, frozenJobs, validateCandidate } from "../tools/lib/refresh-analysis.mjs";
import { isolatedArguments, runnerArguments } from "../tools/lib/agent-runner.mjs";
import { compareCandidates, parseRefreshArgs } from "../tools/refresh.mjs";
import { runProcess } from "../tools/lib/process.mjs";
import { buildSiteData } from "../tools/build.mjs";
import { sha256 } from "../tools/lib/jobs.mjs";

const date = "2026-11-01T12:00:00Z";
const rawPost = (number, fields = {}) => ({ id: number, post_number: number, post_type: 1, username: "alice", created_at: date, reply_to_post_number: null, hidden: false, raw: `Source ${number}`, ...fields });
const previous = () => ({ threads: TOPIC.threadIds.map((id) => ({ id, title: "Before", slug: "before", created_at: date, posts: [1,2,3].map((number) => ({ number, username: "alice", hidden: false, raw: "Previous source", created_at: date, reply_to: null })) })) });
function mockForum({ failThread = null, unavailableThread = null } = {}) {
  const paths = [];
  return { paths, get: async (path) => {
    paths.push(path);
    if (path.startsWith("/u/")) return { body: { user: { created_at: "2020-01-01T00:00:00Z" } } };
    const id = Number(path.split("/")[2].split(".")[0]);
    if (id === unavailableThread) return { unavailable: 404 };
    if (path.includes("/posts.json")) {
      if (id === failThread) throw new Error("connection interrupted");
      return { body: { post_stream: { posts: [rawPost(1, { raw: "An edit to an old post" }), rawPost(2, { hidden: true }), rawPost(4)] } } };
    }
    return { body: { id, title: "Updated", slug: "updated", created_at: date, post_stream: { stream: [1,2,4] } } };
  } };
}
test("full reconciliation records hidden and deleted posts privately, including interrupted fetches", async () => {
  const forum = mockForum({ unavailableThread: TOPIC.threadIds.at(-1) });
  const checkpoints = [];
  const snapshot = await fetchSnapshot({ get: forum.get, previous: previous(), checkpoint: async (value) => checkpoints.push(structuredClone(value)), clock: () => date });
  assert.equal(snapshot.pulls.length, 6);
  assert.equal(snapshot.snapshotAt, date);
  assert.equal(snapshot.threads[0].posts[0].raw, "An edit to an old post");
  assert.equal(snapshot.threads[0].posts[1].raw, null);
  assert.equal(snapshot.threads[0].posts[2].number, 4);
  assert.deepEqual(sourceChanges(previous(),snapshot).unavailable, [...TOPIC.threadIds.slice(0,-1).map(id=>`${id}/2`),... [1,2,3].map(n=>`${TOPIC.threadIds.at(-1)}/${n}`),...TOPIC.threadIds.slice(0,-1).map(id=>`${id}/3`)]);
  assert.ok(snapshot.threads.at(-1).posts.every((post) => post.hidden && post.raw === null));
  assert.equal(checkpoints[0].pulls.length, 0);
  assert.ok(forum.paths.every((path) => path.startsWith("/u/") || TOPIC.threadIds.some((id) => path.startsWith(`/t/${id}`))));
  const partial = mockForum({ failThread: TOPIC.threadIds[1] });
  const partialCheckpoints = [];
  await assert.rejects(fetchSnapshot({ get: partial.get, previous: previous(), checkpoint: async value => partialCheckpoints.push(structuredClone(value)), clock: () => date }), {message:"connection interrupted"});
  assert.equal(partialCheckpoints.at(-1).threads[0].posts[1].raw,null);
});
test("forum requests are rate limited, anonymous and bounded on 429", async () => {
  let clock = 0, count = 0;
  const calls = [], waits = [];
  const client = forumClient({ clock: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; }, request: async (url, options) => {
    calls.push({ url, options, at: clock }); count++;
    return count === 1 ? new Response("", { status: 429, headers: { "Retry-After": "2" } }) : new Response('{"ok":true}');
  } });
  assert.deepEqual(await client("/t/58515.json"), { body: { ok: true } });
  await client("/u/alice.json");
  assert.ok(calls[1].at - calls[0].at >= 2000);
  assert.ok(calls[2].at - calls[1].at >= 1000);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  await assert.rejects(client("https://elsewhere.example/test"), /outside/);
  const limited = forumClient({ wait: async () => {}, request: async () => new Response("", { status: 429, headers: { "Retry-After": "3600" } }) });
  await assert.rejects(limited("/t/58515.json"), /retry later/);
});
test("candidates resume completed jobs, validate exact artifacts, and compare frozen inputs without publishing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "zforum-refresh-test-"));
  try {
    const snapshot = corpusSnapshot();
    const prompts = { marks: `${readFileSync(join(PROMPTS_DIR,"marks.md"),"utf8")}\n${readFileSync(join(REPO_ROOT,"site/js/rubric.js"),"utf8")}`, summary: readFileSync(join(PROMPTS_DIR,"summary.md"),"utf8") };
    const jobs = frozenJobs(snapshot, prompts);
    const initialResults = jobs.map(({job}) => readJsonStrict(join(RESULTS_DIR,job.task,`${job.name}.json`)));
    const initial = buildSiteData(snapshot,snapshot.accounts,initialResults);
    const initialRun = initial.topic.threads[0].posts.find((post) => !post.hidden).analysis_run;
    assert.equal(initialRun.artifact_sha256,sha256(JSON.stringify(initialResults[0])));
    assert.equal(initialRun.job,initialResults[0].job);
    assert.equal(initialRun.runtime,null);
    let invoked = 0;
    const run = async ({ prompt }) => {
      invoked++;
      const item = jobs.find(({job}) => prompt.includes(`"name":"${job.name}"`));
      return { output: readJsonStrict(join(RESULTS_DIR,item.job.task,`${item.job.name}.json`)).output, runtime: "fixture-runner", reported_model: null, usage: { input_tokens: 100 }, cost_usd: null, elapsed_ms: 20 };
    };
    const options = { directory: join(directory,"A"), snapshot, prompts, agent: "codex", model: "fixture-model", maxJobs: 2, timeoutSeconds: 10, budget: 1, run };
    await assert.rejects(analyzeCandidate(options), /job limit 2 reached/);
    assert.equal(invoked, 2);
    assert.equal(readJsonStrict(join(options.directory,"manifest.json")).status, "failed");
    await analyzeCandidate({ ...options, maxJobs: 100 });
    assert.equal(invoked, jobs.length);
    const first = validateCandidate(options.directory,snapshot,prompts);
    assert.equal(first.data.topic.threads[0].posts.find((post) => !post.hidden).analysis_run.runtime,"fixture-runner");
    await analyzeCandidate({ ...options, maxJobs: 1, run: () => { throw new Error("must reuse completed job"); } });
    const changed = structuredClone(snapshot);
    changed.threads[1].posts[0].raw += " changed";
    assert.notEqual(frozenJobs(changed,prompts)[0].input, jobs[0].input);
    await assert.rejects(analyzeCandidate({ ...options, model: "other" }), /identity changed/);
    await analyzeCandidate({ ...options, directory: join(directory,"B"), agent: "claude", model: "fixture-other", maxJobs: 100 });
    const comparison = compareCandidates(first,validateCandidate(join(directory,"B"),snapshot,prompts));
    assert.equal(comparison.published, false);
    assert.equal(comparison.blinded_sample.length, 12);
    assert.equal(comparison.blinded_sample[0].review.faithfulness, null);
    assert.throws(() => compareCandidates(first,{...first,manifest:{...first.manifest,input_sha256:"different"}}), /identical/);
    const artifact = join(options.directory,`${jobs[0].job.name}.json`);
    const record = readJsonStrict(artifact);
    record.prompt_sha256 = "tampered"; writeJsonAtomic(artifact,record);
    assert.throws(() => validateCandidate(options.directory,snapshot,prompts), /identity mismatch/);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
test("runner arguments forbid ambient tools/config and mount only runtime, public job and provider credential", () => {
  const codex = runnerArguments("codex","exact-model",1);
  assert.ok(codex.includes("features.shell_tool=false"));
  assert.ok(codex.includes("read-only"));
  assert.ok(codex.includes("features.apps=false"));
  assert.ok(codex.includes("features.plugins=false"));
  assert.ok(codex.includes("features.multi_agent=false"));
  assert.ok(codex.includes("features.image_generation=false"));
  const claude = runnerArguments("claude","exact-model",1);
  assert.ok(claude.includes("--strict-mcp-config"));
  assert.equal(claude[claude.indexOf("--tools")+1], "");
  assert.throws(() => runnerArguments("codex","--model-injection",1), /explicit model/);
  const args = isolatedArguments("/opt/codex","/tmp/public-job","/home/operator","/home/operator/.codex/auth.json",codex);
  assert.ok(args.includes("--unshare-all"));
  const writable = args.flatMap((arg,index) => arg === "--bind" ? [args[index+1]] : []);
  assert.deepEqual(writable,["/tmp/public-job"]);
  assert.ok(!args.includes("/home/operator/zforum"));
  assert.throws(() => parseRefreshArgs(["refresh","--run","../../db","--agent","codex","--model","m","--candidate","a"]), /simple name/);
  assert.throws(() => parseRefreshArgs(["refresh","--run","r","--agent","codex"]), /requires/);
  assert.throws(() => parseRefreshArgs(["fetch","--run","r","--timeout-seconds","0"]), /limits/);
  assert.throws(() => parseRefreshArgs(["fetch","--run","r","--topic","../../private"]), /unknown configured topic/);
  assert.throws(() => parseRefreshArgs(["discover","--run","r","--since","yesterday"]), /not a timestamp: yesterday/);
});

test("three workers bound concurrency and assemble exactly the serial artifact despite out-of-order completion",{timeout:10000},async t=>{
  // Equal requests require equal nonces. Keep production randomness intact and
  // restore the ESM binding as well as the mocked builtin after this test.
  const nonce=t.mock.method(crypto,'randomUUID',()=> '00000000-0000-4000-8000-000000000001');
  syncBuiltinESMExports();
  t.after(()=>{nonce.mock.restore();syncBuiltinESMExports();});
  const directory=mkdtempSync(join(tmpdir(),"zforum-concurrency-"));
  try {
    const snapshot=corpusSnapshot();
    const prompts={marks:"marks",summary:"summary"};
    const jobs=frozenJobs(snapshot,prompts);
    let active=0,peak=0,parallel=false;
    const completed=[],thirdCompleted=Promise.withResolvers();
    const run=async({prompt})=>{
      active++;peak=Math.max(peak,active);
      const item=jobs.find(({job})=>prompt.includes(`"name":"${job.name}"`));
      if(parallel && jobs.indexOf(item)===1)await thirdCompleted.promise;
      await new Promise(resolve=>setTimeout(resolve,10+(jobs.indexOf(item)%3)*15));
      completed.push(item.job.name);
      if(parallel && jobs.indexOf(item)===3)thirdCompleted.resolve();
      active--;
      return {output:readJsonStrict(join(RESULTS_DIR,item.job.task,`${item.job.name}.json`)).output,runtime:"fixture",reported_model:null,usage:{input_tokens:10},cost_usd:null,elapsed_ms:1};
    };
    const options={directory:join(directory,"serial"),snapshot,prompts,agent:"codex",model:"fixture",maxJobs:100,timeoutSeconds:10,budget:0,run};
    await analyzeCandidate(options);assert.equal(peak,1);
    assert.deepEqual(completed,jobs.map(({job})=>job.name));
    completed.length=0;parallel=true;peak=0;
    await analyzeCandidate({...options,directory:join(directory,"parallel"),concurrency:3});
    assert.equal(peak,3);assert.equal(active,0);
    assert.deepEqual([...completed].sort(),jobs.map(({job})=>job.name).sort());
    assert.ok(completed.indexOf(jobs[3].job.name)<completed.indexOf(jobs[1].job.name));
    assert.deepEqual(validateCandidate(options.directory,snapshot,prompts).data,validateCandidate(join(directory,"parallel"),snapshot,prompts).data);
    await assert.rejects(analyzeCandidate({...options,concurrency:4}),/invalid analysis concurrency 4/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test("subprocess runner keeps source as stdin, surfaces failure and kills timed-out or oversized jobs", async () => {
  const source = "$(do-not-execute) `source`\nexact text";
  const result = await runProcess("/bin/cat",[],{input:source,timeoutSeconds:2});
  assert.equal(result.stdout,source);
  await assert.rejects(runProcess("/usr/bin/false",[],{timeoutSeconds:2}),/exited 1/);
  await assert.rejects(runProcess("/bin/sleep",["10"],{timeoutSeconds:0.05}),/exceeded/);
  await assert.rejects(runProcess("/usr/bin/seq",["1","5000"],{timeoutSeconds:2,maxStdout:100}),/output exceeds/);
});
