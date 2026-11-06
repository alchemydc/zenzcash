// Runs against disposable SQLite, including a real verifier call and process restart.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { runProcess } from "./lib/process.mjs";

const directory = mkdtempSync(join(tmpdir(),"zforum-runtime-"));
const dbPath = join(directory,"zforum.sqlite"), binary = "server/target/release/zforum-server";
try {
  await runProcess(binary,["report","--db",dbPath]);
  const db = new DatabaseSync(dbPath);
  db.exec("INSERT INTO accounts(id,label,appearance) VALUES('smoke-reader','Preserved reader','cat'); INSERT INTO reading(account,post,bookmarked,read) VALUES('smoke-reader','7/1',1,1);");
  db.close();
  for (const verifier of ["server/webauthn/target/release/zforum-webauthn","server/webauthn/target/release/zforum-webauthn","missing-verifier"]) {
    const socket = createServer();socket.listen(0,"0.0.0.0");await once(socket,"listening");
    const port = socket.address().port;await new Promise(resolve=>socket.close(resolve));
    const child = spawn(binary,["serve","--host","0.0.0.0","--proxy","fly","--port",String(port),"--site","site","--db",dbPath,"--origin","https://zenzcash.com","--rp-id","zenzcash.com","--webauthn",verifier],{stdio:["ignore","pipe","pipe"]});
    let log="";child.stdout.on("data",part=>{log+=part;});child.stderr.on("data",part=>{log+=part;});
    const stopped = once(child,"exit");
    try {
      const url = `http://127.0.0.1:${port}`;
      let response;
      for (let attempt=0;attempt<100;attempt++) {
        if (child.exitCode !== null) throw new Error(`Runtime exited: ${log}`);
        try { response = await fetch(`${url}/healthz`,{signal:AbortSignal.timeout(1000)});break; }
        catch (error) { if (attempt===99) throw error;await delay(50); }
      }
      assert.equal(response.status,verifier === "missing-verifier" ? 503 : 200);
      if (verifier === "missing-verifier") continue;
      assert.deepEqual(await response.json(),{status:"ok"});
      const entry=await fetch(url);
      assert.equal(entry.status,200);
      assert.equal(entry.headers.get('cache-control'),'no-store');
      const html=await entry.text();
      assert.equal(html,readFileSync('site/runtime/index.html','utf8'));
      const module=html.match(/src="(\/assets\/[a-f0-9]{64}\/js\/app\.js)"/);
      assert.notEqual(module,null);
      for(const path of [module[1],module[1].replace('/app.js','/catalog.js')]){
        const asset=await fetch(`${url}${path}`);
        assert.equal(asset.status,200);
        assert.equal(asset.headers.get('cache-control'),'public, max-age=31536000, immutable');
        assert.equal(await asset.text(),readFileSync(`site/runtime${path}`,'utf8'));
      }
      const me = await (await fetch(`${url}/api/me`)).json();
      assert.equal(me.auth_available,true);assert.equal(me.auth_origin,"https://zenzcash.com");
      for (const path of ["/data/zforum.sqlite","/data/reading-contract.json","/work/zforum.sqlite"]) assert.equal((await fetch(`${url}${path}`)).status,404);
      const auth = await fetch(`${url}/api/auth/start`,{method:"POST",headers:{origin:"https://zenzcash.com","x-zforum-request":"1","content-type":"application/json","fly-client-ip":"192.0.2.1"},body:'{"mode":"register","code":null}'});
      assert.equal(auth.status,200,await auth.clone().text());
      const challenge = await auth.json();
      assert.equal(challenge.publicKey.rp.id,"zenzcash.com");
      assert.equal(challenge.publicKey.rp.name,"Zenzcash");
      assert.match(auth.headers.get("set-cookie"),/Secure/);
      const wrongOrigin = await fetch(`${url}/api/auth/start`,{method:"POST",headers:{origin:"https://zencash.fly.dev","x-zforum-request":"1","content-type":"application/json","fly-client-ip":"192.0.2.1"},body:'{"mode":"register","code":null}'});
      assert.equal(wrongOrigin.status,403);
      const check = new DatabaseSync(dbPath,{readOnly:true});
      try {
        assert.equal(check.prepare("SELECT label FROM accounts WHERE id='smoke-reader'").get().label,"Preserved reader");
        assert.deepEqual({...check.prepare("SELECT bookmarked,read FROM reading").get()},{bookmarked:1,read:1});
      } finally { check.close(); }
    } finally {
      child.kill("SIGINT");
      const timeout = setTimeout(()=>child.kill("SIGKILL"),5000);
      try { const [code] = await stopped;assert.equal(code,0,log); } finally { clearTimeout(timeout); }
    }
  }
  console.log("Runtime smoke passed: HTTP, health, HTTPS passkey challenge, private paths, durable restart and missing-verifier rejection.");
} finally { rmSync(directory,{recursive:true,force:true}); }
