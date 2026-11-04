import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function canonicalPath(path) {
  try {
    lstatSync(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(canonicalPath(parent), basename(path));
  }
  const canonical = realpathSync(path), info = statSync(canonical);
  if (info.isFile() && info.nlink !== 1) throw new Error(`Preparation refuses hard-linked file: ${path}`);
  return canonical;
}

// Preparation has no production mode or override; publication is a separate operation.
export function assertLocalPreparation(...paths) {
  if (process.env.FLY_APP_NAME || process.env.NODE_ENV === "production" || process.env.ZFORUM_ORIGIN) {
    throw new Error("Preparation is forbidden in the production runtime; use a separate local database backup");
  }
  for (const path of paths) {
    const rejectProduction = target => {
      if (["/data", "/app"].some(root => target === root || target.startsWith(`${root}/`))) {
        throw new Error(`Preparation refuses production storage: ${path}`);
      }
    };
    rejectProduction(resolve(path));
    rejectProduction(canonicalPath(resolve(path)));
  }
}
