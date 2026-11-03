import { join, resolve } from "node:path";
import { REPO_ROOT, WORK_DIR } from "./lib/config.mjs";
import { ImportStore } from "./lib/import-store.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { exportImport, receiveSources, exportAnalysis, acceptAnalysis, prepareImport, stagePreparedImport } from "./lib/import-transfer.mjs";
import { runProcess } from "./lib/process.mjs";
import { analyzeImportTopics } from "./lib/import-analysis.mjs";
import { writeImportPreview } from "./lib/import-preview.mjs";
import { checkSubscriptionLogin, runAgent } from "./lib/agent-runner.mjs";

process.umask(0o077);
const [command,file,option,...extra] = process.argv.slice(2);
if (!file || extra.length) throw new Error("Usage: import-transfer.mjs export|accept|prepare|stage FILE DB | analyze FILE MAX_CALLS");
const root = join(WORK_DIR,"imports");
if (["export","accept","prepare","stage"].includes(command)) {
  if (!option) throw new Error("Transfer requires an explicit database path");
  const store = new ImportStore(resolve(option),{readOnly:["export","prepare"].includes(command)});
  try {
    if (command === "export") writeJsonAtomic(file,exportImport(store.active(),root));
    else if(command==="prepare")writeJsonAtomic(file,prepareImport(store,root));
    else if(command==="stage") {
      const server=async(action,...flags)=>(await runProcess(join(REPO_ROOT,"server/target/release/zforum-server"),[action,"--db",resolve(option),...flags],{timeoutSeconds:120})).stdout;
      await stagePreparedImport(readJsonStrict(file),store,root,server);
    } else acceptAnalysis(readJsonStrict(file),store,root);
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
