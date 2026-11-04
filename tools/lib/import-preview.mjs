import { existsSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./jobs.mjs";
import { readJsonStrict, writeJsonAtomic, writeFileAtomic } from "./fsio.mjs";
import { previewAnalysis, validateCandidate } from "./refresh-analysis.mjs";
import { FORUM_ORIGIN } from "./config.mjs";
import { writeImportAudit } from './import-audit.mjs';

export function importSnapshot(directory, topic) {
  const snapshot = readJsonStrict(join(directory,topic.id,"snapshot.json"));
  if (snapshot.topic !== topic.id || snapshot.source_sha256 !== topic.source_sha256 ||
      snapshot.source_sha256 !== sha256(JSON.stringify(snapshot.threads)) ||
      sha256(JSON.stringify(snapshot)) !== topic.snapshot_sha256) {
    throw new Error(`Frozen snapshot changed: ${topic.id}`);
  }
  return snapshot;
}

export function writeImportPreview(state, root, progress) {
  const directory = join(root,state.id);
  const topics = state.topics.map(topic => {
    if (topic.status === "pending") return { id:topic.id, status:topic.status };
    const snapshot = importSnapshot(directory,topic);
    const candidate = join(directory,topic.id,"candidate");
    const jobs = previewAnalysis({directory:candidate,cacheDirectory:join(root,"cache"),snapshot,
      prompts:state.settings.prompts,agent:"codex",model:state.settings.model});
    const checked = ["analyzed","published"].includes(topic.status) ? validateCandidate(candidate,snapshot,state.settings.prompts) : null;
    const changed = new Set([...topic.changes.added,...topic.changes.changed]);
    const posts = snapshot.threads.flatMap(thread => thread.posts.filter(post => !post.hidden && changed.has(`${thread.id}/${post.number}`)).map(post => ({
      post:`${thread.id}/${post.number}`,url:`${FORUM_ORIGIN}/t/${thread.id}/${post.number}`,excerpt:post.raw.slice(0,280),
    })));
    const manifest = join(candidate,"manifest.json");
    const attempts = existsSync(manifest) ? readJsonStrict(manifest).attempts : [];
    return { id:topic.id,status:topic.status,titles:snapshot.threads.map(thread=>thread.title),posts:topic.posts,visible:topic.visible,
      changes:topic.changes,changed_posts:posts,jobs,
      candidate:checked === null ? null : {title:checked.data.topic.card.title,overview:checked.data.topic.overview,
        posts:checked.data.topic.threads.flatMap(thread=>thread.posts.filter(post=>!post.hidden).map(post=>({post:post.key,summary:post.analysis.summary,rendition:post.analysis.neutral_rendition})))},
      attempts:attempts.map(({job,task,status,accepted,usage,elapsed_ms,timing,started_at})=>({job,task,status,accepted,usage,elapsed_ms,timing,started_at})),
    };
  });
  const report = { run:state.id,scope_thread:state.scope_thread,since:state.since,until:state.until,status:state.status,new_threads:state.review??null,
    note:"Prompt sizes are characters, not token estimates. accepted-reply means an unchanged published reply is retained with its original provenance and no model call. Under reply-reuse-v1 each import gets a fresh full-discussion summary; new/edited replies use bounded context independent of summary questions. depends-on-summary applies to legacy runs only. Hidden/deleted observations stay in the private draft. Only explicit publish changes public content and visibility.",topics };
  writeJsonAtomic(join(directory,"preview.json"),report);
  const lines = [`Import preview ${state.id}`,`Scope: ${state.scope_thread === null ? "full update" : `thread ${state.scope_thread} (no full-coverage advancement)`}`,
    `${state.since} → ${state.until}`,report.note,""];
  if(state.review?.status==='pending') {
    lines.push(`New-thread review pending: ${state.review.threads.length} short openings. No full histories or model analyses yet.`);
    for(const thread of state.review.threads)lines.push(`  ${thread.id} ${JSON.stringify(thread.title)} ${JSON.stringify(thread.excerpt)}`);
    lines.push('Confirm proposed include/exclude decisions in new-thread-review.json, then run fetch --review FILE.','');
  }
  for (const topic of topics) {
    lines.push(`${topic.id} — ${topic.status}`);
    if (topic.status === "pending") continue;
    lines.push(`  ${topic.titles.map(title=>JSON.stringify(title)).join(" / ")}`,
      `  ${topic.posts} posts (${topic.visible} visible); +${topic.changes.added.length} new, ${topic.changes.changed.length} changed, ${topic.changes.unavailable.length} newly unavailable`,
      `  Jobs: ${topic.jobs.length}; retained replies ${topic.jobs.filter(job=>job.cache==="accepted-reply").length}, cached jobs ${topic.jobs.filter(job=>job.cache==="reusable").length}, new jobs ${topic.jobs.filter(job=>job.cache==="miss").length}, awaiting summary ${topic.jobs.filter(job=>job.cache==="depends-on-summary").length}`);
    for (const job of topic.jobs) lines.push(`    ${job.name}: ${job.cache}; source ${job.source_characters} chars; prompt ${job.prompt_characters === null ? "pending summary" : `${job.prompt_characters} chars`}`);
    for (const post of topic.changed_posts.slice(0,10)) lines.push(`  ${post.url} ${JSON.stringify(post.excerpt)}`);
    if (topic.changed_posts.length > 10) lines.push(`  ${topic.changed_posts.length-10} additional changed posts in preview.json`);
    if (topic.changes.unavailable.length) lines.push(`  Unavailable: ${topic.changes.unavailable.join(", ")}`);
    if (topic.candidate) {
      lines.push(`  Candidate: ${JSON.stringify(topic.candidate.title)}`);
      for (const point of topic.candidate.overview) lines.push(`    ${JSON.stringify(point.text)} [${point.cites.join(", ")}]`);
      lines.push("  Full post summaries/renditions: preview.json");
    }
    for (const attempt of topic.attempts) lines.push(`  Attempt ${attempt.job}: ${attempt.accepted ? "accepted" : "rejected"}; usage ${JSON.stringify(attempt.usage)}`);
    lines.push("");
  }
  lines.push(`Review: ${join(directory,"preview.json")}`);
  const text = `${lines.join("\n")}\n`;
  writeFileAtomic(join(directory,"preview.txt"),text);
  progress(text);
  writeImportAudit(state,root,report,progress);
  return report;
}
