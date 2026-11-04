import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJsonStrict, writeJsonAtomic, writeFileAtomic } from './fsio.mjs';

export function importAudit(directory) {
  const path=join(directory,'audit-events.json');
  const read=()=>existsSync(path)?readJsonStrict(path):[];
  const save=event=>{const events=read(),index=events.findIndex(e=>e.id===event.id);if(index===-1)events.push(event);else events[index]=event;writeJsonAtomic(path,events);};
  return {
    get events(){return read();},
    record(category,details) { save({id:randomUUID(),category,...details}); },
    async measure(category,details,action) {
      const event={id:randomUUID(),category,...details,started_at:new Date().toISOString(),status:'running',elapsed_ms:null};
      save(event);const started=performance.now();
      try { const value=await action();event.status='complete';return value; }
      catch(error) { event.status='failed';event.error=error.message;throw error; }
      finally { event.elapsed_ms=performance.now()-started;event.finished_at=new Date().toISOString();save(event); }
    },
  };
}

function quantile(values,fraction) {return values.length?values.toSorted((a,b)=>a-b)[Math.floor((values.length-1)*fraction)]:null;}
function usageTotals(attempts) {
  const result={input_tokens:0,cached_input_tokens:0,output_tokens:0,unknown_usage:0};
  for(const attempt of attempts) {
    const usage=attempt.usage;
    if(!usage||!Number.isFinite(usage.input_tokens)||!Number.isFinite(usage.output_tokens)){result.unknown_usage++;continue;}
    result.input_tokens+=usage.input_tokens;result.output_tokens+=usage.output_tokens;
    if(Number.isFinite(usage.cached_input_tokens))result.cached_input_tokens+=usage.cached_input_tokens;
  }
  return result;
}

export function summarizeAttempts(attempts) {
  return {invocations:attempts.length,accepted:attempts.filter(a=>a.accepted===true).length,
    rejected:attempts.filter(a=>a.status!=='failed'&&a.accepted===false).length,
    failed:attempts.filter(a=>a.status==='failed').length,incomplete:attempts.filter(a=>a.status==='running').length,
    model_time_ms:attempts.reduce((sum,a)=>sum+(Number.isFinite(a.elapsed_ms)?a.elapsed_ms:0),0),
    unknown_time:attempts.filter(a=>!Number.isFinite(a.elapsed_ms)).length,...usageTotals(attempts)};
}

export function summarizeForum(events) {
  const groups=new Map();
  for(const event of events.filter(e=>e.category==='forum.http')) {
    const key=event.path.startsWith('/u/')?'profiles':event.section;
    if(!groups.has(key))groups.set(key,{requests:0,retries:0,rate_limited:0,network_ms:0,paths:new Set()});
    const row=groups.get(key);row.requests++;row.retries+=Number(event.attempt>1);row.rate_limited+=Number(event.http_status===429);row.network_ms+=event.elapsed_ms;row.paths.add(event.path);
  }
  return Object.fromEntries([...groups].map(([key,{paths,...row}])=>[key,{...row,unique_paths:paths.size,repeated_requests:row.requests-paths.size}]));
}

export function estimateAnalysis(topics,history,concurrency,{scopeComplete=true}={}) {
  const samples={summary:[],marks:[]};
  for(const a of history) {
    if(['monotonic','legacy_bounded'].includes(a.timing)&&a.accepted===true&&Number.isFinite(a.elapsed_ms))samples[a.task??(a.job.startsWith('summary-')?'summary':'marks')].push(a.elapsed_ms);
  }
  let low=0,high=0,remaining=0;const byType={};
  for(const task of ['summary','marks'])byType[task]={samples:samples[task].length,median_ms:quantile(samples[task],.5),p90_ms:quantile(samples[task],.9)};
  for(const topic of topics) {
    const misses=(topic.jobs??[]).filter(j=>j.cache==='miss'||j.cache==='depends-on-summary');
    for(const task of ['summary','marks']) {
      const count=misses.filter(j=>j.task===task).length;remaining+=count;
      const estimate=byType[task];
      // Summaries precede reply workers; topics currently execute sequentially.
      const waves=task==='summary'?count:Math.ceil(count/concurrency);
      if(estimate.median_ms!==null){low+=waves*estimate.median_ms;high+=waves*estimate.p90_ms*1.3;}
      else if(count) { low=NaN;high=NaN; }
    }
  }
  const complete=scopeComplete&&topics.every(t=>Array.isArray(t.jobs));
  return {remaining_jobs:complete?remaining:null,lower_ms:complete&&Number.isFinite(low)?low:null,upper_ms:complete&&Number.isFinite(high)?high:null,samples:byType,
    note:'Estimate uses accepted median/p90 durations, sequential topics and configured reply concurrency; upper bound adds 30% retry allowance. Historical wall-clock samples are used only within their runner timeout; new samples are monotonic. Missing samples mean unknown, not zero. Excludes human review and setup.'};
}

