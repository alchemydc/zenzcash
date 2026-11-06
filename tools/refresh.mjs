// Operator-only; models receive public job text, never the private application database.
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { runProcess } from "./lib/process.mjs";
import { REPO_ROOT, WORK_DIR, TOPIC, IMPORT_TOPICS, configuredTopic } from "./lib/config.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { MODEL_INPUT_FORMAT } from './lib/model-input.mjs';
import { loadTopic } from "./lib/topic.mjs";
import { promptHash, promptText } from "./lib/prompt.mjs";
import { sha256 } from "./lib/jobs.mjs";
import { forumClient } from "./lib/forum-client.mjs";
import { fetchSnapshot, sourceChanges } from "./lib/refresh-source.mjs";
import { discoverRecent } from "./lib/discovery.mjs";
import { analyzeCandidate, validateCandidate } from "./lib/refresh-analysis.mjs";
import { runAgent } from "./lib/agent-runner.mjs";
import { assertLocalPreparation } from "./lib/preparation-boundary.mjs";
import { reviewInput,scanReview,requireScan,scanNotice,authorizePublication } from './lib/content-review.mjs';
import { writeReviewJson,reviewJson,sourceReview } from './lib/review-display.mjs';

export function parseRefreshArgs(args) {
  const [command,...rest]=args;
  if(!["week","discover","fetch","refresh","analyze","review","publish","compare"].includes(command))throw new Error("usage: scripts/zforum week|discover|fetch|refresh|analyze|review|publish|compare --run <name> [--topic <configured-id> --since <UTC-date> --until <UTC-date> --agent codex|claude --model <id> --candidate <name> --max-jobs 20 --timeout-seconds 600 --budget-usd 5 --db <path>]");
  const flags={};
  const allowed=new Set(["run","topic","since","until","agent","model","candidate","other","max-jobs","timeout-seconds","budget-usd","db"]);
  for(let index=0;index<rest.length;index+=2) {
    const key=rest[index].slice(2),value=rest[index+1];
    if(!rest[index].startsWith("--")||!allowed.has(key)||value===undefined||key in flags)throw new Error(`invalid or repeated option ${rest[index]}`);
    flags[key]=value;
  }
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(flags.run??""))throw new Error("--run must be a simple name, not a path");
  if(flags.topic !== undefined) configuredTopic(flags.topic);
  if(command === "discover" && flags.topic !== undefined)throw new Error("discovery uses the three-topic allowlist; --topic applies to individual topic commands");
  if(!["discover","week"].includes(command) && (flags.since !== undefined || flags.until !== undefined))throw new Error("--since and --until apply only to discovery");
  if(command === "week" && (flags.run.length > 50 || flags.topic !== undefined))throw new Error("week requires a run name of at most 50 characters and uses the configured three-topic allowlist");
  for(const key of ["since","until"]) if(flags[key] !== undefined && !Number.isFinite(Date.parse(flags[key])))throw new Error(`--${key} is not a timestamp: ${flags[key]}`);
  for(const key of ["candidate","other"])if(flags[key]!==undefined&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(flags[key]))throw new Error(`--${key} must be a simple name`);
  const limits={maxJobs:Number(flags["max-jobs"]??20),timeoutSeconds:Number(flags["timeout-seconds"]??600),budget:Number(flags["budget-usd"]??5)};
  if(!Number.isInteger(limits.maxJobs)||limits.maxJobs<1||limits.maxJobs>100||!Number.isInteger(limits.timeoutSeconds)||limits.timeoutSeconds<1||limits.timeoutSeconds>3600||!Number.isFinite(limits.budget)||limits.budget<=0||limits.budget>100)throw new Error("job/time/budget limits are outside allowed bounds");
  if(["week","refresh","analyze"].includes(command)&&(!["codex","claude"].includes(flags.agent)||!flags.model?.trim()||!flags.candidate))throw new Error("analysis requires --agent codex|claude, --model <exact-id> and --candidate <name>");
  if(flags.agent==="codex"&&flags["budget-usd"]!==undefined)throw new Error("--budget-usd is supported only by the Claude adapter; Codex has job and time limits");
  if(["review","publish","compare"].includes(command)&&!flags.candidate)throw new Error("choose --candidate explicitly");
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
  const topic=configuredTopic(snapshot.topic);
  if(!Array.isArray(snapshot.threads)||JSON.stringify(snapshot.threads.map(thread=>thread.id))!==JSON.stringify(topic.threadIds))throw new Error(`frozen snapshot does not match configured scope ${topic.id}`);
  if(snapshot.source_sha256!==sha256(JSON.stringify(snapshot.threads)))throw new Error(`frozen source fingerprint mismatch for ${topic.id}`);
  return {snapshot,prompts};
}
export function compareCandidates(left,right) {
  if(left.manifest.input_sha256!==right.manifest.input_sha256)throw new Error("comparison candidates do not share identical source/context/prompt inputs");
  const rows=(candidate)=>candidate.data.topic.threads.flatMap((thread)=>thread.posts.filter((post)=>!post.hidden));
  const byKey=new Map(rows(right).map((post)=>[post.key,post]));
  const samples=rows(left).sort((a,b)=>sha256(a.key).localeCompare(sha256(b.key))).slice(0,12).map((post)=>({post:post.key,original:post.raw,A:post.analysis,B:byKey.get(post.key).analysis,review:{faithfulness:null,missing_arguments:null,invented_claims:null,tone_changes:null,notes:"Human review required; structural validation is not semantic accuracy."}}));
  return {inputs:left.manifest.input_sha256,candidates:[left.manifest,right.manifest],blinded_sample:samples,published:false};
}
export async function runRefresh(options, get = forumClient()) {
  const root=join(WORK_DIR,"refresh"),directory=join(root,options.run),db=resolve(options.db??join(WORK_DIR,"zforum.sqlite"));
  if (["week","discover","fetch","refresh","analyze"].includes(options.command)) assertLocalPreparation(db,root);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const reportPath=join(directory,"run-report.json");
  try {
    if(options.command === "week") {
      const path=join(directory,"discovery.json");
      const discovery=existsSync(path) ? readJsonStrict(path) : await runRefresh({...options,command:"discover"},get);
      for(const key of ["since","until"])if(options[key]!==undefined&&Date.parse(options[key])!==Date.parse(discovery[key]))throw new Error(`frozen discovery ${key} differs; choose a new run name`);
      const reports=[];
      let remaining=options.maxJobs;
      for(const topic of IMPORT_TOPICS.filter(topic=>discovery.selected.includes(topic.id)||existsSync(join(root,`current-source-${topic.id}.json`)))) {
        const report=await runRefresh({...options,command:"refresh",topic:topic.id,run:`${options.run}-${topic.id}`,maxJobs:remaining},get);
        remaining-=report.invoked;
        reports.push({topic:topic.id,run:`${options.run}-${topic.id}`,report});
      }
      const report={status:"validated",since:discovery.since,until:discovery.until,discovered:discovery.threads.length,topics:reports,published:false};
      writeJsonAtomic(reportPath,report);
      console.log(`Week run validated ${reports.length} topics; review candidates before publishing.`);
      return report;
    }
    if(options.command === "discover") {
      const path=join(directory,"discovery.json");
      if(existsSync(path)) throw new Error(`discovery already exists in ${options.run}; choose a new run name`);
      const until=options.until ?? new Date().toISOString();
      const since=options.since ?? new Date(Date.parse(until)-7*86400000).toISOString();
      const discovery=await discoverRecent({get,since,until});
      writeJsonAtomic(path,discovery);
      const scan=scanReview(directory,reviewInput({run:options.run,phase:'discovery',discovery:discovery.threads}));
      console.log(scanNotice(directory,scan));
      console.log(reviewJson(sourceReview(discovery.threads.map(thread=>({id:thread.id,title:thread.title})))));
      writeJsonAtomic(reportPath,{status:"discovered",topics:discovery.threads.length,selected:discovery.selected,published:false});
      console.log(`Discovered ${discovery.threads.length} active threads; selected ${discovery.selected.join(", ")}`);
      return discovery;
    }
    if(["fetch","refresh"].includes(options.command)&&!existsSync(join(directory,"frozen.json"))) {
      const topic=configuredTopic(options.topic ?? TOPIC.id);
      const current=join(root,`current-source-${topic.id}.json`);
      const previous=existsSync(current)?readJsonStrict(current):topic.id === TOPIC.id ? loadTopic() : {threads:[]};
      const snapshot=await fetchSnapshot({get,previous,topic,
        checkpoint:(value)=>writeJsonAtomic(join(directory,"fetch-progress.json"),value),
      });
      snapshot.modelInputFormat=MODEL_INPUT_FORMAT;
      const changes=sourceChanges(previous,snapshot);
      const priorSummary=join(root,`current-summary-${topic.id}.json`);
      if(changes.unavailable.length === 0) {
        if(previous.source_sha256 === snapshot.source_sha256 && previous.previousSummary) snapshot.previousSummary=previous.previousSummary;
        else if(previous.source_sha256 !== snapshot.source_sha256 && existsSync(priorSummary)) snapshot.previousSummary=readJsonStrict(priorSummary);
      }
      const prompts={marks:promptText("marks"),summary:promptText("summary")};
      writeJsonAtomic(join(directory,"changes.json"),changes);
      writeJsonAtomic(join(directory,"snapshot.json"),snapshot);writeJsonAtomic(join(directory,"prompts.json"),prompts);
      writeJsonAtomic(join(directory,"frozen.json"),{snapshot_sha256:sha256(JSON.stringify(snapshot)),prompts_sha256:sha256(JSON.stringify(prompts))});
    }
    if (["fetch","refresh"].includes(options.command)) {
      const {snapshot} = frozen(directory);
      if(options.topic !== undefined && options.topic !== snapshot.topic)throw new Error(`run ${options.run} belongs to ${snapshot.topic}, not ${options.topic}`);
      writeJsonAtomic(join(root,`current-source-${snapshot.topic}.json`),snapshot);
    }
    if(options.command==="fetch") {
      const {snapshot}=frozen(directory);
      console.log(scanNotice(directory,scanReview(directory,reviewInput({run:options.run,phase:'fetch',snapshots:[snapshot]}))));
      writeJsonAtomic(reportPath,{status:"fetched",published:false,changes:readJsonStrict(join(directory,"changes.json"))});console.log(`Frozen public snapshot: ${directory}`);return;
    }
    const {snapshot,prompts}=frozen(directory);
    if(options.topic !== undefined && options.topic !== snapshot.topic)throw new Error(`run ${options.run} belongs to ${snapshot.topic}, not ${options.topic}`);
    const candidate=join(directory,"candidates",options.candidate);
    if(["refresh","analyze"].includes(options.command)) {
      const report=await analyzeCandidate({directory:candidate,cacheDirectory:join(root,"cache"),snapshot,prompts,agent:options.agent,model:options.model,maxJobs:options.maxJobs,timeoutSeconds:options.timeoutSeconds,budget:options.budget,run:runAgent,progress:console.log});
      console.log(scanNotice(candidate,scanReview(candidate,reviewInput({run:options.run,phase:'candidate',snapshots:[snapshot],candidates:[readJsonStrict(join(candidate,'site.json'))]}))));
      writeJsonAtomic(reportPath,{status:"validated",candidate:options.candidate,published:false,report});
      console.log(`Validated ${options.candidate}; review before scripts/zforum publish --run ${options.run} --candidate ${options.candidate}`);
      return report;
    } else if(options.command==='review') {
      const checked=validateCandidate(candidate,snapshot,prompts);
      console.log(scanNotice(candidate,scanReview(candidate,reviewInput({run:options.run,phase:'candidate',snapshots:[snapshot],candidates:[checked.data]}))));
    } else if(options.command==="publish") {
      for(const task of ["marks","summary"])if(sha256(prompts[task])!==promptHash(task))throw new Error(`current ${task} prompt/rubric differs from this candidate; do not publish stale analysis`);
      const checked=validateCandidate(candidate,snapshot,prompts);
      const scan=requireScan(candidate,reviewInput({run:options.run,phase:'candidate',snapshots:[snapshot],candidates:[checked.data]}));
      console.log(scanNotice(candidate,scan));
      await server(db,"record-pull","--file",join(directory,"snapshot.json"));
      authorizePublication(candidate,reviewInput({run:options.run,phase:'candidate',snapshots:[snapshot],candidates:[checked.data]}),join(candidate,'site.json'));
      const release=await server(db,"publish","--file",join(candidate,"site.json"),'--review',candidate);
      writeJsonAtomic(join(root,`current-summary-${snapshot.topic}.json`),readJsonStrict(join(candidate,`summary-${snapshot.topic}.json`)).output);
      writeJsonAtomic(reportPath,{status:"published",candidate:options.candidate,release});console.log(`Published release ${release}`);
    } else {
      const left=validateCandidate(candidate,snapshot,prompts),right=validateCandidate(join(directory,"candidates",options.other),snapshot,prompts);
      const comparison=compareCandidates(left,right);writeReviewJson(join(directory,`compare-${options.candidate}-${options.other}.json`),{source_label:'untrusted_forum_content',...comparison});
      writeReviewJson(join(directory,"blind-review.json"),{source_label:'untrusted_forum_content',inputs:comparison.inputs,samples:comparison.blinded_sample});
      console.log("Comparison and blinded review packet written; no candidate was published.");
    }
  } catch(error) {writeJsonAtomic(reportPath,{status:"failed",stage:options.command,error:error.message,published:false});throw error;}
}
if(import.meta.main)await runRefresh(parseRefreshArgs(process.argv.slice(2)));
