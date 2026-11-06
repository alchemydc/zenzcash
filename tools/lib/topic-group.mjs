import { isDeepStrictEqual } from 'node:util';
import { sha256, summaryJob } from './jobs.mjs';
import { validateSummary } from './validate.mjs';
import { validateMarks } from './validate-marks.mjs';
import { parseTopicContent } from '../../site/js/catalog.js';
import { SITE_DATA_FORMAT } from '../../site/js/vocab.js';
import { RUBRIC_VERSION } from '../../site/js/rubric.js';

// A grouping changes topic-level interpretation, not the accepted assessments of posts.
export function buildTopicGroup({id, title, snapshot, sources, recovered, summary}) {
  const fail=message=>{throw new Error(`topic grouping: ${message}`);};
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(id)||typeof title!=='string'||!title.trim()||title.length>60)fail('invalid topic id or title');
  if(snapshot.topic!==id||snapshot.source_sha256!==sha256(JSON.stringify(snapshot.threads)))fail('source snapshot identity mismatch');
  const job=summaryJob(id,snapshot.threads).job;job.adaptive=true;
  const problems=validateSummary(summary.output,job,snapshot.threads);
  if(problems.length)fail(problems.join('; '));
  if(summary.output.card.title!==title||summary.output.headline!==title)fail('summary does not use the requested title');
  const requested=snapshot.threads.map(t=>t.id);
  if(new Set(requested).size!==requested.length)fail('duplicate source thread');
  const sourceTopics = new Set(), sourcePosts = new Set();
  for (const {data} of sources) {
    parseTopicContent(data,data.topic.id);
    if (sourceTopics.has(data.topic.id)) fail(`duplicate source topic ${data.topic.id}`);
    sourceTopics.add(data.topic.id);
    for (const post of data.topic.threads.flatMap(thread=>thread.posts)) {
      if (sourcePosts.has(post.key)) fail(`duplicate source post ${post.key}`);
      sourcePosts.add(post.key);
    }
  }
  for(const data of recovered) parseTopicContent(data,data.topic.id);
  const expected_releases={};
  for(const source of sources){
    if(source.snapshot.source_sha256!==sha256(JSON.stringify(source.snapshot.threads))||source.snapshot.source_sha256!==source.data.source_sha256)fail(`published snapshot mismatch for ${source.data.topic.id}`);
    if(source.data.topic.threads.some(t=>!requested.includes(t.id)))fail(`would omit part of ${source.data.topic.id}`);
    if(typeof source.data.release_id!=='string')fail(`release missing for ${source.data.topic.id}`);
    expected_releases[source.data.topic.id]=source.data.release_id;
  }
  const threads=snapshot.threads.map(raw=>{
    const owner=sources.find(s=>s.data.topic.threads.some(t=>t.id===raw.id));
    const data=owner ? owner.data : recovered.find(d=>d.topic.threads.some(t=>t.id===raw.id));
    if(!data)fail(`no checked assessments for thread ${raw.id}`);
    const prior=data.topic.threads.find(t=>t.id===raw.id);
    if(prior.posts.length!==raw.posts.length)fail(`thread ${raw.id} needs new post analysis`);
    for(const post of raw.posts){
      const checked=prior.posts.find(p=>p.number===post.number);
      if(!checked||checked.author!==post.username||['raw','own_text','segments','reply_to','created_at','hidden'].some(field=>!isDeepStrictEqual(checked[field],post[field])))fail(`source changed for ${raw.id}/${post.number}; checked analysis required`);
      if(!Number.isSafeInteger(post.forum_id)||post.forum_id<1)fail(`forum identity missing for ${raw.id}/${post.number}`);
    }
    const marks={task:'marks',topic_id:raw.id,rubric_version:RUBRIC_VERSION,posts:prior.posts.filter(p=>!p.hidden&&p.analysis!==null).map(p=>p.analysis)};
    const errors=validateMarks(marks,{task:'marks',topic_id:raw.id,expected:marks.posts.map(p=>p.post_number),issues:data.topic.issues.map(({id,issue})=>({id,issue}))},raw,snapshot.threads);
    if(errors.length)fail(`assessment validation for ${raw.id}: ${errors.join('; ')}`);
    return {...structuredClone(prior),assessment_context:{topic_id:data.topic.id,release_id:data.release_id,issues:data.topic.issues.map(({id,issue})=>({id,issue}))}};
  });
  const dates=new Map(snapshot.threads.flatMap(t=>t.posts.map(p=>[`${t.id}/${p.number}`,p.created_at])));
  const pulls=snapshot.pulls.map(({thread,pulled_at})=>({thread,pulled_at}));
  if(pulls.length!==requested.length||new Set(pulls.map(p=>p.thread)).size!==requested.length||pulls.some(p=>!requested.includes(p.thread)||!Number.isFinite(Date.parse(p.pulled_at))))fail('per-thread pull times do not match sources');
  const pullDates=pulls.map(p=>p.pulled_at).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const data={format:SITE_DATA_FORMAT,snapshot_at:snapshot.snapshotAt,source_sha256:snapshot.source_sha256,
    last_pulled_at:pullDates[0],analysis_pending:false,grouped_sources:pulls,
    forum_origin:sources[0].data.forum_origin,
    feedback_version:sha256(JSON.stringify(threads.flatMap(t=>t.posts.filter(p=>!p.hidden&&p.analysis!==null).map(p=>[p.key,p.analysis.neutral_rendition])).sort(([a],[b])=>a.localeCompare(b,'en')))),
    models:[...new Set([...sources.map(s=>s.data),...recovered].flatMap(d=>d.models).concat(`${summary.model} (codex-cli)`))].sort(),
    summary_run:{model:summary.model,agent:summary.agent,artifact_sha256:sha256(JSON.stringify(summary)),input:summary.input,request_sha256:summary.request_sha256,prompt_sha256:summary.prompt_sha256,view_sha256:summary.view_sha256},
    topic:{id,card:summary.output.card,headline:summary.output.headline,overview:summary.output.overview,points:summary.output.points.map(p=>({...p,first_at:dates.get(p.cites[0])})),issues:summary.output.issues,threads}};
  parseTopicContent(data,id);
  return {data,plan:{expected_releases,snapshot,snapshot_json:JSON.stringify(snapshot),summary:summary.output,fingerprints:Object.fromEntries(snapshot.threads.flatMap(t=>t.posts.map(p=>[p.forum_id,sha256(JSON.stringify(p))])))}};
}