export function historicalAttempts(root,currentRun) {
  const rows=[];
  if(!existsSync(root))return rows;
  for(const directory of readdirSync(root,{withFileTypes:true})) {
    if(!directory.isDirectory()||directory.name===currentRun||directory.name==='cache')continue;
    const path=join(root,directory.name,'audit.json');
    if(existsSync(path))rows.push(...readJsonStrict(path).attempts);
    else {
      const reportPath=join(root,directory.name,'report.json');
      if(!existsSync(reportPath))continue;
      const state=readJsonStrict(reportPath);
      const limit=state.settings?.timeoutSeconds;
      if(!Number.isFinite(limit))continue;
      for(const topic of state.topics) {
        const manifest=join(root,directory.name,topic.id,'candidate','manifest.json');
        if(!existsSync(manifest))continue;
        for(const attempt of readJsonStrict(manifest).attempts??[]) {
          if(Number.isFinite(attempt.elapsed_ms)&&attempt.elapsed_ms>=0&&attempt.elapsed_ms<=limit*1000)rows.push({...attempt,timing:'legacy_bounded'});
        }
      }
    }
  }
  return rows;
}

export function writeImportAudit(state,root,preview,progress) {
  const directory=join(root,state.id),eventsPath=join(directory,'audit-events.json');
  const events=existsSync(eventsPath)?readJsonStrict(eventsPath):[];
  const attempts=preview.topics.flatMap(t=>(t.attempts??[]).map(a=>({...a,topic:t.id,task:a.task??(a.job.startsWith('summary-')?'summary':'marks')})));
  const sections=['summary','marks'].map(task=>({section:task,...summarizeAttempts(attempts.filter(a=>a.task===task))}));
  const byTopic=preview.topics.map(t=>({topic:t.id,...summarizeAttempts(attempts.filter(a=>a.topic===t.id)),retained_replies:(t.jobs??[]).filter(j=>j.cache==='accepted-reply').reduce((n,j)=>n+j.replies,0),assessed_replies:(t.jobs??[]).filter(j=>j.task==='marks'&&j.cache!=='accepted-reply').reduce((n,j)=>n+j.replies,0)}));
  const timings=Object.fromEntries([...new Set(events.map(e=>e.category))].map(category=>{
    const rows=events.filter(e=>e.category===category);
    return [category,{operations:rows.length,elapsed_ms:rows.reduce((n,e)=>n+(e.elapsed_ms??0),0),incomplete:rows.filter(e=>e.status==='running').length,failed:rows.filter(e=>e.status==='failed').length}];
  }));
  const report={format:'zforum-import-audit-1',run:state.id,since:state.since,until:state.until,generated_at:new Date().toISOString(),
    note:'Model invocations are application-level runner attempts, including retries/failures, not provider-internal network retries. Known token totals exclude unknown usage; cached input is a subset of input. Summed model time can overlap and is not wall time. Nested stage/HTTP timings must not be added together. Retained/cached outputs incur no new invocation. Operator chat, planning, code work and manual opening-review usage are not exposed by these importer records.',
    model:state.settings.model,concurrency:state.settings.concurrency??1,totals:summarizeAttempts(attempts),sections,topics:byTopic,timings,attempts,
    forum:summarizeForum(events),
    estimate:estimateAnalysis(preview.topics,[...historicalAttempts(root,state.id),...attempts],state.settings.concurrency??1,{scopeComplete:state.discovery!==null&&state.review?.status!=='pending'})};
  writeJsonAtomic(join(directory,'audit.json'),report);
  const columns=['section','invocations','accepted','rejected','failed','incomplete','input_tokens','cached_input_tokens','output_tokens','unknown_usage','model_time_ms'];
  writeFileAtomic(join(directory,'audit.csv'),[columns.join(','),...sections.map(row=>columns.map(c=>row[c]).join(','))].join('\n')+'\n');
  const topicColumns=['topic',...columns.slice(1),'retained_replies','assessed_replies'];
  writeFileAtomic(join(directory,'audit-topics.csv'),[topicColumns.join(','),...byTopic.map(row=>topicColumns.map(c=>row[c]).join(','))].join('\n')+'\n');
  const lines=[`Import audit ${state.id}`,`${state.since} → ${state.until}`,report.note,'',...sections.map(s=>`${s.section}: ${s.invocations} invocations (${s.accepted} accepted, ${s.rejected} rejected, ${s.failed} failed, ${s.incomplete} incomplete); ${s.input_tokens} input / ${s.cached_input_tokens} cached input / ${s.output_tokens} output tokens; ${s.unknown_usage} unknown usage; ${(s.model_time_ms/60000).toFixed(1)} summed model minutes`),
    '',...Object.entries(timings).map(([key,t])=>`${key}: ${t.operations} operations; ${(t.elapsed_ms/60000).toFixed(1)} minutes; ${t.failed} failures; ${t.incomplete} incomplete`),
    '',...Object.entries(report.forum).map(([key,t])=>`HTTP ${key}: ${t.requests} requests, ${t.unique_paths} unique URLs, ${t.repeated_requests} repeats (${t.retries} retries); ${t.rate_limited} rate-limit responses`),
    '',`Remaining model jobs: ${report.estimate.remaining_jobs??'unknown until fetch completes'}; estimated analysis time: ${report.estimate.lower_ms===null?'unknown until scope and timing samples exist':`${Math.ceil(report.estimate.lower_ms/60000)}–${Math.ceil(report.estimate.upper_ms/60000)} minutes`}`,report.estimate.note];
  writeFileAtomic(join(directory,'audit.txt'),lines.join('\n')+'\n');
  progress(lines.join('\n'));return report;
}
