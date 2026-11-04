import { isDeepStrictEqual } from 'node:util';
import { sha256 } from './jobs.mjs';
import { validateSummary } from './validate.mjs';

export const SUMMARY_REUSE_POLICY = 'unchanged-source-v1';

export function publishedSummaryBaseline(data,output,prompt) {
  if (data === null || output === null) return null;
  const expected={task:'summary',topic:data.topic.id,card:data.topic.card,headline:data.topic.headline,
    overview:data.topic.overview,points:data.topic.points.map(({first_at,...point})=>point),issues:data.topic.issues};
  if (!isDeepStrictEqual(output,expected)) throw new Error(`Published summary differs from stored summary: ${data.topic.id}`);
  const origins=(data.analysis_runs??[]).filter(run=>run.job===`summary-${data.topic.id}`);
  if (!origins.length) return null;
  if (origins.length!==1) throw new Error(`Duplicate summary provenance: ${data.topic.id}`);
  return {release:data.release_id,source_sha256:data.source_sha256,prompt_sha256:sha256(prompt),output,provenance:origins[0]};
}

export function summaryReuse(snapshot,prompt,job) {
  if (snapshot.summaryReusePolicy === undefined) return null;
  if (snapshot.summaryReusePolicy !== SUMMARY_REUSE_POLICY) throw new Error(`Unknown summary reuse policy ${snapshot.summaryReusePolicy}`);
  const baseline=snapshot.summaryBaseline;
  if (baseline === null) return null;
  if (!baseline || typeof baseline.source_sha256!=='string' || typeof baseline.prompt_sha256!=='string') throw new Error('Invalid frozen summary baseline');
  if (baseline.source_sha256!==sha256(JSON.stringify(snapshot.threads)) || baseline.prompt_sha256!==sha256(prompt)) return null;
  const problems=validateSummary(baseline.output,job,snapshot.threads);
  if (problems.length) throw new Error(`Invalid accepted summary: ${problems.join('; ')}`);
  const origin=baseline.provenance;
  if (!origin || origin.job!==job.name || typeof origin.input!=='string' || typeof origin.model!=='string' || typeof origin.backend!=='string' || typeof origin.runtime!=='string') throw new Error(`Missing accepted summary provenance: ${job.name}`);
  return baseline;
}

export function retainedSummaryRecord(item) {
  const baseline=item.summaryReuse,origin=baseline.provenance;
  return {agent:'retained-summary',model:origin.model,input:item.input,task:'summary',job:item.job.name,
    prompt_sha256:baseline.prompt_sha256,view_sha256:item.viewHash,output:baseline.output,
    retained_summary:baseline,metrics:{runtime:origin.runtime,reported_model:origin.reported_model,elapsed_ms:0,usage:null,cost_usd:null}};
}
