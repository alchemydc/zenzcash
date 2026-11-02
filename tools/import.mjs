import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, WORK_DIR } from "./lib/config.mjs";
import { ImportStore } from "./lib/import-store.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { runProcess } from "./lib/process.mjs";
import { forumClient } from "./lib/forum-client.mjs";
import { discoverRecent } from "./lib/discovery.mjs";
import { fetchSnapshot, sourceChanges } from "./lib/refresh-source.mjs";
import { analyzeCandidate, validateCandidate, frozenJobs } from "./lib/refresh-analysis.mjs";
import { checkSubscriptionLogin, runAgent } from "./lib/agent-runner.mjs";
import { promptText } from "./lib/prompt.mjs";
import { sha256 } from "./lib/jobs.mjs";

export async function discoverImport({ get, since, until, maxPages, progress }) {
  let previous = null;
  const union = new Map();
  // Two matching passes mitigate page movement while the live forum receives replies.
  // Posts after the starting cutoff are included; the next run deliberately overlaps.
  for (let pass = 1; pass <= 4; pass++) {
    const result = await discoverRecent({get,since,until,maxPages,includeAfterCutoff:true});
    for (const thread of result.threads) union.set(thread.id,thread);
    const identity = JSON.stringify(result.threads.map(t=>t.id).sort((a,b)=>a-b));
    progress(`Discovery pass ${pass}: ${result.threads.length} active threads across ${result.pages} pages`);
    if (identity === previous) return {since,until,threads:[...union.values()].sort((a,b)=>a.id-b.id),passes:pass};
    previous = identity;
  }
  throw new Error("Forum listing kept moving after four discovery passes; retry without advancing the checkpoint");
}

export async function runImport({ since, store, root, settings, get, server, modelRun, clock = () => new Date().toISOString(), progress = console.log }) {
  const started = Date.now();
  const state = store.begin(since,clock(),settings);
  const directory = join(root,state.id);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const save = () => { store.save(state); writeJsonAtomic(join(directory,"report.json"),state); };
  progress(`Import ${state.id}: active since ${state.since}; update cutoff ${state.until}`);
  try {
    if (state.discovery === null) {
      state.discovery = await discoverImport({get,since:state.since,until:state.until,maxPages:settings.discoveryMaxPages,progress});
      state.topics = store.register(state.discovery.threads).map(topic=>({...topic,status:"pending"}));
      save();
    }
    for (const topic of state.topics) {
      if (topic.status !== "pending") continue;
      const topicDirectory = join(directory,topic.id);
      const snapshotPath = join(topicDirectory,"snapshot.json");
      const before = store.previous(topic.id);
      progress(`Fetching ${topic.id} (${state.topics.indexOf(topic)+1}/${state.topics.length})`);
      const fetchedAt = Date.now();
      let snapshot;
      if (existsSync(snapshotPath)) {
        snapshot = readJsonStrict(snapshotPath);
        if (snapshot.topic !== topic.id || snapshot.source_sha256 !== sha256(JSON.stringify(snapshot.threads))) throw new Error(`Frozen snapshot mismatch: ${topic.id}`);
      } else {
        snapshot = await fetchSnapshot({get,previous:before,topic,retainForumIds:true,clock,
          checkpoint: async value => { writeJsonAtomic(join(topicDirectory,"fetch-progress.json"),value); if (value.cursor) progress(`  ${topic.id}: ${value.cursor.fetched}/${value.cursor.total} source posts fetched`); },
          restrict: async keys => { if (keys.length) { const path=join(topicDirectory,"restrictions.json"); writeJsonAtomic(path,keys); await server("restrict","--file",path); } },
        });
        if (before.source_sha256 === snapshot.source_sha256 && before.previousSummary) snapshot.previousSummary = before.previousSummary;
        else if (before.source_sha256 !== snapshot.source_sha256) {
          const summary = store.summary(topic.id);
          if (summary !== null) snapshot.previousSummary = summary;
        }
        writeJsonAtomic(snapshotPath,snapshot);
      }
      topic.changes = sourceChanges(before,snapshot);
      await server("record-pull","--file",snapshotPath);
      store.recordSource(snapshot);
      topic.posts = snapshot.threads.reduce((n,t)=>n+t.posts.length,0);
      topic.visible = snapshot.threads.reduce((n,t)=>n+t.posts.filter(p=>!p.hidden).length,0);
      topic.jobs = frozenJobs(snapshot,settings.prompts).length;
      topic.source_sha256 = snapshot.source_sha256;
      topic.fetch_ms = Date.now()-fetchedAt;
      topic.status = "fetched"; save();
    }
    progress(`Fetch complete: ${state.topics.length} topics, ${state.topics.reduce((n,t)=>n+t.posts,0)} posts, ${state.topics.reduce((n,t)=>n+t.jobs,0)} analysis jobs before cache reuse`);
    // Publish small discussions first so useful results appear during the longer histories.
    for (const topic of [...state.topics].sort((a,b)=>a.posts-b.posts || a.threadIds[0]-b.threadIds[0])) {
      if (topic.status === "published") continue;
      const snapshot = readJsonStrict(join(directory,topic.id,"snapshot.json"));
      if (snapshot.source_sha256 !== topic.source_sha256 || snapshot.source_sha256 !== sha256(JSON.stringify(snapshot.threads))) throw new Error(`Frozen snapshot changed: ${topic.id}`);
      const candidate = join(directory,topic.id,"candidate");
      const analysisStart = Date.now();
      progress(`Codex: ${topic.id}, ${topic.visible} visible posts, ${topic.jobs} jobs`);
      const report = await analyzeCandidate({directory:candidate,cacheDirectory:join(root,"cache"),snapshot,prompts:settings.prompts,agent:"codex",model:settings.model,maxJobs:settings.maxCallsPerTopic,timeoutSeconds:settings.timeoutSeconds,budget:0,run:modelRun,progress});
      const checked = validateCandidate(candidate,snapshot,settings.prompts);
      const release = await server("publish","--file",join(candidate,"site.json"));
      store.recordSummary(topic.id,readJsonStrict(join(candidate,`summary-${topic.id}.json`)).output);
      topic.analysis = report;
      topic.analysis_ms = Date.now()-analysisStart;
      topic.title = checked.data.topic.card.title;
      topic.release = release.trim(); topic.status = "published"; save();
      progress(`Published ${topic.id}: ${topic.title} (${state.topics.filter(t=>t.status==="published").length}/${state.topics.length})`);
    }
    state.status = "complete";
    state.finished_at = clock();
    state.elapsed_ms += Date.now()-started;
    save();
    progress(`Import complete. ${state.topics.length} topics published. Report: ${join(directory,"report.json")}`);
    return state;
  } catch (error) {
    state.status = "failed"; state.error = error.message; state.elapsed_ms += Date.now()-started; save();
    throw error;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error("usage: scripts/zforum import [YYYY-MM-DDTHH:mm:ssZ]");
  checkSubscriptionLogin();
  const db = join(WORK_DIR,"zforum.sqlite");
  const server = async (command,...flags) => (await runProcess(join(REPO_ROOT,"server/target/release/zforum-server"),[command,"--db",db,...flags])).stdout;
  await server("report");
  const settings = {...readJsonStrict(join(REPO_ROOT,"tools/import-config.json")),prompts:{summary:promptText("summary"),marks:promptText("marks")}};
  const store = new ImportStore(db);
  try {
    await runImport({since:args[0],store,root:join(WORK_DIR,"imports"),settings,get:forumClient(),server,modelRun:options=>runAgent({...options,subscriptionOnly:true})});
  } finally { store.close(); }
}
