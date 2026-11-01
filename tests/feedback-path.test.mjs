import assert from "node:assert/strict";
import test from "node:test";
import { feedbackPath } from "../tools/lib/feedback-path.mjs";
import { SITE_DATA_FORMAT } from "../site/js/vocab.js";
import { WORK_DIR } from "../tools/lib/config.mjs";
import { join } from "node:path";

test("feedback paths use validated corpus hashes and cannot escape the work directory", () => {
  const version = "a0".repeat(32);
  assert.equal(feedbackPath({ format: SITE_DATA_FORMAT, feedback_version: version }), join(WORK_DIR, `feedback-${version}.json`));
  for (const value of [null, "../old", "/tmp/old", "", version.toUpperCase(), version + "a", version + "\n", version.slice(1), 12]) {
    const data = { format: SITE_DATA_FORMAT, feedback_version: value };
    assert.throws(() => feedbackPath(data), { message: `cannot choose feedback file: expected ${SITE_DATA_FORMAT} and a 64-character lowercase hex feedback_version, got ${JSON.stringify(data)}` });
  }
});
