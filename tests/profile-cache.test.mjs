import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cachedProfiles } from '../tools/lib/profile-cache.mjs';
import { readJsonStrict,writeJsonAtomic } from '../tools/lib/fsio.mjs';

test('profile cache deduplicates a pull and resume, including hidden/unavailable profiles, then expires for the next pull',async()=>{
  const root=mkdtempSync(join(tmpdir(),'zforum-profiles-')),requests=[],events=[];
  const get=async path=>{
    requests.push(path);
    if(path==='/u/hidden.json')return {body:{user:{profile_hidden:true}}};
    if(path==='/u/missing.json')return {unavailable:404};
    return {body:{user:{created_at:'2020-01-01T00:00:00Z',extra:'not cached'}}};
  };
  try{
    const path=join(root,'run1.json');let profile=cachedProfiles(get,path,e=>events.push(e));
    for(let repeat=0;repeat<20;repeat++) {
      for(const name of ['alice','hidden','missing'])await profile(name);
      profile=cachedProfiles(get,path,e=>events.push(e));
    }
    assert.deepEqual(requests,['/u/alice.json','/u/hidden.json','/u/missing.json']);
    assert.equal(events.filter(e=>e.hit).length,57);
    assert.equal(events.filter(e=>!e.hit).length,3);
    assert.deepEqual(readJsonStrict(path).profiles,{alice:{created_at:'2020-01-01T00:00:00Z',status:'ok'},hidden:{created_at:null,status:'profile hidden'},missing:{created_at:null,status:'no public profile'}});
    const changed=await profile('alice');changed.created_at='broken';
    assert.equal((await profile('alice')).created_at,'2020-01-01T00:00:00Z');
    const next=cachedProfiles(async path=>{requests.push(path);return {body:{user:{profile_hidden:true}}};},join(root,'run2.json'),()=>{});
    assert.deepEqual(await next('alice'),{created_at:null,status:'profile hidden'});
    assert.equal(requests.length,4);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('concurrent profile requests share work; failures and malformed profiles are not cached',async()=>{
  const root=mkdtempSync(join(tmpdir(),'zforum-profiles-'));let calls=0;
  try{
    const profile=cachedProfiles(async()=>{
      calls++;
      if(calls===1)throw new Error('fixture network failure');
      if(calls===2)return {body:{user:{created_at:'invalid'}}};
      return {body:{user:{created_at:'2020-01-01T00:00:00Z'}}};
    },join(root,'cache.json'),()=>{});
    const failed=await Promise.allSettled([profile('alice'),profile('alice')]);
    assert.deepEqual(failed.map(r=>r.reason.message),['fixture network failure','fixture network failure']);assert.equal(calls,1);
    await assert.rejects(profile('alice'),{message:'@alice: missing or invalid account creation time'});
    const success=await Promise.all(Array.from({length:50},()=>profile('alice')));
    assert.equal(calls,3);assert.equal(success.length,50);
    for(const result of success)assert.deepEqual(result,{created_at:'2020-01-01T00:00:00Z',status:'ok'});
    for(const invalid of [{created_at:null,status:'ok'},{created_at:'bad',status:'ok'},{created_at:'2020-01-01',status:'profile hidden'},{created_at:null,status:'unknown'}]){
      const path=join(root,'invalid.json');writeJsonAtomic(path,{format:'zforum-profile-cache-1',profiles:{alice:invalid}});
      assert.throws(()=>cachedProfiles(()=>assert.fail('network'),path,()=>{}),{message:`Invalid cached profile for alice: ${path}`});
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});
