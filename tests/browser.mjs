// Bounded integration check using installed Chrome and the compiled Rust server.
// Run: cargo build --manifest-path server/Cargo.toml && node tests/browser.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectionMarkdown } from "../site/js/selection.js";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { IMPORT_TOPICS } from "../tools/lib/config.mjs";
import { runProcess } from "../tools/lib/process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "zforum-browser-"));
const shots = join(root, "work/screenshots");
mkdirSync(shots, { recursive: true });
const profile = join(scratch, "profile");
const downloads = join(scratch, "downloads");
mkdirSync(profile);
mkdirSync(downloads);
const children = [];
const start = (command, args, env = process.env) => {
  const child = spawn(command, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });
  child.on("error", (error) => { log += error.message; });
  return () => log;
};
let socket;
const cleanup = async () => {
  socket?.close();
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGKILL");
  })));
  rmSync(scratch, { recursive: true, force: true });
};
const watchdog = setTimeout(() => { void cleanup().then(() => { console.error("Browser check exceeded 60 seconds"); process.exit(1); }); }, 60000);
const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
const catalogMode = process.argv[2] === "--catalog";
if (catalogMode) {
  const [run,candidate]=process.argv.slice(3);
  if (![run,candidate].every(value=>typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(value))) throw new Error("usage: node tests/browser.mjs --catalog RUN CANDIDATE");
  for (const topic of IMPORT_TOPICS) await runProcess(join(root,"server/target/debug/zforum-server"),["publish","--db",join(scratch,"zforum.sqlite"),"--file",join(root,"work/refresh",`${run}-${topic.id}`,"candidates",candidate,"site.json")]);
}
const serverLog = start(join(root, "server/target/debug/zforum-server"), ["serve", "--site", "site", "--db", join(scratch, "zforum.sqlite"), "--port", "8017", "--origin", "http://localhost:8017", "--rp-id", "localhost", "--webauthn", join(scratch, "unavailable-verifier")]);
try {
  const browserLog = start("google-chrome-stable", ["--headless", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--remote-debugging-port=9237", "about:blank"]);
  for(let attempt=0;attempt<100 && !browserLog().includes("DevTools listening on ws:");attempt++) await delay();
  const endpoint=/DevTools listening on (ws:\/\/[^\s]+)/.exec(browserLog());
  assert.notEqual(endpoint,null,`Chrome did not start: ${browserLog()}\nServer: ${serverLog()}`);
  socket=new WebSocket(endpoint[1]);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const pending=new Map(),errors=[];
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.method==="Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if(message.method==="Runtime.consoleAPICalled" && message.params.type==="error") errors.push(message.params.args.map(arg=>arg.value).join(" "));
    if(pending.has(message.id)){
      const {resolve,reject,timeout}=pending.get(message.id);pending.delete(message.id);clearTimeout(timeout);
      if(message.error)reject(new Error(JSON.stringify(message.error)));else resolve(message.result);
    }
  };
  let id=0,session=null;
  const send=(method,params={},browser=false)=>new Promise((resolve,reject)=>{
    const key=++id;
    const timeout=setTimeout(()=>{pending.delete(key);reject(new Error(`CDP timed out: ${method}`));},10000);
    pending.set(key,{resolve,reject,timeout});
    socket.send(JSON.stringify({id:key,method,params,...(session!==null&&!browser?{sessionId:session}:{})}));
  });
  const {targetId}=await send("Target.createTarget",{url:"about:blank"},true);
  session=(await send("Target.attachToTarget",{targetId,flatten:true},true)).sessionId;
  await send("Runtime.enable");await send("Page.enable");
  await send("Browser.setDownloadBehavior",{behavior:"allow",downloadPath:downloads},true);
  const evaluate=async expression=>{
    const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(expression)) return;
      await delay();
    }
    throw new Error(`Browser condition not reached: ${expression}\nPage: ${await evaluate("document.body.innerText.slice(0,1800)")}\nConsole: ${JSON.stringify(errors)}`);
  };
  const click = (text) => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)}).click()`);
  const capture = async (name) => {
    const result = await send("Page.captureScreenshot", { captureBeyondViewport:false });
    writeFileSync(join(shots, name), Buffer.from(result.data, "base64"));
  };
  await send("Emulation.setDeviceMetricsOverride", { width:1280,height:900,deviceScaleFactor:1,mobile:false });
  await send("Page.navigate", { url:"http://localhost:8017/#/" });
  await waitFor("document.querySelector('.info-page') !== null");
  assert.equal(await evaluate("document.querySelector('#site-nav').textContent"),"HomeTopicsHow to useSign in");
  await capture("batch003-home-desktop.png");
  await evaluate("location.hash = '#/topics'");
  await waitFor("document.querySelectorAll('a.topic-card').length > 0");
  const catalog = await (await fetch("http://localhost:8017/data/topics.json")).json();
  assert.equal(await evaluate("document.querySelectorAll('a.topic-card').length"),catalog.topics.length);
  if (catalogMode) assert.equal(catalog.topics.length,4);
  for (const entry of catalog.topics) {
    await evaluate(`location.hash=${JSON.stringify(`#/topic/${entry.topic.id}`)}`);
    await waitFor(`document.querySelector('.topic-head h1')?.textContent === ${JSON.stringify(entry.topic.headline)}`);
    assert.equal(await evaluate("document.querySelectorAll('.included-threads li').length"),entry.topic.threads.length);
    assert.equal(await evaluate("document.querySelectorAll('.question-card').length"),entry.topic.issues.length);
    assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(node=>node.hidden)"),true);
    const last=entry.topic.threads.flatMap(thread=>thread.posts).filter(post=>!post.hidden).at(-1);
    await evaluate(`location.hash=${JSON.stringify(`#/topic/${entry.topic.id}/post/${last.key}`)}`);
    await waitFor(`document.querySelector(${JSON.stringify(`#post-${last.key.replace('/','-')} .version-original`)}) !== null`);
  }
  const data=catalog.topics.find(data=>data.topic.id==='zcg');
  const available=data.topic.threads.flatMap(thread=>thread.posts).filter(post=>!post.hidden);
  const rewritten=available.find(post=>post.analysis.neutral_rendition!==null);
  const postId=`post-${rewritten.key.replace('/','-')}`;
  const postSelector=`#${postId}`;
  const route=`#/topic/zcg/post/${rewritten.key}`;
  // A synthetic account/session is confined to this temporary test database; no passkey UI is bypassed in the application.
  const db=new DatabaseSync(join(scratch,"zforum.sqlite"));
  const account='11111111-1111-4111-8111-111111111111', token='a'.repeat(64), csrf='b'.repeat(64), now=Math.floor(Date.now()/1000);
  db.prepare("INSERT INTO accounts(id,label,appearance) VALUES(?,?,'cat')").run(account,'Browser test reader');
  db.prepare("INSERT INTO sessions(hash,account,csrf,verified,expires) VALUES(?,?,?,?,?)").run(createHash('sha256').update(token).digest('hex'),account,csrf,now,now+3600);
  db.close();
  await send("Storage.setCookies", { cookies:[{name:"zforum_session",value:token,domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}] },true);
  await send("Page.navigate", { url:"http://localhost:8017/?browser-account=1#/topic/zcg" });
  await waitFor("document.querySelector('.selection-bar') !== null && document.querySelector('#site-nav').textContent.includes('Profile')");
  assert.equal(await evaluate("document.querySelector('#account-panel') === null"),true);
  assert.equal(await evaluate("document.querySelector('.selection-bar').open"),false);
  assert.equal(await evaluate("document.querySelector('.reading-content').firstElementChild.classList.contains('whats-new')"),true);
  assert.equal(await evaluate("document.querySelector('.topic-summary h2').textContent"),"Topic summary");
  assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(n=>n.hidden)"),true);
  const newest=[...available].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.key.localeCompare(a.key,'en',{numeric:true}))[0];
  assert.equal(await evaluate("document.querySelector('.post:not(.hidden-post)').id"),`post-${newest.key.replace('/','-')}`);
  await capture("batch003-topic-desktop.png");
  await evaluate("document.querySelector('#setting-toneBands-bad').click()");
  assert.equal(await evaluate("document.activeElement.id === 'setting-toneBands-bad' || !document.activeElement.id"),true);
  assert.equal(await evaluate("document.querySelectorAll('.compact-post').length > 0"),true);
  await evaluate("document.querySelector('.compact-post button').click()");
  await click("Oldest first");
  await click("By thread");
  assert.equal(await evaluate("document.querySelectorAll('.thread-tab').length"),data.topic.threads.length);
  await click("All threads together");
  await evaluate(`location.hash=${JSON.stringify(route)}`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector+' .version-original')}) !== null`);
  await evaluate("document.querySelector('#setting-anonymous').click()");
  await evaluate(`location.hash='#/topic/zcg'; location.hash=${JSON.stringify(route)}`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector+' .reveal')}) !== null`);
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' .reveal')}).click()`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(postSelector+' .reveal')}).textContent`),"Hide author");
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' .reveal')}).click()`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(postSelector+' .reveal')}).textContent`),"Reveal author");
  const mood = async (label) => {
    await evaluate(`document.querySelector(${JSON.stringify(postSelector+` button[aria-label="Mood: ${label}"]`)}).click()`);
    await waitFor(`document.querySelector(${JSON.stringify(postSelector+` button[aria-label="Mood: ${label}"]`)}).getAttribute('aria-pressed') === 'true'`);
  };
  await mood("made me happy");
  assert.equal(await evaluate("document.querySelector('.companion').classList.contains('companion-happy')"),true);
  assert.equal(await evaluate("document.querySelector('.companion-creature').getAnimations().length"),1);
  await mood("no impact on mood");
  assert.equal(await evaluate("document.querySelector('.companion-creature').getAnimations().length"),0);
  await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  await mood("made me sad");
  assert.equal(await evaluate("document.querySelector('.companion').classList.contains('companion-sad')"),true);
  assert.equal(await evaluate("document.querySelector('.companion-creature').getAnimations().length"),0);
  await send("Emulation.setEmulatedMedia",{features:[]});
  await capture("batch003-sad-pet.png");
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Heart: Helped"]')}).click(); document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Head: Helped"]')}).click()`);
  await waitFor("document.querySelector('.companion-stars').textContent === '★★★★★'");
  assert.equal(await evaluate("document.querySelector('.companion').classList.contains('companion-happy')"),true);
  await send("Page.bringToFront");
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Save post"]')}).focus()`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Save post"] .hover-tip')})).display`),"block");
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Save post"]')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Remove bookmark"]')}) !== null`);
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Mark read"]')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector)}).classList.contains('read-post')`);
  await evaluate(`document.querySelector(${JSON.stringify(postSelector)}).scrollIntoView()`);
  await capture("batch003-post-desktop.png");
  await evaluate("location.hash='#/saved'");
  await waitFor("document.querySelector('.saved-posts') !== null");
  assert.equal(await evaluate("document.querySelector('.saved-posts h1').textContent"),"Saved posts (1)");
  await evaluate("location.hash='#/profile'");
  await waitFor("document.querySelector('.companion-options') !== null");
  assert.equal(await evaluate("document.querySelectorAll('.companion-options button').length"),10);
  await capture("batch003-profile.png");
  await evaluate("location.hash='#/how-to-use'");
  await waitFor("document.querySelector('.info-page h1').textContent === 'How to use zforum'");
  assert.equal(await evaluate("document.querySelector('main').textContent.includes('last 24 hours')"),true);
  await evaluate("location.hash='#/topic/zcg'");
  await waitFor("document.querySelector('.selection-bar') !== null");
  await evaluate("document.querySelector('.selection-bar').open=true");
  await click("24 hours ago");
  await evaluate("[...document.querySelectorAll('.selection-bar button')].find(b=>b.textContent.startsWith('Select posts in this time window')).click()");
  const cutoff=Date.parse(data.snapshot_at)-24*3600000;
  const selected=new Set(available.filter(p=>Date.parse(p.created_at)>cutoff).map(p=>p.key));
  assert.equal(await evaluate("document.querySelector('.selection-bar summary strong').textContent"),`${selected.size} selected`);
  await click("6 hours ago");
  assert.equal(await evaluate("document.querySelector('.selection-bar summary strong').textContent"),`${selected.size} selected`);
  await click("Export selected posts");
  await waitFor("document.querySelector('.selection-bar').textContent.includes('Downloaded zforum-selected-posts.md')");
  let downloaded;
  for(let attempt=0;attempt<60;attempt++){ downloaded=readdirSync(downloads).find(name=>name.endsWith('.md'));if(downloaded)break;await delay(); }
  assert.equal(downloaded,"zforum-selected-posts.md");
  const prompt=readFileSync(join(root,"site/prompt.md"),'utf8');
  assert.equal(readFileSync(join(downloads,downloaded),'utf8'),selectionMarkdown(data,selected,"http://localhost:8017/",prompt));
  await evaluate("document.querySelector('.selection-bar').open=false; document.querySelector('.settings-panel').open=false; window.scrollTo(0,0)");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);
  assert.equal(await evaluate("document.querySelector('.companion').getBoundingClientRect().bottom <= document.querySelector('.site-header').getBoundingClientRect().bottom"),true);
  await capture("batch003-topic-mobile.png");
  await evaluate(`location.hash=${JSON.stringify(route)}`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector+' .version-original')}) !== null`);
  await evaluate(`document.querySelector(${JSON.stringify(postSelector)}).scrollIntoView()`);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);
  await capture("batch003-post-mobile.png");
  assert.deepEqual(errors,[]);
  {
    // Retain native keyboard verification separately from scripted click coverage.
    await evaluate("document.querySelector('.debate-summary').open=true; document.querySelector('.question-card').open=false; document.querySelector('.question-card > summary').focus()");
    await send("Page.bringToFront");
    assert.equal(await evaluate("document.activeElement === document.querySelector('.question-card > summary')"),true);
    await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r",unmodifiedText:"\r"});
    await send("Input.dispatchKeyEvent", {type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
    await waitFor("document.querySelector('.question-card').open");
  }
  console.log(`Browser passed (${catalog.topics.length} topics): home/nav, topic summary, filters, ordering, reveal/hide, authenticated mood/Heart/Head, pet expressions/stars and reduced motion, bookmarks/read, profile, selected-window export byte equality, desktop/mobile layout, focus tooltips, native keyboard activation and no console errors.`);
  await send("Browser.close", {}, true);
} finally {
  clearTimeout(watchdog);
  await cleanup();
}
