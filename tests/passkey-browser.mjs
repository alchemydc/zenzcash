// Real WebAuthn ceremonies, real verifier, disposable credentials/database.
// Run with: node tests/browser.mjs --passkeys
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function checkPasskeys({ send, evaluate, waitFor, click, capture, downloads }) {
  await send("WebAuthn.enable");
  const addDevice = async () => (await send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })).authenticatorId;
  let authenticatorId = await addDevice();
  const profile = "document.querySelector('#account-panel h1')?.textContent === 'Profile'";
  const guest = "document.querySelector('#account-panel h1')?.textContent === 'Sign in'";
  const idle = "![...document.querySelectorAll('#account-panel button')].some(b=>b.disabled)";
  const codes = () => evaluate("document.querySelector('.recovery-codes pre').textContent.split('\\n')");
  const signOut = async () => { await waitFor(idle); await click("Sign out"); await waitFor(guest); };
  const signIn = async () => { await click("Sign in with a passkey"); await waitFor(profile); await waitFor(idle); };
  await send("Page.navigate", { url: "http://localhost:8017/#/profile" });
  await waitFor(guest);
  // Observe the actual native API arguments: a virtual authenticator can complete
  // conditional requests without demonstrating that a real user gets a dialog.
  await evaluate(`window.passkeyMediations=[];const nativeGet=navigator.credentials.get.bind(navigator.credentials);navigator.credentials.get=options=>{window.passkeyMediations.push(options.mediation);return nativeGet(options);};`);
  assert.equal(await evaluate("document.body.textContent.includes('Local preview: passkeys created on zenzcash.com do not work here.')"), true);
  // Keep an actual browser ceremony open to test duplicate clicks, rerenders and abort.
  await send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: false });
  await evaluate(`window.authStarts=0; const originalFetch=window.fetch; window.fetch=(path,...args)=>{if(path==='api/auth/start') window.authStarts++; return originalFetch(path,...args);};`);
  await evaluate(`const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Create account with a passkey');button.click();button.click();`);
  await waitFor("document.querySelector('.passkey-status').textContent.includes('Waiting for your browser')");
  assert.equal(await evaluate("window.authStarts"), 1);
  assert.equal(await evaluate("[...document.querySelectorAll('#account-panel button')].filter(b=>b.textContent!=='Cancel passkey request').every(b=>b.disabled)"), true);
  await capture("passkey-waiting.png");
  await click("Cancel passkey request");
  await waitFor("document.querySelector('.passkey-status').textContent === 'Passkey request cancelled. You can try again.'");
  await waitFor(idle);
  await click("Sign in with a passkey");
  await waitFor("document.querySelector('.passkey-status').textContent.includes('Waiting for your browser')");
  assert.deepEqual(await evaluate("window.passkeyMediations"), ['required']);
  await evaluate("location.hash='#/';");
  await waitFor("document.querySelector('.info-page') !== null");
  await evaluate("location.hash='#/profile';");
  await waitFor(idle);
  assert.equal(await evaluate("document.querySelector('.passkey-status').textContent"), "Passkey request cancelled. You can try again.");
  await send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: true });
  await evaluate(`const networkFetch=window.fetch;window.fetch=(path,...args)=>path==='api/me'?new Promise(resolve=>{window.releaseAccount=()=>{window.fetch=networkFetch;resolve(networkFetch(path,...args));};}):networkFetch(path,...args);`);
  await click("Create account with a passkey");
  await waitFor("document.querySelector('.recovery-codes') !== null && typeof window.releaseAccount === 'function'");
  assert.equal(await evaluate(guest), true, "Codes must render before the profile request completes");
  await evaluate("window.releaseAccount()");
  await waitFor(profile);
  await waitFor(idle);
  const originalCodes = await codes();
  assert.equal(originalCodes.length, 10);
  assert.equal(new Set(originalCodes).size, 10);
  const label = await evaluate("fetch('api/me').then(r=>r.json()).then(a=>a.personal.label)");
  for (const [width, height, name] of [[1280,900,"passkey-recovery-desktop.png"],[390,844,"passkey-recovery-mobile.png"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:false });
    assert.equal(await evaluate("document.querySelector('.recovery-codes').getBoundingClientRect().top < innerHeight / 2"), true);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await capture(name);
  }
  await click("Download recovery codes");
  await waitFor("document.querySelector('.recovery-codes') !== null");
  for(let attempt=0;attempt<50&&!readdirSync(downloads).includes('zenzcash-recovery-codes.txt');attempt++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(readFileSync(join(downloads,"zenzcash-recovery-codes.txt"),"utf8"), `Zenzcash recovery codes for http://localhost:8017\nEach code works once. Keep these private.\n\n${originalCodes.join("\n")}\n`);
  await click("I saved my codes · hide them");
  assert.equal(await evaluate("document.querySelector('.recovery-codes') === null"), true);
  await signOut();
  await send("Page.reload");
  await waitFor(guest);
  await signIn();
  assert.equal(await evaluate("fetch('api/me').then(r=>r.json()).then(a=>a.personal.label)"), label);
  assert.equal(await evaluate("document.querySelector('.recovery-codes') === null"), true);
  await click("Verify again with passkey");
  await waitFor(idle);
  // A second device can be enrolled without replacing the first credential.
  await send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  authenticatorId = await addDevice();
  await click("Add another passkey");
  await waitFor(idle);
  const secondKeys = (await send("WebAuthn.getCredentials", {authenticatorId})).credentials;
  assert.equal(secondKeys.length, 1);
  await signOut(); await signIn();
  assert.equal(await evaluate("fetch('api/me').then(r=>r.json()).then(a=>a.personal.label)"), label);
  await evaluate("[...document.querySelectorAll('summary')].find(n=>n.textContent==='Recovery codes and account deletion').click()");
  await click("Replace all remaining recovery codes");
  await waitFor("document.querySelector('.recovery-codes') !== null");
  const replacementCodes = await codes();
  assert.equal(replacementCodes.length, 10);
  assert.equal(replacementCodes.some(code=>originalCodes.includes(code)), false);
  await signOut();
  await send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  authenticatorId = await addDevice();
  const enterCode = async code => evaluate(`document.querySelector('details').open=true;document.querySelector('input[aria-label="One recovery code"]').value=${JSON.stringify(code)}`);
  await enterCode(originalCodes[0]);
  await click("Recover and create a passkey");
  await waitFor("document.querySelector('.passkey-status').textContent.includes('recovery code invalid or already used')");
  await enterCode(replacementCodes[0]);
  await send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: false });
  await click("Sign in with a passkey");
  await waitFor("document.querySelector('.passkey-status').textContent.includes('Waiting for your browser')");
  await enterCode(replacementCodes[0]);
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel sign-in and recover').disabled"), false);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel sign-in and recover').scrollIntoView({block:'center'})");
  await capture("passkey-recovery-fallback.png");
  await send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: true });
  await click("Cancel sign-in and recover");
  await waitFor(profile); await waitFor(idle);
  const recovered = await evaluate("fetch('api/me').then(r=>r.json()).then(a=>a.personal)");
  assert.equal(recovered.label, label);
  assert.equal(recovered.recovery_remaining, 9);
  await signOut(); await signIn();
  await signOut();
  await enterCode(replacementCodes[0]);
  await click("Recover and create a passkey");
  await waitFor("document.querySelector('.passkey-status').textContent.includes('recovery code invalid or already used')");
  // The replaced device no longer grants access, even though it retains its key.
  await send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  authenticatorId = await addDevice();
  await send("WebAuthn.addCredential", { authenticatorId, credential: secondKeys[0] });
  await click("Sign in with a passkey");
  await waitFor("document.querySelector('.passkey-status').textContent.includes('credential is not registered')");
  assert.equal(await evaluate("fetch('api/me').then(r=>r.json()).then(a=>a.authenticated)"), false);
  // A failed secondary profile load must not erase one-time codes after enrollment.
  await send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  authenticatorId = await addDevice();
  await evaluate(`const normalFetch=window.fetch;window.fetch=(path,...args)=>{if(path==='api/me'){window.fetch=normalFetch;return Promise.resolve(new Response('Profile temporarily unavailable',{status:503}));}return normalFetch(path,...args);};`);
  await click("Create account with a passkey");
  await waitFor("document.querySelector('#account-panel').textContent.includes('loading your account failed: HTTP 503')");
  await waitFor(idle);
  assert.equal((await codes()).length, 10);
  assert.equal(await evaluate("fetch('api/me').then(r=>r.json()).then(a=>a.authenticated)"), true);
  console.log("Passkeys passed: duplicate-click prevention, visible pending/cancel/navigation, real enrollment and recovery-code download/layout, returning sign-in, re-verification, second passkey, code replacement/recovery/reuse rejection and revoked-credential rejection.");
}
