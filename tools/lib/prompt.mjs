import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR, REPO_ROOT } from "./config.mjs";
import { sha256 } from "./jobs.mjs";

export function promptHash(task) {
  const prompt = readFileSync(join(PROMPTS_DIR, `${task}.md`), "utf8");
  return sha256(task === "marks" ? `${prompt}\n${readFileSync(join(REPO_ROOT, "site/js/rubric.js"), "utf8")}` : prompt);
}
