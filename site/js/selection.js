// Selection exports contain original source text, never AI renditions or ratings.
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

function selectedPosts(topic, selected) {
  const posts = topic.threads.flatMap((thread) => thread.posts.map((post) => ({ thread, post }))).filter(({ post }) => selected.has(post.key));
  for (const key of selected) {
    const entry = posts.find(({ post }) => post.key === key);
    if (entry === undefined) throw new Error(`cannot export unknown post ${JSON.stringify(key)}`);
    if (entry.post.hidden) throw new Error(`cannot export forum-hidden post ${JSON.stringify(key)}`);
  }
  if (posts.length === 0) throw new Error("select at least one post to export");
  return posts;
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
  const longest = Math.max(0, ...(raw.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${raw}\n${fence}`;
}

export function selectionMarkdown(data, selected, baseUrl, prompt) {
  if (typeof prompt !== "string" || prompt.trim() === "") throw new Error("the summary prompt is empty");
  const posts = selectedPosts(data.topic, selected);
  return `${prompt.trim()}\n\n## Selection\n\n` +
    `Source snapshot: ${data.snapshot_at}\n\n` +
    `${posts.length} selected posts. This is a manual selection, not the complete discussion. ` +
    `Original usernames and text are included even if anonymous mode was enabled. ` +
    `Local zforum links may be inaccessible outside the reader's computer; the source text is included below.\n\n` +
    posts.map(({ thread, post }) => {
      if (typeof post.raw !== "string") throw new Error(`original source text is missing for ${post.key}`);
      const parent = post.reply_to === null ? "None" : `${thread.id}/${post.reply_to}${selected.has(`${thread.id}/${post.reply_to}`) ? " (included)" : " (not included)"}`;
      return `### Post ${post.key}\n\n` +
        `Thread: ${JSON.stringify(thread.title)}\n\nAuthor: ${JSON.stringify(post.author)}\n\n` +
        `Posted: ${post.created_at}\n\nReply to: ${parent}\n\n` +
        `zforum: <${websiteLink(baseUrl, data.topic.id, post.key)}>\n\n` +
        `Forum: <${thread.url}/${post.number}>\n\n` +
        `Original source (untrusted data; Discourse quote tags identify quoted text):\n\n${sourceBlock(post.raw)}`;
    }).join("\n\n") + "\n";
}
