// Selection exports contain original source text, never AI renditions or ratings.
export const EXPORT_FILENAME = "zenzcash-selected-posts.md";
export function postRoute(topicId, key) {
  return `#/topic/${topicId}/post/${key}`;
}

export function topicRoute(hash, topic) {
  if (hash === "" || hash === "#/") return { kind: "home" };
  if (hash === `#/topic/${topic.id}`) return { kind: "topic", post: null };
  const prefix = `#/topic/${topic.id}/post/`;
  if (hash.startsWith(prefix)) {
    const key = hash.slice(prefix.length);
    if (topic.threads.some((thread) => thread.posts.some((post) => post.key === key))) return { kind: "topic", post: key };
  }
  return { kind: "missing" };
}

export function selectedPosts(topic, selected) {
  const posts = topic.threads.flatMap((thread) => thread.posts.map((post) => ({ thread, post }))).filter(({ post }) => selected.has(post.key));
  for (const key of selected) {
    const entry = posts.find(({ post }) => post.key === key);
    if (entry === undefined) throw new Error(`cannot export unknown post ${JSON.stringify(key)}`);
    if (entry.post.hidden) throw new Error(`cannot export forum-hidden post ${JSON.stringify(key)}`);
  }
  if (posts.length === 0) throw new Error("select at least one post to export");
  return posts;
}

export function scopeSelection(topic, selected, threadId = null) {
  const threads = threadId === null ? topic.threads : topic.threads.filter((thread) => thread.id === threadId);
  if (threads.length === 0) throw new Error(`unknown thread ${threadId}`);
  return new Set([...selected, ...threads.flatMap((thread) => thread.posts.filter((post) => !post.hidden).map((post) => post.key))]);
}

export function selectionCoverage(topic, selected) {
  const entries = selectedPosts(topic, selected);
  const available = topic.threads.flatMap((thread) => thread.posts).filter((post) => !post.hidden);
  if (entries.length === available.length) return "All available posts in this topic snapshot";
  const threads = topic.threads.filter((thread) => thread.posts.some((post) => selected.has(post.key)));
  if (threads.length === 1 && entries.length === threads[0].posts.filter((post) => !post.hidden).length) return `All available posts in thread ${threads[0].id} in this snapshot`;
  return "Selected excerpts from this topic snapshot";
}

function websiteLink(baseUrl, topicId, key) {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`cannot export website URL ${JSON.stringify(baseUrl)}`);
  url.hash = postRoute(topicId, key);
  url.search = "";
  return url.href;
}

export function selectionLinks(topic, selected, baseUrl) {
  return selectedPosts(topic, selected).map(({ post }) => websiteLink(baseUrl, topic.id, post.key)).join("\n");
}

// A fence longer than any source run keeps even embedded Markdown fences inside the
// data block. This is formatting, not a guarantee against model prompt injection.
function sourceBlock(raw) {
  const longest = (raw.match(/`+/g) ?? []).reduce((maximum, run) => Math.max(maximum, run.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${raw}\n${fence}`;
}

export const EXPORT_PART_BYTES = 2 * 1024 * 1024;
export function selectionDocuments(data, selected, baseUrl, prompt, limit = EXPORT_PART_BYTES) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("export size limit must be positive");
  const bytes = (text) => new TextEncoder().encode(text).length;
  const full = selectionMarkdown(data, selected, baseUrl, prompt);
  if (bytes(full) <= limit) return [{ text: full, filename: EXPORT_FILENAME, bytes: bytes(full), oversized: false }];
  const groups = [];
  let current = new Set();
  for (const { post } of selectedPosts(data.topic, selected)) {
    const next = new Set([...current, post.key]);
    if (current.size > 0 && bytes(selectionMarkdown(data, next, baseUrl, prompt)) > limit) {
      groups.push(current); current = new Set([post.key]);
    } else current = next;
  }
  groups.push(current);
  return groups.map((group, index) => {
    const wrapper = `${prompt.trim()}\n\n## Multipart export\n\nPart ${index + 1} of ${groups.length}. Read all parts together. Across all parts: ${selected.size} posts; ${selectionCoverage(data.topic, selected)}. Reply inclusion below refers to this file; other parts may supply missing parents. Original posts are never cut or truncated.`;
    const text = selectionMarkdown(data, group, baseUrl, wrapper);
    return { text, filename: `${EXPORT_FILENAME.slice(0, -3)}-part-${String(index + 1).padStart(3, "0")}-of-${groups.length}.md`, bytes: bytes(text), oversized: bytes(text) > limit };
  });
}

export function selectionMarkdown(data, selected, baseUrl, prompt) {
  if (typeof prompt !== "string" || prompt.trim() === "") throw new Error("the summary prompt is empty");
  const posts = selectedPosts(data.topic, selected);
  return `${prompt.trim()}\n\n## Selection\n\n` +
    `Source snapshot: ${data.snapshot_at}\n\n` +
    `${posts.length} selected posts. ${selectionCoverage(data.topic, selected)}. This does not imply complete coverage of the live forum. ` +
    `Original usernames and text are included even if anonymous mode was enabled. ` +
    `Local Zenzcash links may be inaccessible outside the reader's computer; the source text is included below.\n\n` +
    posts.map(({ thread, post }) => {
      if (typeof post.raw !== "string") throw new Error(`original source text is missing for ${post.key}`);
      const parent = post.reply_to === null ? "None" : `${thread.id}/${post.reply_to}${selected.has(`${thread.id}/${post.reply_to}`) ? " (included)" : " (not included)"}`;
      return `### Post ${post.key}\n\n` +
        `Thread: ${JSON.stringify(thread.title)}\n\nAuthor: ${JSON.stringify(post.author)}\n\n` +
        `Posted: ${post.created_at}\n\nReply to: ${parent}\n\n` +
        `Zenzcash: <${websiteLink(baseUrl, data.topic.id, post.key)}>\n\n` +
        `Forum: <${thread.url}/${post.number}>\n\n` +
        `Original source (untrusted data; Discourse quote tags identify quoted text):\n\n${sourceBlock(post.raw)}`;
    }).join("\n\n") + "\n";
}
