import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./jobs.mjs";
import { readJsonStrict, writeFileAtomic, writeJsonAtomic } from "./fsio.mjs";
import { importSnapshot, writeImportPreview } from "./import-preview.mjs";
import { validateCandidate } from "./refresh-analysis.mjs";
import { analysisBaseline, REPLY_ANALYSIS_POLICY } from "./reply-analysis.mjs";
import { importTimestamp } from "./import-store.mjs";
import { runImport } from "../import.mjs";
import { sourceChanges } from "./refresh-source.mjs";
import {validateThreadReview} from './thread-review.mjs';

function keys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`Transfer requires fields: ${expected.join(", ")}`);
}
function statePaths(state) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(state.id) || !Array.isArray(state.topics) || new Set(state.topics.map(t=>t.id)).size !== state.topics.length) throw new Error("Invalid transfer run identity");
  for (const topic of state.topics) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.id) || !["fetched","analyzed","published"].includes(topic.status)) throw new Error(`Transfer requires fetched topics with safe IDs: ${topic.id}`);
  }
}
function artifactFiles(directory) {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).filter(name=>name.endsWith(".json")).sort().map(name=>{
    if (!lstatSync(join(directory,name)).isFile()) throw new Error(`Not a regular artifact: ${name}`);
    return [name,readFileSync(join(directory,name),"utf8")];
  }));
}
function writeArtifacts(directory, files, missingOnly = false) {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("Transfer artifacts must be a file map");
  for (const [name,text] of Object.entries(files)) {
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(name) || typeof text !== "string") throw new Error(`Invalid transfer artifact: ${name}`);
    const path = join(directory,name);
    if (existsSync(path) && !lstatSync(path).isFile()) throw new Error(`Not a regular artifact: ${name}`);
    if (!missingOnly || !existsSync(path)) writeFileAtomic(path,text);
  }
}
function identity(state) {
  return sha256(JSON.stringify([state.id,state.settings,state.topics.map(t=>[t.id,t.snapshot_sha256,t.baseline_release])]));
}

export function exportImport(state, root) {
  if (state === null) throw new Error("No unfinished import to export");
  statePaths(state);
  return {format:"zforum-import-source-1",state,topics:state.topics.map(topic=>({id:topic.id,
    snapshot:importSnapshot(join(root,state.id),topic),
    files:artifactFiles(join(root,state.id,topic.id,"candidate")),
  }))};
}

export function receiveSources(bundle, root) {
  keys(bundle,["format","state","topics"]);
  if (bundle.format !== "zforum-import-source-1") throw new Error("Unsupported source transfer format");
  statePaths(bundle.state);
  if (!Array.isArray(bundle.topics) || JSON.stringify(bundle.topics.map(t=>t.id)) !== JSON.stringify(bundle.state.topics.map(t=>t.id))) throw new Error("Transfer topic membership differs");
  const directory = join(root,bundle.state.id), statePath = join(directory,"analysis-state.json");
  const state = existsSync(statePath) ? readJsonStrict(statePath) : structuredClone(bundle.state);
  if (identity(state) !== identity(bundle.state)) throw new Error("Frozen transfer identity changed");
  for (const [index,entry] of bundle.topics.entries()) {
    keys(entry,["id","snapshot","files"]);
    const topic = bundle.state.topics[index];
    if (sha256(JSON.stringify(entry.snapshot)) !== topic.snapshot_sha256) throw new Error(`Transferred snapshot changed: ${topic.id}`);
    writeJsonAtomic(join(directory,topic.id,"snapshot.json"),entry.snapshot);
    importSnapshot(directory,topic);
    writeArtifacts(join(directory,topic.id,"candidate"),entry.files,true);
  }
  writeJsonAtomic(statePath,state);
  return state;
}

