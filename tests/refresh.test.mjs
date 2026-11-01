import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TOPIC, RESULTS_DIR, ACCOUNTS_FILE, PROMPTS_DIR, REPO_ROOT } from "../tools/lib/config.mjs";
import { loadTopic } from "../tools/lib/topic.mjs";
import { readJsonStrict, writeJsonAtomic } from "../tools/lib/fsio.mjs";
import { fetchSnapshot } from "../tools/lib/refresh-source.mjs";
import { forumClient } from "../tools/lib/forum-client.mjs";
import { analyzeCandidate, frozenJobs, validateCandidate } from "../tools/lib/refresh-analysis.mjs";
import { isolatedArguments, runnerArguments } from "../tools/lib/agent-runner.mjs";
import { compareCandidates, parseRefreshArgs } from "../tools/refresh.mjs";
import { runProcess } from "../tools/lib/process.mjs";

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
test("full reconciliation detects old edits, new, hidden and deleted posts, and restricts before completion", async () => {
  const forum = mockForum({ unavailableThread: TOPIC.threadIds.at(-1) });
  const restrictions = [], checkpoints = [];
  const snapshot = await fetchSnapshot({ get: forum.get, previous: previous(), restrict: async (keys) => restrictions.push(...keys), checkpoint: async (value) => checkpoints.push(structuredClone(value)), clock: () => date });
  assert.equal(snapshot.pulls.length, 6);
  assert.equal(snapshot.snapshotAt, date);
  assert.equal(snapshot.threads[0].posts[0].raw, "An edit to an old post");
  assert.equal(snapshot.threads[0].posts[1].raw, null);
  assert.equal(snapshot.threads[0].posts[2].number, 4);
  assert.ok(restrictions.includes(`${TOPIC.threadIds[0]}/2`));
  assert.ok(restrictions.includes(`${TOPIC.threadIds[0]}/3`));
  assert.ok(snapshot.threads.at(-1).posts.every((post) => post.hidden && post.raw === null));
  assert.equal(checkpoints[0].pulls.length, 0);
  assert.ok(forum.paths.every((path) => path.startsWith("/u/") || TOPIC.threadIds.some((id) => path.startsWith(`/t/${id}`))));
  const partial = mockForum({ failThread: TOPIC.threadIds[1] });
  const applied = [];
  await assert.rejects(fetchSnapshot({ get: partial.get, previous: previous(), restrict: async (keys) => applied.push(...keys), checkpoint: async () => {}, clock: () => date }), /interrupted/);
  assert.ok(applied.includes(`${TOPIC.threadIds[0]}/2`));
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
    const snapshot = { ...loadTopic(), accounts: readJsonStrict(ACCOUNTS_FILE).accounts };
    const prompts = { marks: `${readFileSync(join(PROMPTS_DIR,"marks.md"),"utf8")}\n${readFileSync(join(REPO_ROOT,"site/js/rubric.js"),"utf8")}`, summary: readFileSync(join(PROMPTS_DIR,"summary.md"),"utf8") };
    const jobs = frozenJobs(snapshot, prompts);
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
});

test("subprocess runner keeps source as stdin, surfaces failure and kills timed-out or oversized jobs", async () => {
  const source = "$(do-not-execute) `source`\nexact text";
  const result = await runProcess("/bin/cat",[],{input:source,timeoutSeconds:2});
  assert.equal(result.stdout,source);
  await assert.rejects(runProcess("/usr/bin/false",[],{timeoutSeconds:2}),/exited 1/);
  await assert.rejects(runProcess("/bin/sleep",["10"],{timeoutSeconds:0.05}),/exceeded/);
  await assert.rejects(runProcess("/usr/bin/seq",["1","5000"],{timeoutSeconds:2,maxStdout:100}),/output exceeds/);
});
