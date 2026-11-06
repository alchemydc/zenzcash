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
import { parseStrictJson } from "./lib/strict-json.mjs";
import { isDeepStrictEqual } from "node:util";
import {newThreadReview,acceptThreadReview,threadReviewPacket} from './lib/thread-review.mjs';
import { writeReviewJson } from './lib/review-display.mjs';
import { scanReview,requireScan,scanNotice,authorizePublication } from './lib/content-review.mjs';
import { importReviewInput } from './lib/import-review.mjs';
import { importAudit } from './lib/import-audit.mjs';
import { assertLocalPreparation } from './lib/preparation-boundary.mjs';
import { cachedProfiles } from './lib/profile-cache.mjs';
import { MODEL_INPUT_FORMAT } from './lib/model-input.mjs';

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

export async function runImport({ stage = "fetch", since, thread, maxCalls = 0, store, root, settings, get, server, modelRun, reviewNewThreads=true, reviewFile, clock = () => new Date().toISOString(), progress = console.log }) {
  if (!["fetch","preview","analyze","publish"].includes(stage)) throw new Error(`Unknown import stage ${stage}`);
  if (["fetch","analyze"].includes(stage)) assertLocalPreparation(store.path,root);
  if (stage === "analyze" && (!Number.isSafeInteger(maxCalls) || maxCalls < 1)) throw new Error(`Analysis requires a positive global call limit, received ${maxCalls}`);
  if (thread !== undefined && (!Number.isSafeInteger(thread) || thread < 1)) throw new Error(`Invalid scoped thread ${thread}`);
  if (stage !== "fetch" && (thread !== undefined || since !== undefined)) throw new Error(`${stage} uses the frozen run; fetch options are not allowed`);
  if (stage !== "fetch" && store.active() === null) throw new Error(`No unfinished import to ${stage}; run scripts/zforum import first`);
  if (stage === "preview") {
    const state = store.active();
    writeImportPreview(state,root,progress);
    return state;
  }
  const started = performance.now();
  const excluded=settings.excludedDiscoveryThreads??[];
  if(!Array.isArray(excluded)||excluded.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(excluded).size!==excluded.length)throw new Error(`Invalid excluded discovery threads: ${JSON.stringify(excluded)}`);
  const state = store.begin(since,clock(),settings,thread);
  const directory = join(root,state.id);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const audit=importAudit(directory);
  let fetchSection='discovery',fetchTopic=null;
  const sourceGet=get;
  get=path=>audit.measure(`fetch.${path.startsWith('/u/')?'profiles':fetchSection}`,{topic:fetchTopic},()=>sourceGet(path,{observe:({category,...details})=>audit.record(category,{...details,section:fetchSection,topic:fetchTopic})}));
  const profile=cachedProfiles(get,join(directory,'profiles.json'),details=>audit.record('profile.cache',{...details,topic:fetchTopic,status:'complete',elapsed_ms:0}));
  const save = () => { store.save(state); writeJsonAtomic(join(directory,"report.json"),state); };
  progress(`Import ${state.id}: active since ${state.since}; update cutoff ${state.until}`);
  const execute=async()=>{
  try {
    if(stage==='fetch'&&reviewFile!==undefined&&state.topics.length>0){
      if(state.review?.status!=='confirmed')throw new Error('No confirmed new-thread review matches this fetch');
      acceptThreadReview(reviewFile,state.review,store);
    }
    if(stage!=='fetch'&&state.review?.status==='pending')throw new Error('New-thread review is pending; confirm the staged decisions with fetch --review FILE before analysis or publication');
    if (stage !== "fetch" && (state.discovery === null || state.topics.some(topic=>topic.status==="pending"))) throw new Error(`Fetch is incomplete; run scripts/zforum import before ${stage}`);
    if (stage === "fetch" && state.discovery === null) {
      state.discovery = state.scope_thread === null
        ? await discoverImport({get,since:state.since,until:state.until,maxPages:settings.discoveryMaxPages,progress})
        : {since:state.since,until:state.until,threads:[{id:state.scope_thread}],passes:0};
      if(reviewNewThreads&&state.scope_thread===null)for(const thread of store.reinstatedThreads())if(!state.discovery.threads.some(found=>found.id===thread.id))state.discovery.threads.push(thread);
      state.discovery.excluded_threads=state.discovery.threads.filter(t=>excluded.includes(t.id)).map(t=>t.id);
      state.discovery.threads=state.discovery.threads.filter(t=>!excluded.includes(t.id));
      save();
    }
    if(stage==='fetch'&&state.topics.length===0) {
      if(reviewNewThreads) {
        fetchSection='new_thread_review';
        if(state.review===undefined)state.review=await newThreadReview(state,store,get);
        if(state.review===null&&reviewFile!==undefined)throw new Error('No pending new-thread review matches this fetch');
        if(state.review?.status==='pending') {
          const path=join(directory,'new-thread-review.json');
          if(reviewFile===undefined){
            const scan=scanReview(directory,importReviewInput(state,root));
            progress(scanNotice(directory,scan));
            const packet=existsSync(path)?readJsonStrict(path):threadReviewPacket(state.review);
            writeReviewJson(path,packet.format==='zforum-thread-review-1'?threadReviewPacket(packet):packet);
            state.elapsed_ms+=performance.now()-started;save();progress(`Review new thread titles/openings in ${path}. Confirm the exact proposed IDs, decisions, reasons and excerpts before fetch --review FILE. No full histories or model calls yet.`);return state;
          }
          state.review=acceptThreadReview(reviewFile,state.review,store);
        }
        state.discovery.threads=state.discovery.threads.filter(t=>store.threadReview(t.id)?.decision!=='exclude');
      }
      state.topics = store.register(state.discovery.threads)
        .filter(topic=>state.scope_thread === null || topic.threadIds.includes(state.scope_thread))
        .map(topic=>({...topic,status:"pending",baseline_release:store.release(topic.id)}));
      save();
    }
    if(stage==='fetch') {
      const remaining=state.topics.filter(t=>t.status==='pending');
      const usernames=new Set();
      const threadRequests=remaining.reduce((count,topic)=>{
        const before=store.previous(topic.id);
        before.threads.flatMap(t=>t.posts).forEach(post=>usernames.add(post.username));
        return count+topic.threadIds.length+before.threads.reduce((n,t)=>n+Math.ceil(t.posts.length/20),0);
      },0);
      const requests=threadRequests+usernames.size;
      audit.record('fetch.estimate',{status:'complete',remaining_topics:remaining.length,baseline_requests:requests,lower_ms:requests*1000,upper_ms:requests*3000});
      progress(`Fetch planning estimate: ${Math.ceil(requests/60)}–${Math.ceil(requests*3/60)} minutes for ${remaining.length} topics (${requests} baseline requests at 1 request/second plus network time). New posts/profiles and rate-limit retries can increase this.`);
    }
    for (const topic of stage === "fetch" ? state.topics : []) {
      if (topic.status !== "pending") continue;
      const topicDirectory = join(directory,topic.id);
      const snapshotPath = join(topicDirectory,"snapshot.json");
      const beforePath = join(topicDirectory,"before.json");
      const before = existsSync(beforePath) ? readJsonStrict(beforePath) : store.previous(topic.id);
      if (!existsSync(beforePath)) writeJsonAtomic(beforePath,before);
      progress(`Fetching ${topic.id} (${state.topics.indexOf(topic)+1}/${state.topics.length})`);
      fetchSection='threads';fetchTopic=topic.id;
      const fetchedAt = performance.now();
      let snapshot;
      if (existsSync(snapshotPath)) {
        snapshot = readJsonStrict(snapshotPath);
        if (snapshot.topic !== topic.id || snapshot.source_sha256 !== sha256(JSON.stringify(snapshot.threads))) throw new Error(`Frozen snapshot mismatch: ${topic.id}`);
      } else {
        snapshot = await fetchSnapshot({get,profile,previous:before,topic,retainForumIds:true,clock,
          checkpoint: async value => { writeJsonAtomic(join(topicDirectory,"fetch-progress.json"),value); if (value.cursor) progress(`  ${topic.id}: ${value.cursor.fetched}/${value.cursor.total} source posts fetched`); },
        });
        snapshot.modelInputFormat=MODEL_INPUT_FORMAT;
        if (before.source_sha256 === snapshot.source_sha256 && before.previousSummary) snapshot.previousSummary = before.previousSummary;
        else if (before.source_sha256 !== snapshot.source_sha256) {
          const summary = store.summary(topic.id);
          if (summary !== null) snapshot.previousSummary = summary;
        }
        if(settings.analysisPolicy===REPLY_ANALYSIS_POLICY) {
          snapshot.analysisPolicy=REPLY_ANALYSIS_POLICY;
          snapshot.importRun=state.id;
          snapshot.analysisBaseline=analysisBaseline(store.published(topic.id));
          if(settings.summaryReusePolicy!==undefined){snapshot.summaryReusePolicy=settings.summaryReusePolicy;snapshot.summaryBaseline=store.summaryBaseline(topic.id,settings.prompts.summary);}
          if(settings.batchRepairPolicy!==undefined)snapshot.batchRepairPolicy=settings.batchRepairPolicy;
        }
        writeJsonAtomic(snapshotPath,snapshot);
      }
      topic.changes = sourceChanges(before,snapshot);
      store.recordSource(snapshot);
      topic.posts = snapshot.threads.reduce((n,t)=>n+t.posts.length,0);
      topic.visible = snapshot.threads.reduce((n,t)=>n+t.posts.filter(p=>!p.hidden).length,0);
      topic.jobs = frozenJobs(snapshot,settings.prompts).length;
      topic.source_sha256 = snapshot.source_sha256;
      topic.snapshot_sha256 = sha256(JSON.stringify(snapshot));
      topic.fetch_ms = performance.now()-fetchedAt;
      topic.status = "fetched"; save();
    }
    let calls = 0;
    if (stage === "analyze") {
      calls = await analyzeImportTopics({state,root,maxCalls,modelRun,save,progress});
    }
    if (stage === "publish") {
      if (state.topics.some(topic=>!["analyzed","published"].includes(topic.status))) throw new Error("Analysis is incomplete; nothing published. Run analyze and review its preview first");
      const scan=requireScan(directory,importReviewInput(state,root));
      progress(scanNotice(directory,scan));
      // Check every remaining candidate before any publication in this invocation.
      const prepared = state.topics.map(topic=>{
        const candidate = join(directory,topic.id,"candidate");
        const checked = validateCandidate(candidate,importSnapshot(directory,topic),settings.prompts);
        store.assertPublicationBase(topic.id,topic.baseline_release,checked.data);
        return {topic,candidate};
      });
      const finishedAt=clock(),packet={format:"zforum-publication-1",run:state.id,finished_at:finishedAt,topics:prepared.map(({topic,candidate})=>({
        id:topic.id,expected_release:store.release(topic.id),data:readJsonStrict(join(candidate,"site.json")),summary:readJsonStrict(join(candidate,`summary-${topic.id}.json`)).output,
      }))};
      const file=join(directory,"publication.json");writeJsonAtomic(file,packet);
      authorizePublication(directory,importReviewInput(state,root),file);
      const completed=parseStrictJson(await server("publish-import","--file",file,"--review",directory),"atomic publication response");
      if(!Array.isArray(completed.topics)||completed.topics.length!==state.topics.length||completed.topics.some(t=>typeof t.release!=="string"||!/^[a-f0-9]{64}$/.test(t.release)))throw new Error("Atomic publication returned invalid release identities");
      const expected={...state,status:"complete",finished_at:finishedAt,topics:state.topics.map((topic,index)=>({...topic,status:"published",release:completed.topics[index].release}))};
      if(!isDeepStrictEqual(completed,expected))throw new Error("Atomic publication returned a different frozen import");
      Object.assign(state,completed);
      progress(`Published all ${state.topics.length} topics atomically`);
    }
    state.elapsed_ms += performance.now()-started;
    save();
    progress(`${stage} complete; model calls this invocation: ${calls}. ${stage === "publish" ? "Publication complete." : "Review preview before the next explicit stage."}`);
    return state;
  } catch (error) {
    if(store.db.prepare("SELECT status FROM import_runs WHERE id=?").get(state.id).status==="complete")throw new Error(`Import ${state.id} is already atomically published; reporting failed: ${error.message}`,{cause:error});
    state.status = "failed"; state.error = error.message; state.elapsed_ms += performance.now()-started;save();
    throw error;
  }
  };
  try { return await audit.measure(`stage.${stage}`,{},execute); }
  finally { writeImportPreview(state,root,progress); }
}

if (import.meta.main) {
  process.umask(0o077);
  const options = parseImportArgs(process.argv.slice(2));
  const db = resolve(options.db ?? join(WORK_DIR,"zforum.sqlite"));
  if (["fetch","analyze"].includes(options.stage)) assertLocalPreparation(db,WORK_DIR);
  if (options.stage === "analyze") checkSubscriptionLogin();
  const server = async (command,...flags) => (await runProcess(join(REPO_ROOT,"server/target/release/zforum-server"),[command,"--db",db,...flags])).stdout;
  if (options.stage === "fetch") await server("report");
  else if (!existsSync(db)) throw new Error(`Import database does not exist: ${db}`);
  const store = new ImportStore(db,{readOnly:options.stage === "preview"});
  try {
    const active=store.active();
    const settings=options.stage!=='fetch'&&active!==null?active.settings:{...readJsonStrict(join(REPO_ROOT,"tools/import-config.json")),prompts:{summary:promptText("summary"),marks:promptText("marks")}};
    await runImport({...options,store,root:join(WORK_DIR,"imports"),settings,get:forumClient(),server,modelRun:options=>runAgent({...options,subscriptionOnly:true})});
  } finally { store.close(); }
}
