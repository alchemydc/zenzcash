// Fetches when each author's forum account was created (D-40), from the public profile
// endpoint, anonymously, at most one request per second, backing off on HTTP 429.
// Resumable: authors already in work/accounts.json are not fetched again.
// Usage: node tools/fetch-accounts.mjs

import { existsSync } from "node:fs";
import { ACCOUNTS_FILE, FORUM_ORIGIN, USER_AGENT } from "./lib/config.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { loadTopic } from "./lib/topic.mjs";

const REQUEST_INTERVAL_MS = 1000;
const MAX_RETRIES = 5;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchCreatedAt(username) {
  const url = `${FORUM_ORIGIN}/u/${encodeURIComponent(username)}.json`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after") ?? "30") * 1000;
      console.log(`429 for ${username}; waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    // A deleted or suspended account has no public profile: recorded as unknown, shown as such.
    if (response.status === 404) return { created_at: null, status: "no public profile" };
    if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
    const body = await response.json();
    // Authors may hide their profile; that choice is respected and shown as unknown.
    if (body?.user?.profile_hidden === true) return { created_at: null, status: "profile hidden" };
    const createdAt = body?.user?.created_at;
    if (typeof createdAt !== "string" || !TIMESTAMP.test(createdAt)) throw new Error(`GET ${url}: user.created_at is ${JSON.stringify(createdAt)}`);
    return { created_at: createdAt, status: "ok" };
  }
  throw new Error(`GET ${url}: still rate-limited after ${MAX_RETRIES} retries`);
}

const usernames = [...new Set(loadTopic().threads.flatMap((thread) => thread.posts.map((post) => post.username)))].sort();
const stored = existsSync(ACCOUNTS_FILE) ? readJsonStrict(ACCOUNTS_FILE) : { accounts: {} };
const accounts = { ...stored.accounts };
for (const username of usernames) {
  if (username in accounts) continue;
  accounts[username] = await fetchCreatedAt(username);
  writeJsonAtomic(ACCOUNTS_FILE, { source: `${FORUM_ORIGIN}/u/<username>.json`, accounts });
  console.log(`${username}: ${accounts[username].created_at ?? accounts[username].status}`);
  await sleep(REQUEST_INTERVAL_MS);
}
console.log(`${Object.keys(accounts).length} accounts recorded in ${ACCOUNTS_FILE}`);
