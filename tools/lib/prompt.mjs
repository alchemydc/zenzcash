import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR, REPO_ROOT } from "./config.mjs";
import { sha256 } from "./jobs.mjs";

export function promptText(task, { initial = false } = {}) {
  if (!["marks", "summary"].includes(task)) throw new Error(`unknown prompt task ${task}`);
  const prompt = readFileSync(join(PROMPTS_DIR, initial ? "initial" : "", `${task}.md`), "utf8");
  return task === "marks" ? `${prompt}\n${readFileSync(join(REPO_ROOT, "site/js/rubric.js"), "utf8")}` : prompt;
}
export function promptHash(task, options) {
  return sha256(promptText(task, options));
}
