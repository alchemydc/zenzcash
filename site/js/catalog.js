import { SITE_DATA_FORMAT } from "./vocab.js";

export function parseCatalog(value) {
  if (!value || Object.keys(value).sort().join(",") !== "topics,unavailable" || !Array.isArray(value.topics) || !Array.isArray(value.unavailable)) throw new Error("Invalid topic catalog: expected topics and unavailable arrays");
  const ids = new Set(), threads = new Set();
  const add = (id) => {
    if (typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate catalog topic ${JSON.stringify(id)}`);
    ids.add(id);
  };
  for (const data of value.topics) {
    if (data.format !== 'zforum-topic-listing-1' || !Array.isArray(data.topic?.threads) || data.topic.threads.length === 0 || typeof data.release_id !== 'string' || typeof data.visibility_pending !== 'boolean') throw new Error("Invalid topic listing in catalog");
    add(data.topic.id);
    for (const thread of data.topic.threads) {
      if (!Number.isSafeInteger(thread.id) || thread.id <= 0 || threads.has(thread.id) || Object.hasOwn(thread, 'posts')) throw new Error(`Invalid or duplicate listing thread in ${data.topic.id}`);
      threads.add(thread.id);
    }
    const stats = data.stats;
    for (const key of ['threads','posts','participants','joinedRecently','unknownAge']) if (!Number.isSafeInteger(stats?.[key]) || stats[key] < 0) throw new Error(`Invalid listing statistic ${key}`);
    if (!(stats.medianYears === null || Number.isFinite(stats.medianYears)) || !Number.isFinite(Date.parse(stats.lastPostAt))) throw new Error('Invalid listing dates');
    if (typeof data.topic.card?.title !== 'string' || typeof data.topic.card.byline !== 'string' || !Array.isArray(data.topic.card.keywords) || !Array.isArray(data.topic.card.interests)) throw new Error('Invalid listing card');
  }
  value.unavailable.forEach(add);
  return value;
}

export function parseTopicContent(data, id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id) || data?.format !== SITE_DATA_FORMAT || data.topic?.id !== id || !Array.isArray(data.topic.threads) || data.topic.threads.length === 0) throw new Error('Invalid topic content');
  const keys = new Set();
  for (const thread of data.topic.threads) {
    if (!Number.isSafeInteger(thread.id) || thread.id <= 0 || !Array.isArray(thread.posts)) throw new Error(`Invalid thread in ${id}`);
    for (const post of thread.posts) {
      if (!Number.isSafeInteger(post.number) || post.number <= 0 || post.key !== `${thread.id}/${post.number}` || keys.has(post.key)) throw new Error(`Invalid or duplicate topic post ${post.key}`);
      keys.add(post.key);
    }
  }
  return data;
}

function listingRoute(hash, topic) {
  if (hash === `#/topic/${topic.id}`) return {kind:'topic',post:null};
  const prefix = `#/topic/${topic.id}/post/`;
  if (hash.startsWith(prefix)) {
    const key = hash.slice(prefix.length);
    if (/^[1-9][0-9]*\/[1-9][0-9]*$/.test(key) && topic.threads.some(thread => String(thread.id) === key.split('/')[0])) return {kind:'topic',post:key};
  }
  return {kind:'missing'};
}

export function catalogRoute(hash, catalog) {
  if (hash === "" || hash === "#/") return { kind: "home" };
  for (const kind of ["topics", "how-to-use", "profile", "saved"]) if (hash === `#/${kind}`) return { kind };
  for (const data of catalog.topics) {
    const route = listingRoute(hash, data.topic);
    if (route.kind === "topic") return { ...route, data };
  }
  // A default thread-topic link remains valid after that thread is explicitly grouped.
  const oldThread = /^#\/topic\/thread-([1-9][0-9]*)(\/post\/([1-9][0-9]*)\/[1-9][0-9]*)?$/.exec(hash);
  if (oldThread && (!oldThread[3] || oldThread[3] === oldThread[1])) {
    const data = catalog.topics.find(data => data.topic.threads.some(thread => String(thread.id) === oldThread[1]));
    if (data) {
      const route = listingRoute(`#/topic/${data.topic.id}${oldThread[2] ?? ""}`, data.topic);
      if (route.kind === "topic") return { ...route, data };
    }
  }
  if (catalog.unavailable.some((id) => hash === `#/topic/${id}` || hash.startsWith(`#/topic/${id}/post/`))) return { kind: "unavailable" };
  return { kind: "missing" };
}

export function catalogRevision(catalog) {
  return JSON.stringify([catalog.topics.map((data) => [data.topic.id, data.release_id,data.visibility_pending===true]), catalog.unavailable]);
}
