import { join, resolve } from "node:path";
import { WORK_DIR } from "./lib/config.mjs";
import { ImportStore } from "./lib/import-store.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { exportImport, receiveSources, exportAnalysis, acceptAnalysis } from "./lib/import-transfer.mjs";
import { analyzeImportTopics } from "./lib/import-analysis.mjs";
import { writeImportPreview } from "./lib/import-preview.mjs";
import { checkSubscriptionLogin, runAgent } from "./lib/agent-runner.mjs";

process.umask(0o077);
const [command,file,option,...extra] = process.argv.slice(2);
if (!file || extra.length) throw new Error("Usage: import-transfer.mjs export FILE DB | accept FILE DB | analyze FILE MAX_CALLS");
const root = join(WORK_DIR,"imports");
if (["export","accept"].includes(command)) {
  if (!option) throw new Error("Transfer requires an explicit database path");
  const store = new ImportStore(resolve(option),{readOnly:command === "export"});
  try {
    if (command === "export") writeJsonAtomic(file,exportImport(store.active(),root));
    else acceptAnalysis(readJsonStrict(file),store,root);
  } finally { store.close(); }
} else if (command === "analyze") {
  if (!/^[1-9][0-9]*$/.test(option) || !Number.isSafeInteger(Number(option))) throw new Error("Analysis requires an explicit positive call allowance");
  checkSubscriptionLogin();
  const state = receiveSources(readJsonStrict(file),root);
  const save = () => writeJsonAtomic(join(root,state.id,"analysis-state.json"),state);
  try {
    const calls = await analyzeImportTopics({state,root,maxCalls:Number(option),modelRun:options=>runAgent({...options,subscriptionOnly:true}),save,progress:console.log});
    writeImportPreview(state,root,console.log);
    const output = `${file}.analysis.json`;
    writeJsonAtomic(output,exportAnalysis(state,root));
    console.log(`Model calls: ${calls}. Review preview before uploading ${output}`);
  } finally { save(); }
} else throw new Error(`Unknown transfer command ${command}`);
