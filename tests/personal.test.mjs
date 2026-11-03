import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMPANIONS, accountPanel, accountOriginLink, companionView, guestVisit, parsePersonal, credentialJSON, credentialOptions } from "../site/js/personal.js";
import { installDom, descendants } from "./recorded-dom.mjs";
import { DEFAULT_SETTINGS } from "../site/js/logic.js";
const personal = () => ({ label: "Reader", appearance: "cat", recovery_remaining: 10, reading: {"7/1": {read:true,bookmarked:false}}, preferences: structuredClone(DEFAULT_SETTINGS), moods: { "7/1": -1 }, progress: { emotions: -1, head: 1 } });
test("guest sign-in explains the requested action and offers the reading return link",t=>{
  installDom(t);
  for(const reason of ["save posts","save your read/unread choices","save your mood reaction","choose your Zamagotchi"]) {
    const panel=accountPanel({personal:null,auth_available:true,sign_in_reason:reason,sign_in_return:"#/topic/zcg"},{});
    assert.match(panel.textContent,new RegExp(`Sign in to ${reason}`));
    assert.equal(panel.querySelector("a").attributes.get("href"),"#/topic/zcg");
  }
});
test("accounts on a different origin offer the configured address instead of unusable signup controls", (t) => {
  installDom(t);
  const canonical = "http://localhost:8000";
  assert.equal(accountOriginLink(canonical,canonical),null);
  const destination = accountOriginLink(canonical,"http://127.0.0.1:8000");
  assert.equal(destination,`${canonical}/`);
  assert.equal(accountOriginLink(canonical,"http://localhost:8001"),destination);
  for (const bad of ["javascript:alert(1)","http://example.com","https://example.com/path",undefined]) assert.throws(() => accountOriginLink(bad,canonical));
  const panel = accountPanel({personal:null,auth_available:true,sign_in_url:destination},{});
  assert.equal(panel.querySelector("a").attributes.get("href"),destination);
  assert.equal(descendants(panel).filter((node) => node.tag === "button").length,0);
  assert.match(panel.textContent,/different website address/);
});
test("exactly ten companion appearances preserve independent authoritative progress", (t) => {
  installDom(t);
  assert.equal(COMPANIONS.length,10);assert.equal(new Set(COMPANIONS.map(([id])=>id)).size,10);
  const rust=readFileSync(new URL('../server/src/database.rs',import.meta.url),'utf8');
  for (const [id] of COMPANIONS) {
    assert.equal(rust.includes(`"${id}"`),true);
    const value=personal();value.appearance=id;
    assert.deepEqual(parsePersonal(value),value);
    const view=companionView(value,()=>{});
    assert.equal(view.className.includes('companion-sad'),true);
    assert.equal(view.textContent.includes('★★★★★'),true);
    assert.equal(view.attributes.get('aria-label').includes('Emotional benefit -1.0; new perspectives 1.0'),true);
  }
  const invalid=personal();invalid.progress.head=11;assert.throws(()=>parsePersonal(invalid),{message:'invalid companion head'});
});
test("guest visits hold the previous cutoff through refresh and become new after inactivity",()=>{
  const first=guestVisit(null,1000);assert.deepEqual(first,{active:1000,cutoff:null});
  const refresh=guestVisit(first,2000);assert.equal(refresh.cutoff,null);
  const later=guestVisit(refresh,1802000);assert.equal(later.cutoff,new Date(2000).toISOString());
  assert.equal(guestVisit(later,1803000).cutoff,later.cutoff);
  assert.throws(()=>guestVisit({active:'bad',cutoff:null},3000),{message:'invalid saved visit state'});
});
test("WebAuthn JSON round trips byte fields without secrets in URL parameters",()=>{
  const options=credentialOptions({publicKey:{challenge:'AQID',user:{id:'BAUG'},excludeCredentials:[{id:'BwgJ'}]}},true);
  assert.deepEqual([...options.publicKey.challenge],[1,2,3]);assert.deepEqual([...options.publicKey.user.id],[4,5,6]);
  const bytes=new Uint8Array([1,2,3]).buffer;
  const credential={id:'AQID',rawId:bytes,type:'public-key',response:{clientDataJSON:bytes,authenticatorData:bytes,signature:bytes,userHandle:null},getClientExtensionResults:()=>({})};
  assert.deepEqual(credentialJSON(credential),{id:'AQID',rawId:'AQID',type:'public-key',response:{clientDataJSON:'AQID',authenticatorData:'AQID',signature:'AQID',userHandle:null},extensions:{}});
});

test("companion mood and star states cover ternary aggregates, with no unearned stars", (t) => {
  installDom(t);
  for(let emotion=-1;emotion<=1;emotion+=0.25) for(let head=-1;head<=1;head+=0.25) {
    const value=personal(); value.progress={emotions:emotion,head};
    const view=companionView(value,()=>{});
    const mood=emotion>0?'happy':emotion<0?'sad':'neutral';
    assert.equal(view.classList.contains(`companion-${mood}`),true);
    const stars=descendants(view).find(n=>n.classList.contains('companion-stars'));
    assert.equal(stars.textContent,'★'.repeat(Math.ceil(Math.max(0,head)*5))+'☆'.repeat(5-Math.ceil(Math.max(0,head)*5)));
  }
});

test("recovery codes come first for guests and members, with download available during verification", t=>{
  installDom(t);
  for(const member of [null,personal()]) for(const phase of ['idle','starting','waiting','verifying']) {
    const codes=Array.from({length:10},(_,i)=>`code-${i}`);
    const panel=accountPanel({personal:member,auth_available:true,recovery_codes:codes},{},{phase,problem:null,message:phase});
    assert.equal(panel.children[1].className,'recovery-codes');
    assert.equal(panel.children[1].querySelector('pre').textContent,codes.join('\n'));
    const download=descendants(panel).find(n=>n.tag==='button'&&n.textContent==='Download recovery codes');
    assert.equal(download.attributes.has('disabled'),false);
    const cancel=descendants(panel).find(n=>n.tag==='button'&&n.textContent==='Cancel passkey request');
    assert.equal(Boolean(cancel),['starting','waiting'].includes(phase));
  }
});

test("preview identity explanation only appears on localhost, and busy account controls are disabled",t=>{
  installDom(t);
  for(const origin of ['http://localhost:8001','https://zenzcash.com']) for(const phase of ['idle','starting','waiting','verifying']) {
    const panel=accountPanel({personal:personal(),auth_available:true,auth_origin:origin},{},{phase,problem:null,message:'Waiting'});
    assert.equal(panel.textContent.includes('Local preview:'),origin.includes('localhost'));
    for(const node of descendants(panel).filter(n=>n.tag==='button'&&n.textContent!=='Cancel passkey request')) {
      if(phase!=='idle')assert.equal(node.attributes.has('disabled'),true, node.textContent);
    }
  }
});
