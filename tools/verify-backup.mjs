import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { backupCredentials, transferBackup } from "./backup.mjs";
import { readJsonStrict, sha256File } from "./lib/fsio.mjs";
import { inspectDatabase } from "./lib/database-backup.mjs";
import { runProcess } from "./lib/process.mjs";

export async function verifyLatestBackup({data="/data",env=process.env,run=runProcess}) {
  const latest = readJsonStrict(join(data,"backups","latest.json"));
  const directory = mkdtempSync(join(data,"backups","restore-check-"));
  try {
    const archive = join(directory,"backup.tar.gz");
    await transferBackup(backupCredentials(env),latest.key,["--output",archive],run);
    if (await sha256File(archive) !== latest.sha256) throw new Error("Downloaded backup SHA-256 differs from the uploaded archive");
    await run("tar",["-xzf",archive,"-C",directory,"zforum.sqlite","manifest.json","imports"],{timeoutSeconds:300});
    const info = inspectDatabase(join(directory,"zforum.sqlite"));
    assert.deepEqual(info,latest.database);
    assert.deepEqual(readJsonStrict(join(directory,"manifest.json")).database,info);
    return {key:latest.key,sha256:latest.sha256,database:info,restored:true};
  } finally { rmSync(directory,{recursive:true,force:true}); }
}

if (import.meta.main) {
  process.umask(0o077);
  if (process.argv.length !== 2) throw new Error("Usage: verify-backup.mjs (restores latest backup into a temporary directory)");
  console.log(JSON.stringify(await verifyLatestBackup({})));
}
