// File writes are atomic: write a temporary file beside the target, fsync it, rename it over
// the target. A crash leaves the old file or the new one, never half of either.

import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseStrictJson } from "./strict-json.mjs";

export function writeFileAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`);
  const descriptor = openSync(temporary, "w", 0o644);
  try {
    writeSync(descriptor, text);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, path);
}

export const writeJsonAtomic = (path, value) => writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);

export const readJsonStrict = (path) => parseStrictJson(readFileSync(path, "utf8"), path);
