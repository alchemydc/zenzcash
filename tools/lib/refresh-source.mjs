import { TOPIC } from "./config.mjs";
import { parsePost } from "./snapshot.mjs";
import { accountProfile } from "./forum-client.mjs";
export function restrictedPosts(previous, thread) {
  const available = new Set(thread.posts.filter((post) => !post.hidden).map((post) => `${thread.id}/${post.number}`));
  return previous.threads.filter((old) => old.id === thread.id).flatMap((old) => old.posts.filter((post) => !post.hidden && !available.has(`${old.id}/${post.number}`)).map((post) => `${old.id}/${post.number}`));
}
export async function fetchSnapshot({ get, previous, checkpoint, restrict, clock = () => new Date().toISOString() }) {
  const threads = [], pulls = [];
  for (const id of TOPIC.threadIds) {
    const result = await get(`/t/${id}.json?include_raw=true`);
    const old = previous.threads.find((thread) => thread.id === id);
    if (result.unavailable) {
      if (!old) throw new Error(`thread ${id} is unavailable and has no previous metadata`);
      await restrict(old.posts.filter((post) => !post.hidden).map((post) => `${id}/${post.number}`));
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
        const post = parsePost(normalized, id); records.set(raw.id, post);
        if (post.hidden) await restrict([`${id}/${post.number}`]);
      }
      if (ids.some((key) => !records.has(key))) throw new Error(`thread ${id}: missing post in requested batch; retry the pull`);
      await checkpoint({ threads, pulls, cursor: { thread: id, fetched: records.size, total: stream.length } });
    }
    const thread = { id, title: topic.title, slug: topic.slug, created_at: topic.created_at, posts: [...records.values()].filter((post) => post !== null).sort((a,b) => a.number-b.number) };
    await restrict(restrictedPosts(previous, thread));
    threads.push(thread); pulls.push({ thread: id, pulled_at: clock(), unavailable: null });
    await checkpoint({ threads, pulls });
  }
  const accounts = {};
  for (const username of [...new Set(threads.flatMap((thread) => thread.posts.map((post) => post.username)))].sort()) accounts[username] = await accountProfile(get, username);
  return { snapshotAt: clock(), threads, accounts, pulls };
}