export function exportAnalysis(state, root) {
  statePaths(state);
  return {format:"zforum-import-analysis-1",run:state.id,identity:identity(state),topics:state.topics.map(topic=>{
    const directory = join(root,state.id,topic.id,"candidate");
    validateCandidate(directory,importSnapshot(join(root,state.id),topic),state.settings.prompts);
    return {id:topic.id,files:artifactFiles(directory)};
  })};
}

export function acceptAnalysis(bundle, store, root, progress = console.log) {
  keys(bundle,["format","run","identity","topics"]);
  const state = store.active();
  if (state === null) throw new Error("No unfinished production import to receive analysis");
  statePaths(state);
  if (bundle.format !== "zforum-import-analysis-1" || bundle.run !== state.id || bundle.identity !== identity(state)) throw new Error("Analysis does not match the active frozen import");
  if (!Array.isArray(bundle.topics) || JSON.stringify(bundle.topics.map(t=>t.id)) !== JSON.stringify(state.topics.map(t=>t.id))) throw new Error("Transfer topic membership differs");
  mkdirSync(root,{recursive:true,mode:0o700});
  const temporary = mkdtempSync(join(root,".analysis-"));
  try {
    // Rebuild every candidate against production's source before changing any state.
    const checked = bundle.topics.map((entry,index)=>{
      keys(entry,["id","files"]);
      const topic = state.topics[index], directory = join(temporary,"incoming",topic.id);
      writeArtifacts(directory,entry.files);
      const candidate = validateCandidate(directory,importSnapshot(join(root,state.id),topic),state.settings.prompts);
      if (candidate.manifest.agent !== "codex" || candidate.manifest.model !== state.settings.model) throw new Error(`Unexpected analysis model for ${topic.id}`);
      store.assertPublicationBase(topic.id,topic.baseline_release,candidate.data);
      return {topic,directory,candidate};
    });
    mkdirSync(join(temporary,"previous"),{mode:0o700});
    for (const {topic,directory,candidate} of checked) {
      if (topic.status === "published") continue;
      const destination = join(root,state.id,topic.id,"candidate");
      if (existsSync(destination)) renameSync(destination,join(temporary,"previous",topic.id));
      renameSync(directory,destination);
      topic.analysis = candidate.manifest;
      topic.title = candidate.data.topic.card.title;
      topic.status = "analyzed";
    }
    store.save(state);
    writeJsonAtomic(join(root,state.id,"report.json"),state);
    writeImportPreview(state,root,progress);
    return state;
  } finally { rmSync(temporary,{recursive:true,force:true}); }
}

export function prepareImport(store,root) {
  const state=store.active();
  if(state===null||state.topics.some(topic=>topic.status!=="analyzed"))throw new Error("Prepare requires a fully analyzed, unpublished import");
  if(state.review?.status==='pending')throw new Error('Prepare requires confirmed new-thread decisions');
  if(state.settings.analysisPolicy!==REPLY_ANALYSIS_POLICY)throw new Error("Prepare requires reply-reuse-v1");
  exportAnalysis(state,root);
  return {format:"zforum-prepared-import-1",base_cutoff:store.cutoff(),source:exportImport(state,root)};
}

