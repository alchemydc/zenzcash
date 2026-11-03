import { SITE_DATA_FORMAT } from "./vocab.js";
import { topicRoute } from "./selection.js";

export function parseCatalog(value) {
  if (!value || Object.keys(value).sort().join(",") !== "topics,unavailable" || !Array.isArray(value.topics) || !Array.isArray(value.unavailable)) throw new Error("Invalid topic catalog: expected topics and unavailable arrays");
  const ids = new Set(), posts = new Set();
  const add = (id) => {
    if (typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate catalog topic ${JSON.stringify(id)}`);
    ids.add(id);
  };
  for (const data of value.topics) {
    if (data.format !== SITE_DATA_FORMAT || !Array.isArray(data.topic?.threads) || data.topic.threads.length === 0) throw new Error("Invalid topic data in catalog");
    add(data.topic.id);
    for (const thread of data.topic.threads) {
      if (!Number.isSafeInteger(thread.id) || thread.id <= 0 || !Array.isArray(thread.posts)) throw new Error(`Invalid thread in ${data.topic.id}`);
      for (const post of thread.posts) {
        if (!Number.isSafeInteger(post.number) || post.number <= 0 || post.key !== `${thread.id}/${post.number}` || posts.has(post.key)) throw new Error(`Invalid or duplicate catalog post ${post.key}`);
        posts.add(post.key);
      }
    }
  }
  value.unavailable.forEach(add);
  return value;
}

export function catalogRoute(hash, catalog) {
  if (hash === "" || hash === "#/") return { kind: "home" };
  for (const kind of ["topics", "how-to-use", "profile", "saved"]) if (hash === `#/${kind}`) return { kind };
  for (const data of catalog.topics) {
    const route = topicRoute(hash, data.topic);
    if (route.kind === "topic") return { ...route, data };
  }
  // A default thread-topic link remains valid after that thread is explicitly grouped.
  const oldThread = /^#\/topic\/thread-([1-9][0-9]*)(\/post\/([1-9][0-9]*)\/[1-9][0-9]*)?$/.exec(hash);
  if (oldThread && (!oldThread[3] || oldThread[3] === oldThread[1])) {
    const data = catalog.topics.find(data => data.topic.threads.some(thread => String(thread.id) === oldThread[1]));
    if (data) {
      const route = topicRoute(`#/topic/${data.topic.id}${oldThread[2] ?? ""}`, data.topic);
      if (route.kind === "topic") return { ...route, data };
    }
  }
  if (catalog.unavailable.some((id) => hash === `#/topic/${id}` || hash.startsWith(`#/topic/${id}/post/`))) return { kind: "unavailable" };
  return { kind: "missing" };
}

export function catalogRevision(catalog) {
  return JSON.stringify([catalog.topics.map((data) => [data.topic.id, data.release_id,data.visibility_pending===true]), catalog.unavailable]);
}
