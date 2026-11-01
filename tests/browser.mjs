// Bounded integration check using installed Firefox and the compiled Rust server.
// Run: cargo build --manifest-path server/Cargo.toml && node tests/browser.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectionMarkdown } from "../site/js/selection.js";
import { PODCAST_INSTRUCTIONS } from "../site/js/selection-controls.js";
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
writeFileSync(join(profile, "user.js"), [
  'user_pref("browser.download.folderList", 2);',
  `user_pref("browser.download.dir", ${JSON.stringify(downloads)});`,
  'user_pref("browser.download.useDownloadDir", true);',
  'user_pref("browser.download.alwaysOpenPanel", false);',
].join("\n"));
const children = [];
const start = (command, args) => {
  const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
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
const firefoxLog = start("firefox", ["--headless", "--no-remote", "--profile", profile, "--remote-debugging-port", "9237", "about:blank"]);
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (firefoxLog().includes("WebDriver BiDi listening")) { ready = true; break; }
    await delay();
  }
  assert.equal(ready, true, `Firefox did not start: ${firefoxLog()}\nServer: ${serverLog()}`);
  socket = new WebSocket("ws://127.0.0.1:9237/session");
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  const errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "log.entryAdded" && message.params.level === "error") errors.push(message.params.text);
    if (pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timeout);
      if (message.type === "error") reject(new Error(JSON.stringify(message)));
      else resolve(message.result);
    }
  };
  let id = 0;
  const send = (method, params) => new Promise((resolve, reject) => {
    const key = ++id;
    const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`BiDi timed out: ${method}`)); }, 10000);
    pending.set(key, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  await send("session.new", { capabilities: {} });
  await send("session.subscribe", { events: ["log.entryAdded"] });
  const context = (await send("browsingContext.getTree", {})).contexts[0].context;
  const evaluate = async (expression) => {
    const result = await send("script.evaluate", { expression, target: { context }, awaitPromise: true });
    if (result.type === "exception") throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(expression)) return;
      await delay();
    }
    throw new Error(`Browser condition not reached: ${expression}`);
  };
  const click = (text) => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)}).click()`);
  const capture = async (name) => {
    const result = await send("browsingContext.captureScreenshot", { context, origin: "viewport" });
    writeFileSync(join(shots, name), Buffer.from(result.data, "base64"));
  };
  if (catalogMode) {
    await send("browsingContext.setViewport", { context, viewport: { width:1280,height:900 } });
    await send("browsingContext.navigate", { context, url:"http://127.0.0.1:8017/#/",wait:"complete" });
    await waitFor("document.querySelectorAll('a.topic-card').length === 4");
    assert.equal(await evaluate("document.querySelectorAll('.placeholder').length"),0);
    await capture("topics-desktop.png");
    for (const topic of IMPORT_TOPICS) {
      await evaluate(`location.hash = ${JSON.stringify(`#/topic/${topic.id}`)}`);
      await waitFor(`document.querySelector('.topic-head .eyebrow') !== null && document.querySelector('#post-${topic.threadIds[0]}-1') !== null`);
      if (topic.id === "zebra-disclosure") {
        assert.equal(await evaluate("document.querySelector('.topic-head .eyebrow').textContent.endsWith('1 post · 1 thread · 1 person')"),true);
        assert.equal(await evaluate("document.querySelector('.thread-tab-meta').firstChild.textContent"),"1 post");
        assert.equal(await evaluate("document.querySelector('.thread-tab-meta .badge-new').textContent"),"1 new");
      }
      assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(node=>node.hidden)"),true);
      assert.equal(await evaluate("document.querySelector('.debate-summary').open"),false);
      await evaluate("document.querySelector('.debate-summary > summary').click()");
      await waitFor("document.querySelector('.debate-summary').open");
      const count = await evaluate("document.querySelectorAll('.question-card').length");
      assert.ok(count >= 1 && count <= 6);
      assert.equal(await evaluate(`document.querySelector('.debate-summary > summary').textContent.includes(${JSON.stringify(` · ${count} question`)})`),true);
      await evaluate("document.querySelector('.question-heading').click()");
      await waitFor("document.querySelector('.question-card').open");
      await evaluate("document.querySelector('.question-card .cite').click()");
      await waitFor("document.querySelector('.post.flash .version-original') !== null");
      await send("browsingContext.setViewport", { context, viewport:{width:390,height:844} });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),true);
      await evaluate("window.scrollTo(0,0)");
      await capture(`${topic.id}-mobile.png`);
      await send("browsingContext.setViewport", { context, viewport:{width:1280,height:900} });
    }
    await evaluate("location.hash = '#/topic/bug-bounties/post/57058/33'");
    await waitFor("document.querySelector('#post-57058-33 .version-original') !== null");
    await evaluate("location.hash = '#/topic/zcg'");
    await waitFor("document.querySelector('#post-58515-1') !== null");
    await evaluate("location.hash = '#/'");
    await waitFor("document.querySelectorAll('a.topic-card').length === 4");
    assert.deepEqual(errors,[]);
    console.log("Catalog browser passed: four real topics, separate routes, collapsed defaults, adaptive question counts, citation and deep-link navigation, mobile width and no console errors. Native keyboard activation is covered by the separate default browser suite.");
  } else {
  await send("browsingContext.setViewport", { context, viewport: { width: 1280, height: 900 } });
  await send("browsingContext.navigate", { context, url: "http://127.0.0.1:8017/#/topic/zcg", wait: "complete" });
  await waitFor("document.querySelector('.selection-bar') !== null");
  assert.equal(await evaluate("!document.querySelector('.debate-summary').open"), true);
  assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(n => n.hidden)"), true);
  assert.equal(await evaluate("document.querySelector('.whats-new .since-row') !== null && document.querySelectorAll('.since-row').length === 1"), true);
  await capture("collapsed-desktop.png");
  await evaluate("document.querySelector('.debate-summary > summary').click()");
  await waitFor("document.querySelector('.debate-summary').open");
  assert.equal(await evaluate("document.querySelectorAll('.question-card').length"), 6);
  assert.equal(await evaluate("document.querySelectorAll('.question-card[open]').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('.groups, .why').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('.question-arguments .points li').length"), 20);
  await capture("questions-desktop.png");
  // Native details/summary must respond to the keyboard, not just programmatic clicks.
  await send("browsingContext.activate", { context });
  await evaluate("document.querySelector('#question-q1 > summary').focus()");
  assert.equal(await evaluate("document.activeElement === document.querySelector('#question-q1 > summary')"), true);
  await send("input.performActions", { context, actions: [{ type: "key", id: "keyboard", actions: [{ type: "keyDown", value: "\uE007" }, { type: "keyUp", value: "\uE007" }] }] });
  await waitFor("document.querySelector('#question-q1').open");
  await evaluate("document.querySelector('#question-q1 .question-arguments > summary').click()");
  await waitFor("document.querySelector('#question-q1 .question-arguments').open");
  await evaluate("document.querySelector('#question-q1 .next-question').click()");
  assert.equal(await evaluate("document.querySelector('#question-q2').open && document.activeElement === document.querySelector('#question-q2 > summary')"), true);
  assert.equal(await evaluate("document.querySelector('#question-q1').open"), true);
  await capture("question-expanded-desktop.png");
  await evaluate("document.querySelector('#question-q2 .cite').click()");
  await waitFor("document.querySelector('.post.flash .version-original') !== null");
  assert.equal(await evaluate("document.querySelector('#question-q1').open && document.querySelector('#question-q1 .question-arguments').open"), true);
  // Restore the first thread before exercising the existing post tools.
  await evaluate("document.querySelectorAll('.thread-tab')[0].click()");
  await click("Collapse all posts");
  assert.equal(await evaluate("[...document.querySelectorAll('.post-content')].every(n => n.hidden)"), true);
  await evaluate("document.querySelector('.settings-panel').open = true; const tone = document.querySelector('select[aria-label=Tone]'); tone.value = 'restrained_only'; tone.dispatchEvent(new Event('change', { bubbles: true }))");
  assert.equal(await evaluate("document.querySelectorAll('.filtered').length > 0"), true);
  await evaluate("document.querySelector('.filtered .post-toggle').click()");
  assert.equal(await evaluate("!document.querySelector('.filtered .post-content').hidden && getComputedStyle(document.querySelector('.filtered .post-content')).filter === 'grayscale(1)'"), true);
  await evaluate("document.querySelector('.filtered .post-toggle').click()");
  assert.equal(await evaluate("document.querySelector('.filtered .post-content').hidden"), true);

  await click("Select posts");
  await evaluate("document.querySelector('#post-58515-1 .post-selection input').click()");
  assert.equal(await evaluate("document.querySelector('.selection-actions strong').textContent"), "1 selected");
  await evaluate("document.querySelectorAll('.thread-tab')[5].click()");
  await evaluate("document.querySelector('#post-58656-1 .post-selection input').click()");
  assert.equal(await evaluate("document.querySelector('.selection-actions strong').textContent"), "2 selected");
  await evaluate("document.querySelectorAll('.thread-tab')[0].click()");
  assert.equal(await evaluate("document.querySelector('#post-58515-1 .post-selection input').checked"), true);
  await evaluate("document.querySelector('.selection-bar').scrollIntoView()");
  await capture("selection-desktop.png");
  await click("Ask your AI");
  await waitFor("document.querySelector('.selection-bar').textContent.includes('Attach zforum-selected-posts.md to your AI chat')");
  let downloaded;
  for (let attempt = 0; attempt < 60; attempt++) {
    downloaded = readdirSync(downloads).find((name) => name.endsWith(".md"));
    if (downloaded) break;
    await delay();
  }
  assert.equal(downloaded, "zforum-selected-posts.md");
  const data = JSON.parse(readFileSync(join(root, "site/data/zcg.json"), "utf8"));
  const prompt = readFileSync(join(root, "site/prompt.md"), "utf8");
  assert.equal(readFileSync(join(downloads, downloaded), "utf8"), selectionMarkdown(data, new Set(["58515/1", "58656/1"]), "http://127.0.0.1:8017/", prompt));
  await evaluate("document.querySelector('.selection-links summary').click()");
  await click("Copy prompt + posts for chat AI");
  await waitFor("!document.querySelector('.selection-bar textarea').hidden");
  assert.equal(await evaluate("document.querySelector('.selection-bar textarea').value"), selectionMarkdown(data, new Set(["58515/1", "58656/1"]), "http://127.0.0.1:8017/", prompt));
  await waitFor("[...document.querySelectorAll('.selection-bar button')].filter(n => n.textContent === 'Copy podcast instructions').every(n => !n.disabled)");
  await click("Copy podcast instructions");
  await waitFor("document.querySelector('.selection-bar textarea').getAttribute('aria-label') === 'Copy podcast instructions'");
  assert.equal(await evaluate("document.querySelector('.selection-bar textarea').value"), PODCAST_INSTRUCTIONS);
  await waitFor("[...document.querySelectorAll('.selection-bar button')].filter(n => n.textContent === 'Copy post links only').every(n => !n.disabled)");
  await click("Copy post links only");
  await waitFor("!document.querySelector('.selection-bar textarea').hidden");
  assert.equal(await evaluate("document.querySelector('.selection-bar textarea').value"), "http://127.0.0.1:8017/#/topic/zcg/post/58515/1\nhttp://127.0.0.1:8017/#/topic/zcg/post/58656/1");
  await click("Clear selection");
  assert.equal(await evaluate("document.querySelector('.selection-actions strong').textContent"), "0 selected");
  assert.equal(await evaluate("[...document.querySelectorAll('.post-selection input')].some(n => n.checked)"), false);

  // Direct navigation loads past the first batch and expands a filtered post, showing
  // its original. This exercises exported links independently of the in-page actions.
  await send("browsingContext.navigate", { context, url: "http://127.0.0.1:8017/#/topic/zcg/post/58515/22", wait: "complete" });
  await waitFor("document.querySelector('#post-58515-22 .version-original') !== null");
  await evaluate("document.querySelector('#post-58515-22 .version-tab-diff').click(); document.querySelector('#post-58515-22').scrollIntoView()");
  assert.equal(await evaluate("document.querySelector('#post-58515-22 .diff-text del') !== null"), true);
  assert.equal(await evaluate("document.querySelector('#post-58515-22 .post-content').hidden"), false);
  await capture("diff-desktop.png");
  await send("browsingContext.setViewport", { context, viewport: { width: 390, height: 844 } });
  await evaluate("document.querySelector('#post-58515-22').scrollIntoView()");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await capture("diff-mobile.png");
  await evaluate("document.querySelector('.selection-bar').scrollIntoView()");
  await capture("selection-mobile.png");
  await click("Collapse all posts");
  await evaluate("document.querySelector('.debate-summary').open = false; document.querySelector('.settings-panel').open = false; window.scrollTo(0, 0)");
  await capture("collapsed-mobile.png");
  await evaluate("document.querySelector('.debate-summary').open = true; document.querySelector('#question-q5 > summary').click(); document.querySelector('#question-q5').scrollIntoView()");
  await capture("question-expanded-mobile.png");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.deepEqual(errors, []);
  console.log("Browser passed: question cards, keyboard/Next focus, detail coverage and citation navigation; collapse/grey, cross-thread selection, exact downloaded file, copy/clear, deep links, diff, desktop/mobile layout; no console errors.");
  }
  await send("session.end", {});
} finally {
  clearTimeout(watchdog);
  await cleanup();
}
