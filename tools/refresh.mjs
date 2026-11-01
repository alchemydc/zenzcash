// Operator-only; models receive public job text, never the private application database.
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { runProcess } from "./lib/process.mjs";
import { REPO_ROOT, WORK_DIR, PROMPTS_DIR } from "./lib/config.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { loadTopic } from "./lib/topic.mjs";
import { promptHash } from "./lib/prompt.mjs";
import { sha256 } from "./lib/jobs.mjs";
import { forumClient } from "./lib/forum-client.mjs";
import { fetchSnapshot } from "./lib/refresh-source.mjs";
import { analyzeCandidate, validateCandidate } from "./lib/refresh-analysis.mjs";
import { runAgent } from "./lib/agent-runner.mjs";

export function parseRefreshArgs(args) {
  const [command,...rest]=args;
  if(!["fetch","refresh","analyze","publish","compare"].includes(command))throw new Error("usage: scripts/zforum fetch|refresh|analyze|publish|compare --run <name> [--agent codex|claude --model <id> --candidate <name> --max-jobs 20 --timeout-seconds 600 --budget-usd 5 --db <path>]");
  const flags={};
  const allowed=new Set(["run","agent","model","candidate","other","max-jobs","timeout-seconds","budget-usd","db"]);
  for(let index=0;index<rest.length;index+=2) {
    const key=rest[index].slice(2),value=rest[index+1];
    if(!rest[index].startsWith("--")||!allowed.has(key)||value===undefined||key in flags)throw new Error(`invalid or repeated option ${rest[index]}`);
    flags[key]=value;
  }
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(flags.run??""))throw new Error("--run must be a simple name, not a path");
  for(const key of ["candidate","other"])if(flags[key]!==undefined&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(flags[key]))throw new Error(`--${key} must be a simple name`);
  const limits={maxJobs:Number(flags["max-jobs"]??20),timeoutSeconds:Number(flags["timeout-seconds"]??600),budget:Number(flags["budget-usd"]??5)};
  if(!Number.isInteger(limits.maxJobs)||limits.maxJobs<1||limits.maxJobs>100||!Number.isInteger(limits.timeoutSeconds)||limits.timeoutSeconds<1||limits.timeoutSeconds>3600||!Number.isFinite(limits.budget)||limits.budget<=0||limits.budget>100)throw new Error("job/time/budget limits are outside allowed bounds");
  if(["refresh","analyze"].includes(command)&&(!["codex","claude"].includes(flags.agent)||!flags.model?.trim()||!flags.candidate))throw new Error("analysis requires --agent codex|claude, --model <exact-id> and --candidate <name>");
  if(flags.agent==="codex"&&flags["budget-usd"]!==undefined)throw new Error("--budget-usd is supported only by the Claude adapter; Codex has job and time limits");
  if(["publish","compare"].includes(command)&&!flags.candidate)throw new Error("choose --candidate explicitly");
  if(command==="compare"&&!flags.other)throw new Error("comparison requires --other candidate");
  return {command,...flags,...limits};
}
async function server(db,command,...args) {
  const binary=join(REPO_ROOT,"server/target/release/zforum-server");
  if(!existsSync(binary))throw new Error("build the server first: cargo build --release --manifest-path server/Cargo.toml");
  return (await runProcess(binary,[command,"--db",db,...args])).stdout.trim();
}
function frozen(runDirectory) {
  const manifest=readJsonStrict(join(runDirectory,"frozen.json"));
  const snapshot=readJsonStrict(join(runDirectory,"snapshot.json")),prompts=readJsonStrict(join(runDirectory,"prompts.json"));
  if(sha256(JSON.stringify(snapshot))!==manifest.snapshot_sha256||sha256(JSON.stringify(prompts))!==manifest.prompts_sha256)throw new Error("frozen snapshot or prompts changed; create a new run");
  return {snapshot,prompts};
}
export function compareCandidates(left,right) {
  if(left.manifest.input_sha256!==right.manifest.input_sha256)throw new Error("comparison candidates do not share identical source/context/prompt inputs");
  const rows=(candidate)=>candidate.data.topic.threads.flatMap((thread)=>thread.posts.filter((post)=>!post.hidden));
  const byKey=new Map(rows(right).map((post)=>[post.key,post]));
  const samples=rows(left).sort((a,b)=>sha256(a.key).localeCompare(sha256(b.key))).slice(0,12).map((post)=>({post:post.key,original:post.raw,A:post.analysis,B:byKey.get(post.key).analysis,review:{faithfulness:null,missing_arguments:null,invented_claims:null,tone_changes:null,notes:"Human review required; structural validation is not semantic accuracy."}}));
  return {inputs:left.manifest.input_sha256,candidates:[left.manifest,right.manifest],blinded_sample:samples,published:false};
}
async function main() {
  const options=parseRefreshArgs(process.argv.slice(2));
  const root=join(WORK_DIR,"refresh"),directory=join(root,options.run),db=resolve(options.db??join(WORK_DIR,"zforum.sqlite"));
  mkdirSync(directory,{recursive:true,mode:0o700});
  const reportPath=join(directory,"run-report.json");
  try {
    if(["fetch","refresh"].includes(options.command)&&!existsSync(join(directory,"frozen.json"))) {
      const previous=existsSync(join(root,"current-source.json"))?readJsonStrict(join(root,"current-source.json")):loadTopic();
      const snapshot=await fetchSnapshot({get:forumClient(),previous,
        checkpoint:(value)=>writeJsonAtomic(join(directory,"fetch-progress.json"),value),
        restrict:async(keys)=>{if(!keys.length)return;const file=join(directory,"restrictions.json");writeJsonAtomic(file,keys);await server(db,"restrict","--file",file);},
      });
      const prompts={marks:`${readFileSync(join(PROMPTS_DIR,"marks.md"),"utf8")}\n${readFileSync(join(REPO_ROOT,"site/js/rubric.js"),"utf8")}`,summary:readFileSync(join(PROMPTS_DIR,"summary.md"),"utf8")};
      writeJsonAtomic(join(directory,"snapshot.json"),snapshot);writeJsonAtomic(join(directory,"prompts.json"),prompts);
      writeJsonAtomic(join(directory,"frozen.json"),{snapshot_sha256:sha256(JSON.stringify(snapshot)),prompts_sha256:sha256(JSON.stringify(prompts))});
    }
    if (["fetch","refresh"].includes(options.command)) {
      const {snapshot} = frozen(directory);
      await server(db,"record-pull","--file",join(directory,"snapshot.json"));
      writeJsonAtomic(join(root,"current-source.json"),snapshot);
    }
    if(options.command==="fetch") {writeJsonAtomic(reportPath,{status:"fetched",published:false});console.log(`Frozen public snapshot: ${directory}`);return;}
    const {snapshot,prompts}=frozen(directory);
    const candidate=join(directory,"candidates",options.candidate);
    if(["refresh","analyze"].includes(options.command)) {
      const report=await analyzeCandidate({directory:candidate,snapshot,prompts,agent:options.agent,model:options.model,maxJobs:options.maxJobs,timeoutSeconds:options.timeoutSeconds,budget:options.budget,run:runAgent,progress:console.log});
      writeJsonAtomic(reportPath,{status:"validated",candidate:options.candidate,published:false,report});
      console.log(`Validated ${options.candidate}; review before scripts/zforum publish --run ${options.run} --candidate ${options.candidate}`);
    } else if(options.command==="publish") {
      for(const task of ["marks","summary"])if(sha256(prompts[task])!==promptHash(task))throw new Error(`current ${task} prompt/rubric differs from this candidate; do not publish stale analysis`);
      validateCandidate(candidate,snapshot,prompts);
      const release=await server(db,"publish","--file",join(candidate,"site.json"));
      writeJsonAtomic(reportPath,{status:"published",candidate:options.candidate,release});console.log(`Published release ${release}`);
    } else {
      const left=validateCandidate(candidate,snapshot,prompts),right=validateCandidate(join(directory,"candidates",options.other),snapshot,prompts);
      const comparison=compareCandidates(left,right);writeJsonAtomic(join(directory,`compare-${options.candidate}-${options.other}.json`),comparison);
      writeJsonAtomic(join(directory,"blind-review.json"),{inputs:comparison.inputs,samples:comparison.blinded_sample});
      console.log("Comparison and blinded review packet written; no candidate was published.");
    }
  } catch(error) {writeJsonAtomic(reportPath,{status:"failed",stage:options.command,error:error.message,published:false});throw error;}
}
if(import.meta.main)await main();
