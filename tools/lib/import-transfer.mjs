import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./jobs.mjs";
import { readJsonStrict, writeFileAtomic, writeJsonAtomic } from "./fsio.mjs";
import { importSnapshot, writeImportPreview } from "./import-preview.mjs";
import { validateCandidate } from "./refresh-analysis.mjs";

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
