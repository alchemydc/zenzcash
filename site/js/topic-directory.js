import { INTEREST_IDS } from "./vocab.js";
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const topicId = (id) => typeof id === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(id);
export function parseCuration(value) {
  const fail = () => { throw new Error(`Invalid topic curation: ${JSON.stringify(value)}`); };
  if (!plain(value) || Object.keys(value).sort().join(",") !== "featured,interests") fail();
  if (!Array.isArray(value.featured) || value.featured.length > 3 || !value.featured.every(topicId) || new Set(value.featured).size !== value.featured.length) fail();
  if (!plain(value.interests)) fail();
  for (const [id, tags] of Object.entries(value.interests)) {
    if (!topicId(id) || !Array.isArray(tags) || tags.length < 1 || tags.length > 2 || new Set(tags).size !== tags.length || !tags.every((tag) => INTEREST_IDS.includes(tag))) fail();
  }
  return value;
}
export const directoryInterests = (data, curation) => Object.hasOwn(curation.interests, data.topic.id) ? curation.interests[data.topic.id] : data.topic.card.interests;
export function topicDirectory(catalog, curation, interests, { query, sort }) {
  if (!["recent", "posts"].includes(sort) || typeof query !== "string") throw new Error(`Invalid topic directory controls ${JSON.stringify({ query, sort })}`);
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = catalog.topics.filter((data) => (interests.length === 0 || directoryInterests(data, curation).some((tag) => interests.includes(tag))) && words.every((word) => data.topic.card.title.toLocaleLowerCase().includes(word)));
  const featured = curation.featured.flatMap((id) => matches.filter((data) => data.topic.id === id));
  const others = matches.filter((data) => !curation.featured.includes(data.topic.id)).sort((a, b) => {
    const left = a.stats, right = b.stats;
    const order = sort === "recent" ? Date.parse(right.lastPostAt) - Date.parse(left.lastPostAt) : right.posts - left.posts;
    return order || a.topic.id.localeCompare(b.topic.id, "en");
  });
  return { featured, others, count: matches.length };
}