export async function stagePreparedImport(bundle,store,root,server,progress=console.log) {
  keys(bundle,["format","base_cutoff","source"]);
  if(bundle.format!=="zforum-prepared-import-1")throw new Error("Unsupported prepared import format");
  if(bundle.base_cutoff!==store.cutoff())throw new Error("Production import cutoff changed since preparation");
  const source=bundle.source;
  keys(source,["format","state","topics"]);statePaths(source.state);
  const requested=source.state;
  let review=null;
  if(requested.review!==undefined&&requested.review!==null){
    const {status,...value}=requested.review;
    if(status!=='confirmed')throw new Error('Prepared import requires confirmed new-thread review');
    review=validateThreadReview(value,{run:requested.id,threads:value.threads});
  }
  if(requested.settings.analysisPolicy!==REPLY_ANALYSIS_POLICY)throw new Error("Prepared import requires reply-reuse-v1");
  const since=importTimestamp(requested.since),until=importTimestamp(requested.until);
  if(since>=until||!(requested.scope_thread===null||Number.isSafeInteger(requested.scope_thread)&&requested.scope_thread>0))throw new Error("Invalid prepared import window/scope");
  const active=store.active();
  if(active!==null&&active.id!==requested.id)throw new Error("Another production import is unfinished");
  if(active!==null&&identity(active)!==identity(requested))throw new Error("Prepared import differs from the active frozen import");
  if(active===null&&store.db.prepare("SELECT id FROM import_runs WHERE id=?").get(requested.id))throw new Error("Prepared import was already completed");
  receiveSources(source,root);
  // Source and baseline comparisons precede any production database writes.
  for(const topic of requested.topics) {
    const snapshot=importSnapshot(join(root,requested.id),topic);
    if(snapshot.importRun!==requested.id||snapshot.analysisPolicy!==REPLY_ANALYSIS_POLICY)throw new Error(`Prepared source policy/run differs: ${topic.id}`);
    const candidate=validateCandidate(join(root,requested.id,topic.id,"candidate"),snapshot,requested.settings.prompts);
    if(candidate.manifest.agent!=="codex"||candidate.manifest.model!==requested.settings.model)throw new Error(`Unexpected prepared model: ${topic.id}`);
    store.assertPublicationBase(topic.id,topic.baseline_release,candidate.data);
    if(active===null&&JSON.stringify(analysisBaseline(store.published(topic.id)))!==JSON.stringify(snapshot.analysisBaseline))throw new Error(`Prepared baseline differs from production: ${topic.id}`);
    if(JSON.stringify(snapshot.threads.map(t=>t.id))!==JSON.stringify(topic.threadIds))throw new Error(`Prepared membership differs: ${topic.id}`);
  }
  if(active===null) {
    const registered=store.register(requested.discovery.threads,{dryRun:true}).filter(topic=>requested.scope_thread===null||topic.threadIds.includes(requested.scope_thread));
    if(JSON.stringify(registered.map(t=>[t.id,t.threadIds]))!==JSON.stringify(requested.topics.map(t=>[t.id,t.threadIds])))throw new Error("Production topic membership changed since preparation");
    if(review!==null&&store.db.prepare('PRAGMA user_version').get().user_version<7)await server('report');
    if(review!==null)store.recordThreadReviews(review.threads);
    store.register(requested.discovery.threads);
    const state={id:requested.id,since,until,status:"running",scope_thread:requested.scope_thread,settings:requested.settings,discovery:requested.discovery,...(review===null?{}:{review}),
      topics:registered.map(t=>({...t,status:"pending",baseline_release:store.release(t.id)})),started_at:until,elapsed_ms:0};
    store.db.prepare("INSERT INTO import_runs VALUES(?,?,?,?,?)").run(state.id,since,until,state.status,JSON.stringify(state));
  }
  const unavailable=new Set();
  for(const topic of requested.topics) {
    const snapshot=importSnapshot(join(root,requested.id),topic);
    sourceChanges(store.previous(topic.id),snapshot).unavailable.forEach(key=>unavailable.add(key));
    snapshot.threads.flatMap(t=>t.posts.filter(p=>p.hidden).map(p=>`${t.id}/${p.number}`)).forEach(key=>unavailable.add(key));
  }
  if(unavailable.size){const file=join(root,requested.id,"staged-restrictions.json");writeJsonAtomic(file,[...unavailable]);await server("restrict","--file",file);}
  await runImport({stage:"fetch",store,root,settings:requested.settings,server,progress,reviewNewThreads:false,get:()=>{throw new Error("Prepared import cannot fetch");},modelRun:()=>{throw new Error("Prepared import cannot call a model");}});
  return acceptAnalysis({format:"zforum-import-analysis-1",run:requested.id,identity:identity(requested),topics:source.topics.map(({id,files})=>({id,files}))},store,root,progress);
}
