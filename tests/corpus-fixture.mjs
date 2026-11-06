import assert from 'node:assert/strict';
import { readJsonStrict } from '../tools/lib/fsio.mjs';
import { parsePost } from '../tools/lib/snapshot.mjs';
import { sha256 } from '../tools/lib/jobs.mjs';
import { topicJobs } from '../tools/lib/topic.mjs';
import { buildSiteData, loadResult } from '../tools/build.mjs';

// Retained parsed source, not a substitute manifest for the missing HTTP crawl.
// The original source digest pins parsing, field order, and hidden-post redaction.
export function corpusSnapshot() {
  const fixture = readJsonStrict(new URL('./fixtures/zcg-source.json', import.meta.url));
  assert.equal(fixture.format, 'zforum-test-source-1');
  const threads = fixture.threads.map(thread => ({ ...thread, posts: thread.posts.map(post => {
    if (post.hidden) assert.equal(post.raw, null);
    return parsePost({
      id: post.number, post_type: 1, post_number: post.number, username: post.username,
      created_at: post.created_at, reply_to_post_number: post.reply_to, hidden: post.hidden,
      ...(post.hidden ? {} : { raw: post.raw }),
    }, thread.id);
  }) }));
  assert.equal(sha256(JSON.stringify(threads)), fixture.source_sha256);
  return { snapshotAt: fixture.snapshotAt, threads, accounts: fixture.accounts };
}

export function corpusData() {
  const snapshot = corpusSnapshot();
  const historical = new Map(topicJobs(snapshot.threads, null).map(({job,view}) => [job.name,view]));
  const results = topicJobs(snapshot.threads).map(({job,view}) => {
    const loaded = loadResult(job, view, snapshot.threads, historical.get(job.name));
    assert.equal(loaded.missing, undefined, `Missing accepted fixture result ${job.name}`);
    return loaded.result;
  });
  return buildSiteData(snapshot, snapshot.accounts, results);
}
