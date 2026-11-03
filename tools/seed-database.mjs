import { chmodSync, closeSync, existsSync, fsyncSync, linkSync, openSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { consistentBackup } from "./lib/database-backup.mjs";
import { sha256File } from "./lib/fsio.mjs";

export async function seedDatabase(source, destination, expectedHash) {
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) throw new Error("Seed requires the SHA-256 of the reviewed backup");
  if ([destination,`${destination}-wal`,`${destination}-shm`].some(existsSync)) throw new Error(`Refusing to replace existing database: ${destination}`);
  if (await sha256File(source) !== expectedHash) throw new Error("Seed SHA-256 mismatch");
  const temporary = `${destination}.${randomUUID()}.seed`;
  const info = await consistentBackup(source,temporary);
  try {
    if (info.schema !== 5 || info.topics === 0) throw new Error("Seed must contain the existing schema-5 forum database");
    chmodSync(temporary,0o600);
    // Hard-link creation is atomic and cannot overwrite a destination created concurrently.
    linkSync(temporary,destination);
    const fd = openSync(dirname(destination),"r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
  } finally { unlinkSync(temporary); }
  return info;
}

if (import.meta.main) {
  process.umask(0o077);
  const [source,destination,hash,...extra] = process.argv.slice(2);
  if (!source || !destination || !hash || extra.length) throw new Error("Usage: seed-database.mjs SOURCE DESTINATION SHA256");
  console.log(JSON.stringify(await seedDatabase(source,destination,hash)));
}
