// Usage: node tools/curate-topics.mjs feature zcg [second-topic] [third-topic]
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { REPO_ROOT, configuredTopic } from "./lib/config.mjs";
import { parseCuration } from "../site/js/topic-directory.js";
import { join } from "node:path";
const [command, ...featured] = process.argv.slice(2);
if (command !== "feature") throw new Error(`Expected: feature [up to three topic ids]; received ${JSON.stringify(command)}`);
const path = join(REPO_ROOT, "site/topic-curation.json");
const current = parseCuration(readJsonStrict(path));
const next = parseCuration({ ...current, featured });
for (const id of featured) configuredTopic(id);
writeJsonAtomic(path, next);
console.log(`Featured topics: ${featured.length ? featured.join(", ") : "none"}. Refresh the Topics page to review; commit the configuration when ready.`);
