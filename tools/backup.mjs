import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { consistentBackup } from "./lib/database-backup.mjs";
import { runProcess } from "./lib/process.mjs";
import { sha256File, writeJsonAtomic } from "./lib/fsio.mjs";

export function backupCredentials(env) {
  for (const name of ["AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY"]) {
    if (typeof env[name] !== "string" || !/^[A-Za-z0-9_+/=-]+$/.test(env[name])) throw new Error(`Missing or invalid ${name}`);
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.BUCKET_NAME ?? "")) throw new Error("Missing or invalid BUCKET_NAME");
  if (env.AWS_ENDPOINT_URL_S3 !== "https://fly.storage.tigris.dev") throw new Error("AWS_ENDPOINT_URL_S3 must be https://fly.storage.tigris.dev");
  return {bucket:env.BUCKET_NAME,endpoint:env.AWS_ENDPOINT_URL_S3,
    input:`user = "${env.AWS_ACCESS_KEY_ID}:${env.AWS_SECRET_ACCESS_KEY}"\n`};
}

export async function transferBackup(credentials, key, args, run = runProcess) {
  if (!/^zforum\/[0-9TZ.-]+-[0-9a-f-]+\.tar\.gz$/.test(key)) throw new Error("Invalid backup object key");
  return run("curl",["--disable","--fail","--silent","--show-error","--proto","=https","--connect-timeout","15","--max-time","600","--retry","2","--aws-sigv4","aws:amz:auto:s3","--config","-",...args,`${credentials.endpoint}/${credentials.bucket}/${key}`],
    {input:credentials.input,timeoutSeconds:900,env:{PATH:process.env.PATH,LANG:"C.UTF-8"}});
}

export async function backupToTigris({data="/data",env=process.env,run=runProcess}) {
  const credentials = backupCredentials(env);
  const backups = join(data,"backups");
  mkdirSync(backups,{recursive:true,mode:0o700});
  const directory = mkdtempSync(join(backups,"pending-"));
  const key = `zforum/${new Date().toISOString().replaceAll(":","-")}-${randomUUID()}.tar.gz`;
  try {
    const info = await consistentBackup(join(data,"zforum.sqlite"),join(directory,"zforum.sqlite"));
    writeJsonAtomic(join(directory,"manifest.json"),{format:"zforum-backup-1",created_at:new Date().toISOString(),database:info});
    mkdirSync(join(data,"work","imports"),{recursive:true,mode:0o700});
    const archive = join(directory,"backup.tar.gz");
    await run("tar",["-czf",archive,"-C",directory,"zforum.sqlite","manifest.json","-C",join(data,"work"),"imports"],{timeoutSeconds:300});
    // Credentials go through stdin, never process arguments, logs or files.
    await transferBackup(credentials,key,["--upload-file",archive],run);
    const result = {key,sha256:await sha256File(archive),completed_at:new Date().toISOString(),database:info};
    writeJsonAtomic(join(backups,"latest.json"),result);
    return result;
  } finally { rmSync(directory,{recursive:true,force:true}); }
}

if (import.meta.main) {
  process.umask(0o077);
  if (process.argv.length !== 2) throw new Error("Usage: backup.mjs (database and artifacts are under /data)");
  console.log(JSON.stringify(await backupToTigris({})));
}
