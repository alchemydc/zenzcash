import { join } from "node:path";
import { SITE_DATA_FILE, WORK_DIR } from "./config.mjs";
import { readJsonStrict } from "./fsio.mjs";
import { SITE_DATA_FORMAT } from "../../site/js/vocab.js";

export function feedbackPath(data) {
  if (data?.format !== SITE_DATA_FORMAT || typeof data.feedback_version !== "string" || data.feedback_version.length !== 64 || !/^[a-f0-9]{64}$/.test(data.feedback_version)) {
    throw new Error(`cannot choose feedback file: expected ${SITE_DATA_FORMAT} and a 64-character lowercase hex feedback_version, got ${JSON.stringify({ format: data?.format, feedback_version: data?.feedback_version })}`);
  }
  return join(WORK_DIR, `feedback-${data.feedback_version}.json`);
}
export const currentFeedbackPath = () => feedbackPath(readJsonStrict(SITE_DATA_FILE));
if (import.meta.main) console.log(currentFeedbackPath());
