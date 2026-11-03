import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR } from "./lib/config.mjs";
import { consistentBackup } from "./lib/database-backup.mjs";
import { sha256File, writeJsonAtomic } from "./lib/fsio.mjs";
import { runProcess } from "./lib/process.mjs";

process.umask(0o077);
if (process.argv.length !== 2) throw new Error("Usage: prepare-fly-seed.mjs (backs up work/zforum.sqlite)");
mkdirSync(join(WORK_DIR,"backups"),{recursive:true,mode:0o700});
const directory = mkdtempSync(join(WORK_DIR,"backups","fly-seed-"));
const path = join(directory,"zforum.sqlite");
const info = await consistentBackup(join(WORK_DIR,"zforum.sqlite"),path);
const manifest = {source:"work/zforum.sqlite",created_at:new Date().toISOString(),sha256:await sha256File(path),database:info};
writeJsonAtomic(join(directory,"manifest.json"),manifest);
await runProcess("tar",["-czf",join(directory,"imports.tar.gz"),"-C",WORK_DIR,"imports"],{timeoutSeconds:300});
console.log(JSON.stringify({directory,...manifest},null,2));
