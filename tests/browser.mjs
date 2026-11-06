// Bounded integration check using installed Chrome and the compiled Rust server.
// Run: cargo build --manifest-path server/Cargo.toml && node tests/browser.mjs
import assert from "node:assert/strict";
import { checkPasskeys } from "./passkey-browser.mjs";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectionMarkdown } from "../site/js/selection.js";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { IMPORT_TOPICS } from "../tools/lib/config.mjs";
import { runProcess } from "../tools/lib/process.mjs";
import { topicStats } from '../site/js/logic.js';
import { scanReview,acknowledgeReview,authorizePublication } from '../tools/lib/content-review.mjs';
import { fileReviewInput } from '../tools/review-publication.mjs';
import { corpusData } from './corpus-fixture.mjs';
import { checkCachedDeployment } from './cached-deployment.mjs';

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
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
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
    try { process.kill(-child.pid,"SIGKILL"); }
    catch(error) { if(error.code!=="ESRCH") throw error; }
  })));
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
};
const watchdog = setTimeout(() => { void cleanup().then(() => { console.error("Browser check exceeded 60 seconds"); process.exit(1); }); }, 60000);
const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
const passkeyMode = process.argv[2] === "--passkeys";
const catalogMode = process.argv[2] === "--catalog";
// Test fixtures are explicit; normal server startup must keep an empty DB empty.
async function publishFixture(file) {
  const directory=join(scratch,'fixture-review'),input=fileReviewInput(file),scan=scanReview(directory,input);
  if(scan.finding_count)acknowledgeReview(directory,input,{candidate_digest:scan.candidate_digest,report_digest:scan.report_digest,operator:'browser test fixture',reason:'Only seeds the disposable browser-test database'});
  authorizePublication(directory,input,file);
  await runProcess(join(root,'server/target/debug/zforum-server'),['publish','--db',join(scratch,'zforum.sqlite'),'--file',file,'--review',directory]);
}
const fixtureFile=join(scratch,'zcg.json');
writeFileSync(fixtureFile,JSON.stringify(corpusData()));
await publishFixture(fixtureFile);
if (catalogMode) {
  const [run,candidate]=process.argv.slice(3);
  if (![run,candidate].every(value=>typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(value))) throw new Error("usage: node tests/browser.mjs --catalog RUN CANDIDATE");
  for (const topic of IMPORT_TOPICS) await publishFixture(join(root,"work/refresh",`${run}-${topic.id}`,"candidates",candidate,"site.json"));
}
const serverLog = start(join(root, "server/target/debug/zforum-server"), ["serve", "--site", "site", "--db", join(scratch, "zforum.sqlite"), "--port", "8017", "--origin", "http://localhost:8017", "--rp-id", "localhost", "--webauthn", passkeyMode ? join(root, "server/webauthn/target/release/zforum-webauthn") : join(scratch, "unavailable-verifier")]);
try {
  const browserLog = start("google-chrome-stable", ["--headless", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--remote-debugging-port=9237", "about:blank"]);
  for(let attempt=0;attempt<100 && !browserLog().includes("DevTools listening on ws:");attempt++) await delay();
  const endpoint=/DevTools listening on (ws:\/\/[^\s]+)/.exec(browserLog());
  assert.notEqual(endpoint,null,`Chrome did not start: ${browserLog()}\nServer: ${serverLog()}`);
  socket=new WebSocket(endpoint[1]);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const pending=new Map(),errors=[],contentRequests=[];
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Network.requestWillBeSent' && message.params.request.url.includes('/data/')) contentRequests.push(new URL(message.params.request.url).pathname);
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
  await send("Runtime.enable");await send("Page.enable");await send('Network.enable');
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
  if (passkeyMode) {
    await checkPasskeys({send, evaluate, waitFor, click, capture, downloads});
    assert.deepEqual(errors, []);
  } else {
  await checkCachedDeployment({send,evaluate,waitFor,capture});
  contentRequests.length=0;
  await send("Page.navigate", { url:"http://localhost:8017/#/" });
  await waitFor("document.querySelector('.info-page') !== null");
  assert.equal(await evaluate("document.querySelector('#site-nav').textContent"),"HomeTopicsHow to useSign in");
  assert.equal(await evaluate("document.title"),"Zenzcash: A Calm, Personalized Zcash Community Forum");
  assert.equal(await evaluate("document.querySelector('.brand').textContent"),"Zenzcash");
  for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]'])assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).content`),"Zenzcash: A Calm, Personalized Zcash Community Forum");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.alpha-notice a')].map(a=>a.href)"),['https://forum.zcashcommunity.com/new-message?username=sudo_ml','https://forum.zcashcommunity.com/new-message?username=earthrise']);
  await capture('zenzcash-alpha-home.png');
  for (const system of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: system }] });
    await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(system)}`);
    assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), system === "dark" ? "rgb(23, 25, 28)" : "rgb(246, 245, 241)");
  }
  for (const theme of ["light", "dark"]) {
    await evaluate("document.querySelector('#theme-toggle').focus()");
    await send("Page.bringToFront");
    await send("Input.dispatchKeyEvent", { type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13, text:"\r" });
    await send("Input.dispatchKeyEvent", { type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13 });
    await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`);
    assert.equal(await evaluate("document.activeElement.id"), "theme-toggle");
    assert.equal(await evaluate("localStorage.getItem('zforum.theme.v1')"), theme);
    assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), theme === "dark" ? "rgb(23, 25, 28)" : "rgb(246, 245, 241)");
    await capture(`theme-${theme}-desktop.png`);
    await send("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    assert.equal(await evaluate("(()=>{const r=document.querySelector('#theme-toggle').getBoundingClientRect();return r.width===44 && r.height===44 && r.left>=0 && r.right<=innerWidth && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest('#theme-toggle')!==null})()"), true);
    await capture(`theme-${theme}-mobile.png`);
    await send("Emulation.setDeviceMetricsOverride", {width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await send("Page.reload");
    await waitFor("document.querySelector('.info-page') !== null");
    assert.equal(await evaluate("document.documentElement.dataset.theme"), theme);
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark");
  await evaluate("document.querySelector('#theme-toggle').click()");
  await capture("batch004-home-desktop.png");
  await evaluate("location.hash = '#/topics'");
  await waitFor("document.querySelectorAll('a.topic-card').length > 0");
  await evaluate("window.scrollTo(0,300); document.querySelector('#theme-toggle').focus({preventScroll:true})");
  const themeScroll = await evaluate("({x:scrollX,y:scrollY})");
  await evaluate("document.querySelector('#theme-toggle').click()");
  assert.deepEqual(await evaluate("({x:scrollX,y:scrollY})"), themeScroll);
  assert.equal(await evaluate("document.activeElement.id"), "theme-toggle");
  await evaluate("document.querySelector('#theme-toggle').click(); window.scrollTo(0,0)");
  const catalog = await (await fetch("http://localhost:8017/data/topics.json")).json();
  assert.equal(catalog.topics.every(data=>data.topic.threads.every(thread=>!Object.hasOwn(thread,'posts'))),true);
  const fullTopics = await Promise.all(catalog.topics.map(async data=>(await fetch(`http://localhost:8017/data/${data.topic.id}.json`)).json()));
  assert.deepEqual([...new Set(contentRequests)],['/data/topics.json']);
  for(const data of fullTopics) assert.deepEqual(catalog.topics.find(item=>item.topic.id===data.topic.id).stats,topicStats(data.topic,data.snapshot_at));
  assert.equal(await evaluate("document.querySelectorAll('a.topic-card').length"),catalog.topics.length);
  if (catalogMode) assert.equal(catalog.topics.length,4);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.featured-topics .topic-card')].map(a=>a.getAttribute('href'))"),['#/topic/zcg']);
  await capture("batch004-topics-desktop.png");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);
  await capture("batch004-topics-mobile.png");
  await send("Emulation.setDeviceMetricsOverride", { width:1280,height:900,deviceScaleFactor:1,mobile:false });
  await click("Governance");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.topic-card')].map(a=>a.getAttribute('href'))"),['#/topic/zcg']);
  await click("Everything");
  const search=async value=>evaluate(`(()=>{ const input=document.querySelector('#topic-search'); input.focus(); input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await search("ZCG");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.topic-card')].map(a=>a.getAttribute('href'))"),['#/topic/zcg']);
  assert.equal(await evaluate("document.activeElement.id"),"topic-search");
  await search("zzzz-no-title-match");
  assert.equal(await evaluate("document.querySelectorAll('.topic-card').length"),0);
  await search("");
  if(catalogMode) {
    await evaluate("document.querySelector('#topic-sort').value='posts'; document.querySelector('#topic-sort').dispatchEvent(new Event('change'))");
    const sorted=catalog.topics.filter(d=>d.topic.id!=='zcg').sort((a,b)=>b.stats.posts-a.stats.posts||a.topic.id.localeCompare(b.topic.id,'en')).map(d=>`#/topic/${d.topic.id}`);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.topic-card')].map(a=>a.getAttribute('href'))"),['#/topic/zcg',...sorted]);
  }
  // Use a short desktop viewport as well as mobile so even the single-topic fixture
  // has real directory scrolling. Catalog mode additionally covers multiple cards.
  for (const [width,height] of [[1280,600],[390,844]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
    for (const returnVia of ["all-topics","header","history"]) {
      await evaluate("document.querySelectorAll('.topic-card')[document.querySelectorAll('.topic-card').length-1].scrollIntoView({block:'center'})");
      const before = await evaluate("(()=>{const card=[...document.querySelectorAll('.topic-card')].at(-1);card.focus({preventScroll:true});return {y:scrollY,top:card.getBoundingClientRect().top,id:card.id,sort:document.querySelector('#topic-sort').value,query:document.querySelector('#topic-search').value};})()");
      assert.ok(before.y>0,`Directory fixture must scroll at ${width}px`);
      await evaluate(`document.getElementById(${JSON.stringify(before.id)}).click()`);
      await waitFor("document.querySelector('.topic-head') !== null");
      assert.equal(await evaluate("scrollY"),0,"Topic entry starts at the top");
      await evaluate("window.scrollTo(0,500)");
      await evaluate(returnVia === "all-topics" ? "document.querySelector('.back a').click()" : returnVia === "header" ? "document.querySelector('#site-nav a[href=\"#/topics\"]').click()" : "history.back()");
      await waitFor("document.querySelector('.topic-card') !== null");
      await delay();
      assert.deepEqual(await evaluate(`({y:scrollY,top:document.getElementById(${JSON.stringify(before.id)}).getBoundingClientRect().top,id:document.activeElement.id,sort:document.querySelector('#topic-sort').value,query:document.querySelector('#topic-search').value})`),before,`${returnVia} restores card position, focus and directory settings at ${width}px`);
    }
    await capture(`batch006-directory-${width}.png`);
  }
  await send("Emulation.setDeviceMetricsOverride", { width:1280,height:900,deviceScaleFactor:1,mobile:false });
  for (const entry of fullTopics) {
    await evaluate(`location.hash=${JSON.stringify(`#/topic/${entry.topic.id}`)}`);
    await waitFor(`document.querySelector('.topic-head h1')?.textContent === ${JSON.stringify(entry.topic.headline)}`);
    assert.equal(await evaluate("document.querySelectorAll('.included-threads li').length"),entry.topic.threads.length);
    assert.equal(await evaluate("document.querySelectorAll('.question-card').length"),entry.topic.issues.length);
    assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(node=>node.hidden)"),true);
    const last=entry.topic.threads.flatMap(thread=>thread.posts).filter(post=>!post.hidden).at(-1);
    await evaluate(`location.hash=${JSON.stringify(`#/topic/${entry.topic.id}/post/${last.key}`)}`);
    await waitFor(`document.querySelector(${JSON.stringify(`#post-${last.key.replace('/','-')} .version-original`)}) !== null`);
  }
  const data=fullTopics.find(data=>data.topic.id==='zcg');
  const available=data.topic.threads.flatMap(thread=>thread.posts).filter(post=>!post.hidden);
  const rewritten=available.find(post=>post.analysis.neutral_rendition!==null);
  const postId=`post-${rewritten.key.replace('/','-')}`;
  const postSelector=`#${postId}`;
  const route=`#/topic/zcg/post/${rewritten.key}`;
  await evaluate("location.hash='#/topic/zcg'");
  await waitFor("document.querySelector('#setting-includeHiddenAge') !== null");
  assert.equal(await evaluate("document.querySelector('#setting-includeHiddenAge').checked"),false);
  assert.equal(await evaluate("document.querySelector('.highlight-settings').tagName"),"FIELDSET");
  assert.match(await evaluate("document.querySelector('.guest-actions-note').textContent"),/require sign-in/);
  await evaluate("document.querySelector('#setting-includeHiddenAge').click()");
  assert.equal(await evaluate("document.querySelector('#setting-includeHiddenAge').checked"),true);
  await evaluate("document.querySelector('[aria-label=\"Save post · sign-in required\"]').click()");
  await waitFor("document.querySelector('#account-panel') !== null");
  assert.match(await evaluate("document.querySelector('#account-panel').textContent"),/Sign in to save posts/);
  await capture("reading-guest-signin.png");
  await evaluate("document.querySelector('#account-panel a').click()");
  await waitFor("document.querySelector('.highlight-settings') !== null");
  await evaluate("document.querySelector('.companion').click()");
  await waitFor("document.querySelector('#account-panel') !== null");
  assert.match(await evaluate("document.querySelector('#account-panel').textContent"),/Sign in to choose your Zamagotchi/);
  await evaluate("document.querySelector('#account-panel a').click()");
  await waitFor("document.querySelector('.highlight-settings') !== null");
  for(const [width,height] of [[1280,900],[390,844]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate("document.querySelector('.settings-panel').open=true; document.querySelector('#setting-includeHiddenAge').scrollIntoView({block:'center'})");
    assert.equal(await evaluate("document.querySelector('.highlight-settings').tagName"),"FIELDSET");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
    await capture(`reading-controls-${width}.png`);
    await evaluate("document.querySelector('#setting-highlightNew').scrollIntoView({block:'center'})");
    await capture(`reading-highlights-${width}.png`);
  }
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
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
  await capture("batch004-topic-desktop.png");
  assert.equal(await evaluate("document.querySelector('#header-logout').textContent"),"Log out");
  assert.equal(await evaluate("document.querySelector('.highlight-settings').tagName"),"FIELDSET");
  await evaluate("document.querySelector('.new-points').open=true");
  await waitFor("document.querySelector('.new-points').open");
  // Allow native toggle events to update controlled disclosure state before the next interaction.
  await delay();
  await evaluate("document.querySelector('#setting-flagAssumptions').click()");
  assert.equal(await evaluate("document.querySelector('.highlight-settings').tagName"),"FIELDSET");
  for (const [width,height] of [[1280,900],[390,844]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
    for (const key of ["flagAssumptions","showReframing","highlightNew","anonymous","showRatings"]) {
      for (let toggle=0;toggle<2;toggle++) {
        const selector=JSON.stringify(`#setting-${key}`);
        await evaluate(`document.querySelector(${selector}).scrollIntoView({block:'center'}); document.querySelector(${selector}).focus({preventScroll:true})`);
        const measure=`(()=>{const input=document.querySelector(${selector});const r=input.getBoundingClientRect();return {y:scrollY,panel:document.querySelector('.settings-panel').scrollTop,top:r.top,x:r.x+r.width/2,clickY:r.y+r.height/2,focus:document.activeElement.id,section:document.querySelector('.highlight-settings').tagName,checked:input.checked};})()`;
        const before=await evaluate(measure);
        assert.ok(before.clickY>0 && before.clickY<height,"Checkbox must be visible for a real click");
        if(width===1280) assert.ok(before.panel>0,"Exercise the sidebar's internal scroll");
        await send("Input.dispatchMouseEvent",{type:"mousePressed",x:before.x,y:before.clickY,button:"left",clickCount:1});
        await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:before.x,y:before.clickY,button:"left",clickCount:1});
        await delay();
        assert.deepEqual(await evaluate(measure),{...before,checked:!before.checked},`${key} toggle ${toggle} keeps reading context at ${width}px`);
      }
    }
    await capture(`batch006-highlights-${width}.png`);
  }
  await send("Emulation.setDeviceMetricsOverride", { width:1280,height:900,deviceScaleFactor:1,mobile:false });
  const expectedPoints=days=>data.topic.points.filter(p=>Date.parse(p.first_at)>Date.parse(data.last_pulled_at??data.snapshot_at)-days*86400000 && Date.parse(p.first_at)<=Date.parse(data.last_pulled_at??data.snapshot_at) && p.cites.some(key=>available.some(post=>post.key===key))).length;
  const counts=[];
  for(const days of [1,3,7]) {
    await click(`${days} day${days===1?'':'s'}`);
    assert.equal(await evaluate("document.querySelector('.new-points').open"),true);
    const count=await evaluate("document.querySelector('.new-points summary').textContent");
    assert.equal(count,`${expectedPoints(days)} new points`); counts.push(count);
  }
  assert.ok(new Set(counts).size>1, 'ZCG fixture must exercise distinct point counts');
  await evaluate("document.querySelector('.new-points').open=false");
  await click("Expand all posts");
  assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(n=>!n.hidden)"),true);
  const beforeExpandCount=await evaluate("document.querySelectorAll('.post-content').length");
  await evaluate("document.querySelector('.load-more').click()");
  assert.equal(await evaluate("document.querySelectorAll('.post-content').length"),beforeExpandCount+20);
  assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(n=>!n.hidden)"),true);
  await click("Collapse all posts");
  assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(n=>n.hidden)"),true);
  await evaluate("(()=>{const slider=document.querySelector('#setting-minAccountMonths'); slider.value='36'; slider.dispatchEvent(new Event('change'));})()");
  assert.equal(await evaluate("document.querySelectorAll('.compact-post').length > 0"),true);
  assert.equal(await evaluate("document.querySelector('#setting-minAccountMonths').step"),"1");
  await evaluate("(()=>{const slider=document.querySelector('#setting-minAccountMonths'); slider.value='0'; slider.dispatchEvent(new Event('change'));})()");
  await send("Page.bringToFront");
  await evaluate("document.querySelector('#info-toneBands-button').focus()");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#info-toneBands')).display"),"block");
  await capture("batch004-filter-help.png");
  await evaluate("document.activeElement.blur()");
  const infoRect=await evaluate("(()=>{const r=document.querySelector('#info-toneBands-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await send("Input.dispatchMouseEvent",{type:"mouseMoved",...infoRect});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#info-toneBands')).display"),"block");
  await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:1200,y:850});
  await evaluate("document.querySelector('#info-toneBands-button').click(); document.querySelector('#setting-toneBands-good').click()");
  assert.equal(await evaluate("document.querySelector('#info-toneBands-button').getAttribute('aria-expanded')"),"true");
  await evaluate("document.querySelector('#info-toneBands-button').focus()");
  await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#info-toneBands')).display"),"none");
  await evaluate("document.querySelector('#setting-toneBands-any').click()");
  await waitFor("document.querySelector('#site-nav').textContent.includes('Profile')");
  await evaluate("document.querySelector('#setting-toneBands-bad').focus(); document.querySelector('#setting-toneBands-bad').click()");
  assert.equal(await evaluate("document.activeElement.id === 'setting-toneBands-bad'"),true);
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
  assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(postSelector+' button[aria-label^="Heart:"]')})].map(b=>b.getAttribute('aria-label'))`),["Heart: This made things worse","Heart: No change","Heart: Helped"]);
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
  await capture("batch004-sad-pet.png");
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Heart: Helped"]')}).click(); document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Head: Helped"]')}).click()`);
  await waitFor("document.querySelector('.companion-stars').textContent === '★★★★★'");
  assert.equal(await evaluate("document.querySelector('.companion').classList.contains('companion-happy')"),true);
  await send("Page.bringToFront");
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Save post"]')}).focus()`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Save post"] .hover-tip')})).display`),"block");
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Save post"]')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Remove bookmark"]')}) !== null`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(postSelector+' .bookmark-icon')}).classList.contains('filled')`),true);
  await evaluate(`document.querySelector(${JSON.stringify(postSelector+' button[aria-label="Mark read"]')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector)}).classList.contains('read-post')`);
  await evaluate(`document.querySelector(${JSON.stringify(postSelector)}).scrollIntoView()`);
  await capture("batch004-post-desktop.png");
  await evaluate("location.hash='#/saved'");
  await waitFor("document.querySelector('.saved-posts') !== null");
  assert.equal(await evaluate("document.querySelector('.saved-posts h1').textContent"),"Saved posts (1)");
  const historyDb = new DatabaseSync(join(scratch,"zforum.sqlite"));
  historyDb.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<220) INSERT INTO reading SELECT ?,'999999/'||x,1,0 FROM n").run(account);
  await send("Page.reload");
  await waitFor("document.querySelector('.saved-posts h1')?.textContent === 'Saved posts (200)'");
  assert.equal(await evaluate("document.querySelectorAll('.saved-posts li').length"),200);
  await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent==='Load more saved posts').scrollIntoView({block:'center'})");
  await capture("reading-history-pagination.png");
  await click("Load more saved posts");
  await waitFor("document.querySelector('.saved-posts h1')?.textContent === 'Saved posts (221)'");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent==='Load more saved posts')"),false);
  historyDb.prepare("DELETE FROM reading WHERE account=? AND post LIKE '999999/%'").run(account);
  historyDb.close();
  await send("Page.reload");
  await waitFor("document.querySelector('.saved-posts h1')?.textContent === 'Saved posts (1)'");
  await evaluate("location.hash='#/profile'");
  await waitFor("document.querySelector('.companion-options') !== null");
  assert.equal(await evaluate("document.querySelectorAll('.companion-options button').length"),10);
  await capture("batch004-profile.png");
  await evaluate("location.hash='#/how-to-use'");
  await waitFor("document.querySelector('.info-page h1').textContent === 'How to use Zenzcash'");
  assert.equal(await evaluate("document.querySelector('main').textContent.includes('1 day ending at the last forum pull')"),true);
  await evaluate("location.hash='#/topic/zcg'");
  await waitFor("document.querySelector('.selection-bar') !== null");
  await evaluate("document.querySelector('.selection-bar').open=true");
  await click("1 day");
  await evaluate("[...document.querySelectorAll('.selection-bar button')].find(b=>b.textContent.startsWith('Select posts in this time window')).click()");
  const cutoff=Date.parse(data.last_pulled_at ?? data.snapshot_at)-24*3600000;
  const selected=new Set(available.filter(p=>Date.parse(p.created_at)>cutoff).map(p=>p.key));
  assert.equal(await evaluate("document.querySelector('.selection-bar summary strong').textContent"),`${selected.size} selected`);
  await click("3 days");
  assert.equal(await evaluate("document.querySelector('.selection-bar summary strong').textContent"),`${selected.size} selected`);
  assert.deepEqual(await evaluate("[...document.querySelector('[aria-label=\"Actions for selected posts\"]').children].map(b=>b.textContent)"),['Listen to selected posts','Export selected posts','Copy prompt + selected posts','Copy post links only']);
  await evaluate("document.querySelector('#selection-workflows').scrollIntoView(); window.scrollBy(0,-document.querySelector('.site-header').getBoundingClientRect().height-16)");
  assert.equal(await evaluate("new Set([...document.querySelector('[aria-label=\"Actions for selected posts\"]').children].map(b=>b.getBoundingClientRect().top)).size"),1);
  await capture('zenzcash-actions-desktop.png');
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelector('#selection-workflows').scrollIntoView(); window.scrollBy(0,-document.querySelector('.site-header').getBoundingClientRect().height-16)");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);
  await capture('zenzcash-actions-mobile.png');
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click("Export selected posts");
  await waitFor("document.querySelector('.selection-bar').textContent.includes('Downloaded zenzcash-selected-posts.md')");
  let downloaded;
  for(let attempt=0;attempt<60;attempt++){ downloaded=readdirSync(downloads).find(name=>name.endsWith('.md'));if(downloaded)break;await delay(); }
  assert.equal(downloaded,"zenzcash-selected-posts.md");
  const prompt=readFileSync(join(root,"site/prompt.md"),'utf8');
  assert.equal(readFileSync(join(downloads,downloaded),'utf8'),selectionMarkdown(data,selected,"http://localhost:8017/",prompt));
  await evaluate("document.querySelector('.selection-bar').open=false; document.querySelector('.settings-panel').open=false; window.scrollTo(0,0)");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);
  assert.equal(await evaluate("document.querySelector('.companion').getBoundingClientRect().bottom <= document.querySelector('.site-header').getBoundingClientRect().bottom"),true);
  await capture("batch004-topic-mobile.png");
  await evaluate(`location.hash=${JSON.stringify(route)}`);
  await waitFor(`document.querySelector(${JSON.stringify(postSelector+' .version-original')}) !== null`);
  await evaluate(`document.querySelector(${JSON.stringify(postSelector)}).scrollIntoView()`);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);
  await capture("batch004-post-mobile.png");
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
  await evaluate("document.querySelector('#header-logout').click()");
  await waitFor("document.querySelector('#site-nav').textContent === 'HomeTopicsHow to useSign in'");
  assert.equal(await evaluate("document.querySelector('#header-logout')"),null);
  assert.deepEqual(errors,[]);
  {
    const restricted=available[0].key,remaining=available.find(post=>post.key!==restricted).key;
    const file=join(scratch,'privacy-restrictions.json');writeFileSync(file,JSON.stringify([restricted]),{mode:0o600});
    await runProcess(join(root,'server/target/debug/zforum-server'),['restrict','--db',join(scratch,'zforum.sqlite'),'--file',file]);
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://localhost:8017/#/topic/zcg/post/${remaining}`});
    await waitFor("document.querySelector('.originals-only .post-body') !== null");
    assert.equal(await evaluate("document.querySelector('.settings-panel')"),null);
    const redacted=await evaluate("fetch('/data/zcg.json').then(r=>r.json())");
    const posts=redacted.topic.threads.flatMap(thread=>thread.posts);assert.equal(posts.find(post=>post.key===restricted).raw,null);assert(posts.every(post=>post.analysis===null));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);await capture('privacy-original-desktop.png');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);await capture('privacy-original-mobile.png');
    assert.deepEqual(errors,[]);
  }
  console.log(`Browser passed (${catalog.topics.length} topics): featured/search/sort/interest discovery, directory return scroll/focus via links and history, all five highlight toggles preserve panel/page position, monthly filter, persistent disclosures, 1/3/7-day point counts, expand/collapse including later loads, info hover/click/focus/Escape, reaction order, bookmarks/read, account saving/logout, selected-window export byte equality, desktop/mobile layout, native keyboard activation and no console errors.`);
  }
  await send("Browser.close", {}, true);
} catch(error) {
  console.error(error);
  throw error;
} finally {
  clearTimeout(watchdog);
  await cleanup();
}
