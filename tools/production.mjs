import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { backupCredentials } from "./backup.mjs";
import { runProcess } from "./lib/process.mjs";
import { inspectDatabase } from "./lib/database-backup.mjs";

process.umask(0o077);
const origin = new URL(process.env.ZFORUM_ORIGIN);
if (origin.protocol !== "https:" || origin.hostname !== process.env.ZFORUM_RP_ID || origin.port || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("Production requires an HTTPS origin matching ZFORUM_RP_ID");
const bootstrap = process.env.ZFORUM_BOOTSTRAP;
if (!["0","1"].includes(bootstrap)) throw new Error("ZFORUM_BOOTSTRAP must be 0 or 1");

if (bootstrap === "1") {
  const server = createServer((request,response)=>{
    response.writeHead(request.url === "/healthz" ? 200 : 503,{"Content-Type":"application/json","Cache-Control":"no-store"});
    response.end('{"status":"maintenance","reason":"Initial database transfer; public service is not enabled"}\n');
  });
  server.listen(8080,"0.0.0.0");
  process.on("SIGINT",()=>server.close());
  process.on("SIGTERM",()=>server.close());
} else {
  if (!existsSync("/data/zforum.sqlite")) throw new Error("Missing production database; seed the reviewed backup in bootstrap mode first");
  inspectDatabase("/data/zforum.sqlite");
  backupCredentials(process.env);
  const backup = () => runProcess("flock",["-w","60","/data/work/import.lock","node","tools/backup.mjs"],{timeoutSeconds:1000});
  // Back up before the server opens/migrates SQLite; this also checks off-volume access.
  console.log(`Startup backup: ${(await backup()).stdout.trim()}`);
  const child = spawn("server/target/release/zforum-server",["serve","--host","0.0.0.0","--proxy","fly","--port","8080","--site","site","--db","/data/zforum.sqlite","--origin",origin.origin,"--rp-id",process.env.ZFORUM_RP_ID,"--webauthn","server/webauthn/target/release/zforum-webauthn"],
    {stdio:"inherit",env:{PATH:process.env.PATH,LANG:"C.UTF-8"}});
  let backingUp = false;
  const timer = setInterval(async()=>{
    if (backingUp) return;
    backingUp = true;
    try { console.log(`Scheduled backup: ${(await backup()).stdout.trim()}`); }
    catch (error) { console.error(`BACKUP FAILED: ${error.message}`); }
    finally { backingUp = false; }
  },3600000);
  for (const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>{clearInterval(timer);child.kill("SIGINT");});
  child.on("error",error=>{clearInterval(timer);console.error(error);process.exitCode=1;});
  child.on("exit",(code,signal)=>{clearInterval(timer);process.exitCode=code ?? (signal === "SIGINT" ? 0 : 1);});
}
