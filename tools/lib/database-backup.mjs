import { DatabaseSync, backup } from "node:sqlite";
import { closeSync, existsSync, fsyncSync, openSync, rmSync, statSync } from "node:fs";

export function inspectDatabase(path) {
  if (!statSync(path).isFile()) throw new Error(`Database is not a regular file: ${path}`);
  const db = new DatabaseSync(path,{readOnly:true});
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error(`Database integrity failed: ${path}`);
    if (db.prepare("PRAGMA foreign_key_check").all().length !== 0) throw new Error(`Database foreign keys failed: ${path}`);
    return {schema:db.prepare("PRAGMA user_version").get().user_version,
      topics:db.prepare("SELECT count(*) AS count FROM published").get().count,
      posts:db.prepare("SELECT count(*) AS count FROM current_posts").get().count,
      accounts:db.prepare("SELECT count(*) AS count FROM accounts").get().count};
  } finally { db.close(); }
}

export async function consistentBackup(source, destination) {
  if (existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`);
  const sourceDb = new DatabaseSync(source,{readOnly:true});
  const fd = openSync(destination,"wx",0o600);
  closeSync(fd);
  try {
    await backup(sourceDb,destination);
    const info = inspectDatabase(destination);
    const output = openSync(destination,"r");
    try { fsyncSync(output); } finally { closeSync(output); }
    return info;
  } catch (error) {
    rmSync(destination,{force:true});
    throw error;
  } finally { sourceDb.close(); }
}
