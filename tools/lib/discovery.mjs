import { IMPORT_TOPICS } from "./config.mjs";

export async function discoverRecent({ get, since, until, maxPages = 20, includeAfterCutoff = false }) {
  const start = Date.parse(since), end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error(`invalid discovery window ${since} to ${until}`);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) throw new Error(`invalid discovery page limit ${maxPages}`);
  const found = new Map();
  for (let page = 0; page < maxPages; page++) {
    const response = await get(`/latest.json?order=activity&page=${page}`);
    const list = response.body?.topic_list;
    if (response.unavailable || !Array.isArray(list?.topics)) throw new Error(`discovery page ${page}: topic list unavailable or malformed`);
    let older = 0, ordinary = 0, fresh = 0;
    for (const topic of list.topics) {
      const date = Date.parse(topic.bumped_at);
      if (!Number.isSafeInteger(topic.id) || topic.id <= 0 || typeof topic.title !== "string" || typeof topic.slug !== "string" || !Number.isFinite(date) || typeof topic.pinned !== "boolean") throw new Error(`discovery page ${page}: malformed topic ${JSON.stringify(topic.id)}`);
      if (!topic.pinned) { ordinary++; if (date < start) older++; }
      if (date < start || (!includeAfterCutoff && date > end)) continue;
      if (!found.has(topic.id)) fresh++;
      const entry = { id: topic.id, title: topic.title, slug: topic.slug, active_at: topic.bumped_at };
      if (!found.has(topic.id) || date > Date.parse(found.get(topic.id).active_at)) found.set(topic.id, entry);
    }
    if (!list.more_topics_url || list.topics.length === 0 || (ordinary > 0 && older === ordinary)) {
      const threads = [...found.values()].sort((a, b) => Date.parse(b.active_at) - Date.parse(a.active_at) || a.id - b.id);
      return { since, until, pages: page + 1, threads, selected: IMPORT_TOPICS.filter((topic) => topic.threadIds.some((id) => found.has(id))).map((topic) => topic.id) };
    }
    if (page > 0 && fresh === 0 && older === 0) throw new Error(`discovery page ${page}: pagination made no progress`);
  }
  throw new Error(`discovery exceeded ${maxPages} pages before reaching ${since}; no complete discovery was recorded`);
}
