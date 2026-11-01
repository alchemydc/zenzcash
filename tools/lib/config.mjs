// Where the design prototype's inputs and outputs live, and what the ZCG topic is (D-39).

import { fileURLToPath } from "node:url";

const root = (relative) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));

export const REPO_ROOT = root("");
export const SNAPSHOT_DIR = root("archive/research-prototype/data/crawls/20261031T215141Z");
export const WORK_DIR = root("work");
export const JOBS_DIR = root("work/jobs");
export const ACCOUNTS_FILE = root("work/accounts.json");
export const PROMPTS_DIR = root("model");
export const RESULTS_DIR = root("model/results");
export const SITE_DATA_FILE = root("site/data/zcg.json");

export const FORUM_ORIGIN = "https://forum.zcashcommunity.com";
export const USER_AGENT = "zforum-design-prototype/0.1 (read-only)";

// In the order the debate unfolded (by thread start).
export const TOPIC = { id: "zcg", threadIds: [58515, 58566, 58571, 58610, 58611, 58656] };
export const IMPORT_TOPICS = [
  { id: "bug-bounties", threadIds: [57058] },
  { id: "zebra-disclosure", threadIds: [58723] },
  { id: "konclave", threadIds: [57218] },
];
export function configuredTopic(id) {
  const topic = [TOPIC, ...IMPORT_TOPICS].find((entry) => entry.id === id);
  if (!topic) throw new Error(`unknown configured topic ${JSON.stringify(id)}`);
  return topic;
}

// A model job covers at most about this many characters of authors' own text, so one
// subagent can restate every post in it.
export const JOB_CHARACTER_BUDGET = 40000;
export const REFRESH_JOB_POST_LIMIT = 8;
