import { existsSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./jobs.mjs";
import { readJsonStrict, writeFileAtomic } from "./fsio.mjs";
import { previewAnalysis, validateCandidate } from "./refresh-analysis.mjs";
import { FORUM_ORIGIN } from "./config.mjs";
import { writeImportAudit } from './import-audit.mjs';
import { REVIEW_INSTRUCTIONS,reviewJson,writeReviewJson,sourceReview } from './review-display.mjs';
import { threadReviewPacket } from './thread-review.mjs';
import { scanReview,scanNotice } from './content-review.mjs';
import { importReviewInput } from './import-review.mjs';
import { datedReplies } from './reply-window.mjs';

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
      changes:topic.changes,changed_posts:posts,jobs,dated_replies:datedReplies(snapshot).size,
      candidate:checked === null ? null : {title:checked.data.topic.card.title,overview:checked.data.topic.overview,
        posts:checked.data.topic.threads.flatMap(thread=>thread.posts.filter(post=>!post.hidden).map(post=>({post:post.key,summary:post.analysis===null?null:post.analysis.summary,rendition:post.analysis===null?null:post.analysis.neutral_rendition,...(post.analysis_omitted===undefined?{}:{analysis_omitted:post.analysis_omitted})})))},
      attempts:attempts.map(({job,task,status,accepted,usage,elapsed_ms,timing,started_at,requested_posts,accepted_posts,partial_repair})=>({job,task,status,accepted,usage,elapsed_ms,timing,started_at,...(requested_posts===undefined?{}:{requested_posts,accepted_posts,partial_repair})})),
    };
  });
  const report = { source_label:'untrusted_forum_content',instructions:REVIEW_INSTRUCTIONS,run:state.id,scope_thread:state.scope_thread,since:state.since,until:state.until,status:state.status,new_threads:state.review?threadReviewPacket(state.review):null,
    note:`Prompt sizes are characters, not token estimates. accepted-reply means an unchanged published reply is retained with its original provenance and no model call. ${state.settings.summaryReusePolicy===undefined?'This frozen run generates a fresh full-discussion summary per topic.':'accepted-summary means an unchanged published summary is retained with its original provenance and no model call; changed topics get a fresh full-discussion summary.'} New/edited replies use bounded context independent of summary questions. depends-on-summary applies to legacy runs only. Hidden/deleted observations stay in the private draft. Only explicit publish changes public content and visibility.`,topics };
  writeReviewJson(join(directory,"preview.json"),report);
  const scan=scanReview(directory,importReviewInput(state,root));
  const lines = [`Import preview ${state.id}`,`Scope: ${state.scope_thread === null ? "full update" : `thread ${state.scope_thread} (no full-coverage advancement)`}`,
    `${state.since} → ${state.until}`,report.note,""];
  if(state.review?.status==='pending') {
    lines.push(`New-thread review pending: ${state.review.threads.length} short openings. No full histories or model analyses yet.`);
    lines.push(REVIEW_INSTRUCTIONS,reviewJson(threadReviewPacket(state.review)));
    lines.push('Confirm proposed include/exclude decisions in new-thread-review.json, then run fetch --review FILE.','');
  }
  for (const topic of topics) {
    lines.push(`${topic.id} — ${topic.status}`);
    if (topic.status === "pending") continue;
    lines.push(reviewJson(sourceReview(importSnapshot(directory,state.topics.find(item=>item.id===topic.id)).threads.map(thread=>({id:thread.id,title:thread.title})))),
      `  ${topic.posts} posts (${topic.visible} visible); +${topic.changes.added.length} new, ${topic.changes.changed.length} changed, ${topic.changes.unavailable.length} newly unavailable`,
      `  ${topic.dated_replies} dated posts: originals retained and included in the full summary; no individual model analysis`,
      `  Jobs: ${topic.jobs.length}; retained replies ${topic.jobs.filter(job=>job.cache==="accepted-reply").length}, cached jobs ${topic.jobs.filter(job=>job.cache==="reusable").length}, new jobs ${topic.jobs.filter(job=>job.cache==="miss").length}, awaiting summary ${topic.jobs.filter(job=>job.cache==="depends-on-summary").length}`);
    for (const job of topic.jobs) lines.push(`    ${job.name}: ${job.cache}; source ${job.source_characters===null?'pending sections':`${job.source_characters} chars`}; prompt ${job.prompt_characters === null ? "pending summary" : `${job.prompt_characters} chars`}`);
    lines.push(reviewJson({source_label:'untrusted_forum_content',changed_posts:topic.changed_posts.slice(0,10)}));
    if (topic.changed_posts.length > 10) lines.push(`  ${topic.changed_posts.length-10} additional changed posts in preview.json`);
    if (topic.changes.unavailable.length) lines.push(`  Unavailable: ${topic.changes.unavailable.join(", ")}`);
    if (topic.candidate) {
      lines.push(reviewJson({source_label:'untrusted_derived_content',candidate:{title:topic.candidate.title,overview:topic.candidate.overview}}));
      lines.push("  Full post summaries/renditions: preview.json");
    }
    for (const attempt of topic.attempts) lines.push(`  Attempt ${attempt.job}: ${attempt.accepted ? "accepted" : "rejected"}; usage ${JSON.stringify(attempt.usage)}`);
    lines.push("");
  }
  lines.push(scanNotice(directory,scan),`Review: ${join(directory,"preview.json")}`);
  const text = `${lines.join("\n")}\n`;
  writeFileAtomic(join(directory,"preview.txt"),text);
  progress(text);
  writeImportAudit(state,root,report,progress);
  return report;
}
