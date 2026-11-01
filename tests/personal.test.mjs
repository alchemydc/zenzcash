import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMPANIONS, companionView, guestVisit, parsePersonal, credentialJSON, credentialOptions } from "../site/js/personal.js";
import { installDom } from "./recorded-dom.mjs";
import { DEFAULT_SETTINGS } from "../site/js/logic.js";
const personal = () => ({ label: "Reader", appearance: "cat", recovery_remaining: 10, reading: {"7/1": {read:true,bookmarked:false}}, preferences: structuredClone(DEFAULT_SETTINGS), progress: { emotions: -5, head: 6 } });
test("exactly ten companion appearances preserve independent authoritative progress", (t) => {
  installDom(t);
  assert.equal(COMPANIONS.length,10);assert.equal(new Set(COMPANIONS.map(([id])=>id)).size,10);
  const rust=readFileSync(new URL('../server/src/database.rs',import.meta.url),'utf8');
  for (const [id] of COMPANIONS) {
    assert.equal(rust.includes(`"${id}"`),true);
    const value=personal();value.appearance=id;
    assert.deepEqual(parsePersonal(value),value);
    const view=companionView(value,()=>{});
    assert.equal(view.className.includes('companion-quiet'),true);
    assert.equal(view.textContent.includes('💡💡💡💡'),true);
    assert.equal(view.attributes.get('aria-label').includes('Emotional benefit -5.0; new perspectives 6.0'),true);
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
