import { TOPIC } from "./config.mjs";
import { parsePost } from "./snapshot.mjs";
import { accountProfile } from "./forum-client.mjs";
import { sha256 } from "./jobs.mjs";
import { assertLocalPreparation } from "./preparation-boundary.mjs";
export async function fetchSnapshot({ get, previous, checkpoint, topic = TOPIC, clock = () => new Date().toISOString(), retainForumIds = false }) {
  assertLocalPreparation();
  const threads = [], pulls = [];
  for (const id of topic.threadIds) {
    const result = await get(`/t/${id}.json?include_raw=true`);
    const old = previous.threads.find((thread) => thread.id === id);
    if (result.unavailable) {
      if (!old) throw new Error(`thread ${id} is unavailable and has no previous metadata`);
      threads.push({ ...old, posts: old.posts.map((post) => ({ ...post, hidden: true, raw: null, own_text: null, segments: null })) });
      pulls.push({ thread: id, pulled_at: clock(), unavailable: result.unavailable });
      await checkpoint({ threads, pulls }); continue;
    }
    const topic = result.body;
    if (topic.id !== id || typeof topic.title !== "string" || typeof topic.slug !== "string" || !Number.isFinite(Date.parse(topic.created_at)) || !Array.isArray(topic.post_stream?.stream)) throw new Error(`thread ${id}: malformed topic response`);
    const stream = topic.post_stream.stream;
    if (stream.length > 10000 || new Set(stream).size !== stream.length || stream.some((key) => !Number.isSafeInteger(key) || key <= 0)) throw new Error(`thread ${id}: invalid or oversized post-id stream (${stream.length})`);
    const records = new Map();
    // Re-fetch every batch, including older posts. Creation timestamps cannot detect edits.
    for (let offset = 0; offset < stream.length; offset += 20) {
      const ids = stream.slice(offset, offset + 20);
      const query = new URLSearchParams({ include_raw: "true" }); for (const key of ids) query.append("post_ids[]", String(key));
      const batch = await get(`/t/${id}/posts.json?${query}`);
      if (batch.unavailable || !Array.isArray(batch.body?.post_stream?.posts)) throw new Error(`thread ${id}: post batch unavailable; partial pulls are not fresh snapshots`);
      for (const raw of batch.body.post_stream.posts) {
        if (!ids.includes(raw.id) || records.has(raw.id)) throw new Error(`thread ${id}: unexpected or repeated post id ${raw.id}`);
        if (raw.post_type !== 1) { records.set(raw.id, null); continue; }
        const normalized = { ...raw };
        if (raw.hidden === true || raw.deleted_at) { normalized.hidden = true; delete normalized.raw; }
        const post = parsePost(normalized, id);
        if (retainForumIds) post.forum_id = raw.id;
        records.set(raw.id, post);
      }
      if (ids.some((key) => !records.has(key))) throw new Error(`thread ${id}: missing post in requested batch; retry the pull`);
      await checkpoint({ threads, pulls, cursor: { thread: id, fetched: records.size, total: stream.length } });
    }
    const thread = { id, title: topic.title, slug: topic.slug, created_at: topic.created_at, posts: [...records.values()].filter((post) => post !== null).sort((a,b) => a.number-b.number) };
    threads.push(thread); pulls.push({ thread: id, pulled_at: clock(), unavailable: null });
    await checkpoint({ threads, pulls });
  }
  const accounts = {};
  for (const username of [...new Set(threads.flatMap((thread) => thread.posts.map((post) => post.username)))].sort()) accounts[username] = await accountProfile(get, username);
  return { topic: topic.id, snapshotAt: clock(), threads, source_sha256: sha256(JSON.stringify(threads)), accounts, pulls };
}

export function sourceChanges(previous, snapshot) {
  const rows = (source) => new Map(source.threads.flatMap((thread) => thread.posts.map((post) => [`${thread.id}/${post.number}`, post])));
  const old = rows(previous), current = rows(snapshot);
  const result = { added: [], changed: [], unavailable: [] };
  for (const [key, post] of current) {
    if (post.hidden) { if (old.has(key) && !old.get(key).hidden) result.unavailable.push(key); }
    else if (!old.has(key)) result.added.push(key);
    else if (JSON.stringify(old.get(key)) !== JSON.stringify(post)) result.changed.push(key);
  }
  for (const [key, post] of old) if (!post.hidden && !current.has(key)) result.unavailable.push(key);
  return result;
}
