import { join } from "node:path";
import { SITE_DATA_FILE } from "./lib/config.mjs";
import { writeJsonAtomic } from "./lib/fsio.mjs";
import { INTEREST_IDS } from "../site/js/vocab.js";
import { TONE_BANDS, SUPPORT_BANDS, POST_VERSIONS, ids } from "../site/js/reader-options.js";

export const readingContract = () => ({ toneBands: ids(TONE_BANDS), supportBands: ids(SUPPORT_BANDS), postVersions: ids(POST_VERSIONS), preferredVersion: ["neutral", "original"], threadView: ["all", "thread"], postOrder: ["newest", "oldest"], interests: INTEREST_IDS });

if (import.meta.main) {
  const path = join(SITE_DATA_FILE,"..","reading-contract.json");
  writeJsonAtomic(path,readingContract());
  console.log(`wrote ${path}`);
}
