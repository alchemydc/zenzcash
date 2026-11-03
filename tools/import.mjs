import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT, WORK_DIR } from "./lib/config.mjs";
import { ImportStore } from "./lib/import-store.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { runProcess } from "./lib/process.mjs";
import { forumClient } from "./lib/forum-client.mjs";
import { discoverRecent } from "./lib/discovery.mjs";
import { fetchSnapshot, sourceChanges } from "./lib/refresh-source.mjs";
import { validateCandidate, frozenJobs } from "./lib/refresh-analysis.mjs";
import { analyzeImportTopics } from "./lib/import-analysis.mjs";
import { checkSubscriptionLogin, runAgent } from "./lib/agent-runner.mjs";
import { promptText } from "./lib/prompt.mjs";
import { sha256 } from "./lib/jobs.mjs";
import { importSnapshot, writeImportPreview } from "./lib/import-preview.mjs";
import { parseImportArgs } from "./lib/import-options.mjs";
import { REPLY_ANALYSIS_POLICY, analysisBaseline } from "./lib/reply-analysis.mjs";

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

export async function runImport({ stage = "fetch", since, thread, maxCalls = 0, store, root, settings, get, server, modelRun, clock = () => new Date().toISOString(), progress = console.log }) {
  if (!["fetch","preview","analyze","publish"].includes(stage)) throw new Error(`Unknown import stage ${stage}`);
  if (stage === "analyze" && (!Number.isSafeInteger(maxCalls) || maxCalls < 1)) throw new Error(`Analysis requires a positive global call limit, received ${maxCalls}`);
  if (thread !== undefined && (!Number.isSafeInteger(thread) || thread < 1)) throw new Error(`Invalid scoped thread ${thread}`);
  if (stage !== "fetch" && (thread !== undefined || since !== undefined)) throw new Error(`${stage} uses the frozen run; fetch options are not allowed`);
  if (stage !== "fetch" && store.active() === null) throw new Error(`No unfinished import to ${stage}; run scripts/zforum import first`);
  if (stage === "preview") {
    const state = store.active();
    writeImportPreview(state,root,progress);
    return state;
  }
  const started = Date.now();
  const state = store.begin(since,clock(),settings,thread);
  const directory = join(root,state.id);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const save = () => { store.save(state); writeJsonAtomic(join(directory,"report.json"),state); };
  progress(`Import ${state.id}: active since ${state.since}; update cutoff ${state.until}`);
  try {
    if (stage !== "fetch" && (state.discovery === null || state.topics.some(topic=>topic.status==="pending"))) throw new Error(`Fetch is incomplete; run scripts/zforum import before ${stage}`);
    if (stage === "fetch" && state.discovery === null) {
      state.discovery = state.scope_thread === null
        ? await discoverImport({get,since:state.since,until:state.until,maxPages:settings.discoveryMaxPages,progress})
        : {since:state.since,until:state.until,threads:[{id:state.scope_thread}],passes:0};
      state.topics = store.register(state.discovery.threads)
        .filter(topic=>state.scope_thread === null || topic.threadIds.includes(state.scope_thread))
        .map(topic=>({...topic,status:"pending",baseline_release:store.release(topic.id)}));
      save();
    }
    for (const topic of stage === "fetch" ? state.topics : []) {
      if (topic.status !== "pending") continue;
      const topicDirectory = join(directory,topic.id);
      const snapshotPath = join(topicDirectory,"snapshot.json");
      const beforePath = join(topicDirectory,"before.json");
      const before = existsSync(beforePath) ? readJsonStrict(beforePath) : store.previous(topic.id);
      if (!existsSync(beforePath)) writeJsonAtomic(beforePath,before);
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
        if(settings.analysisPolicy===REPLY_ANALYSIS_POLICY) {
          snapshot.analysisPolicy=REPLY_ANALYSIS_POLICY;
          snapshot.importRun=state.id;
          snapshot.analysisBaseline=analysisBaseline(store.published(topic.id));
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
      topic.snapshot_sha256 = sha256(JSON.stringify(snapshot));
      topic.fetch_ms = Date.now()-fetchedAt;
      topic.status = "fetched"; save();
    }
    let calls = 0;
    if (stage === "analyze") {
      calls = await analyzeImportTopics({state,root,maxCalls,modelRun,save,progress});
    }
    if (stage === "publish") {
      if (state.topics.some(topic=>!["analyzed","published"].includes(topic.status))) throw new Error("Analysis is incomplete; nothing published. Run analyze and review its preview first");
      // Check every remaining candidate before any publication in this invocation.
      const prepared = state.topics.filter(topic=>topic.status!=="published").map(topic=>{
        const candidate = join(directory,topic.id,"candidate");
        const checked = validateCandidate(candidate,importSnapshot(directory,topic),settings.prompts);
        store.assertPublicationBase(topic.id,topic.baseline_release,checked.data);
        return {topic,candidate};
      });
      for (const {topic,candidate} of prepared) {
        const release = await server("publish","--file",join(candidate,"site.json"));
        store.recordSummary(topic.id,readJsonStrict(join(candidate,`summary-${topic.id}.json`)).output);
        topic.release = release.trim(); topic.status = "published"; save();
        progress(`Published ${topic.id}: ${topic.title}`);
      }
      state.status = "complete";
      state.finished_at = clock();
    }
    state.elapsed_ms += Date.now()-started;
    save();
    writeImportPreview(state,root,progress);
    progress(`${stage} complete; model calls this invocation: ${calls}. ${stage === "publish" ? "Publication complete." : "Review preview before the next explicit stage."}`);
    return state;
  } catch (error) {
    state.status = "failed"; state.error = error.message; state.elapsed_ms += Date.now()-started; save();
    throw error;
  }
}

if (import.meta.main) {
  process.umask(0o077);
  const options = parseImportArgs(process.argv.slice(2));
  if (options.stage === "analyze") checkSubscriptionLogin();
  const db = resolve(options.db ?? join(WORK_DIR,"zforum.sqlite"));
  const server = async (command,...flags) => (await runProcess(join(REPO_ROOT,"server/target/release/zforum-server"),[command,"--db",db,...flags])).stdout;
  if (options.stage === "fetch") await server("report");
  else if (!existsSync(db)) throw new Error(`Import database does not exist: ${db}`);
  const settings = {...readJsonStrict(join(REPO_ROOT,"tools/import-config.json")),prompts:{summary:promptText("summary"),marks:promptText("marks")}};
  const store = new ImportStore(db,{readOnly:options.stage === "preview"});
  try {
    await runImport({...options,store,root:join(WORK_DIR,"imports"),settings,get:forumClient(),server,modelRun:options=>runAgent({...options,subscriptionOnly:true})});
  } finally { store.close(); }
}
