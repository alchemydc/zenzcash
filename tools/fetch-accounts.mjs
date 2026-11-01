// Fetches when each author's forum account was created (D-40), from the public profile
// endpoint, anonymously, at most one request per second, backing off on HTTP 429.
// Resumable: authors already in work/accounts.json are not fetched again.
// Usage: node tools/fetch-accounts.mjs

import { existsSync } from "node:fs";
import { ACCOUNTS_FILE, FORUM_ORIGIN } from "./lib/config.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { loadTopic } from "./lib/topic.mjs";
import { forumClient, accountProfile } from "./lib/forum-client.mjs";

const get = forumClient();

const usernames = [...new Set(loadTopic().threads.flatMap((thread) => thread.posts.map((post) => post.username)))].sort();
const stored = existsSync(ACCOUNTS_FILE) ? readJsonStrict(ACCOUNTS_FILE) : { accounts: {} };
const accounts = { ...stored.accounts };
for (const username of usernames) {
  if (username in accounts) continue;
  accounts[username] = await accountProfile(get, username);
  writeJsonAtomic(ACCOUNTS_FILE, { source: `${FORUM_ORIGIN}/u/<username>.json`, accounts });
  console.log(`${username}: ${accounts[username].created_at ?? accounts[username].status}`);
}
console.log(`${Object.keys(accounts).length} accounts recorded in ${ACCOUNTS_FILE}`);
