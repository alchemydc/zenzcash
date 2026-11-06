// Shared test helpers: a seeded random generator for property tests (no dependency), and
// small hand-built threads in the shape tools/lib/snapshot.mjs produces.

import { ownText, segments } from "../tools/lib/quotes.mjs";

// mulberry32: deterministic, so a failing property run is reproducible from its seed.
export function random(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}

export function post(number, username, createdAt, raw, { replyTo = null, hidden = false } = {}) {
  return {
    number,
    username,
    created_at: createdAt,
    reply_to: replyTo,
    hidden,
    raw: hidden ? null : raw,
    own_text: hidden ? null : ownText(raw),
    segments: hidden ? null : segments(raw),
  };
}

export function sampleThread() {
  return {
    id: 7,
    title: "Sample thread",
    slug: "sample-thread",
    created_at: "2026-10-30T10:00:00Z",
    posts: [
      post(1, "alice", "2026-10-30T10:00:00Z", "ZCG should end. It costs 8% of every block and $100M sits idle. See https://example.org/report for details."),
      post(2, "bob", "2026-10-30T12:00:00Z", '[quote="alice, post:1, topic:7"]\nZCG should end.\n[/quote]\n\nYou are clearly paid to say that. ZCG funded 400 grants.', { replyTo: 1 }),
      post(3, "carol", "2026-10-31T09:00:00Z", "", { hidden: true }),
      post(4, "alice", "2026-10-31T20:00:00Z", "+1 to everything I said before.\nZCG should end."),
    ],
  };
}

export function listingFixture(data) {
  const posts = data.topic.threads.flatMap(thread => thread.posts);
  const authors = new Set(posts.map(post => post.author));
  return {
    format: 'zforum-topic-listing-1', release_id: data.release_id ?? 'fixture', snapshot_at: data.snapshot_at,
    visibility_pending: data.visibility_pending === true,
    topic: { id: data.topic.id, card: data.topic.card, threads: data.topic.threads.map(({id,title,url}) => ({id,title,url})) },
    stats: { threads: data.topic.threads.length, posts: posts.length, participants: authors.size, medianYears: null, joinedRecently: 0, unknownAge: authors.size, lastPostAt: posts.map(post=>post.created_at).sort().at(-1) },
  };
}
