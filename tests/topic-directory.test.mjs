import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseCuration, topicDirectory } from "../site/js/topic-directory.js";
import { renderTopics } from "../site/js/home.js";
import { installDom, nodes } from "./recorded-dom.mjs";
import { listingFixture } from './helpers.mjs';
const curation=parseCuration(JSON.parse(readFileSync(new URL('../site/topic-curation.json',import.meta.url),'utf8')));
function fixture() {
  const topic=(id,title,date,count)=>({snapshot_at:'2026-11-01T00:00:00Z',topic:{id,card:{title,byline:'Only-body-magic',keywords:['needle'],interests:['governance','grants','developers','protocol']},threads:[{posts:Array.from({length:count},(_,i)=>({key:`7/${i+1}`,author:'a',account:{created_at:null},created_at:date}))}]}});
  return {topics:[topic('zcg','ZCG and the dev fund','2026-10-31',4),topic('bug-bounties','Bug bounties after AI','2026-10-30',6),topic('konclave','Konclave vaults','2026-10-29',6),topic('zebra-disclosure','Zebra security disclosure','2026-11-01',1)].map(listingFixture),unavailable:[],last_pull_cutoff:null};
}
const ids=(result)=>[result.featured.map(d=>d.topic.id),result.others.map(d=>d.topic.id)];
test('primary interests narrow the directory; title-only keywords combine with OR interests and stable sorting',()=>{
  const catalog=fixture(), base={query:'',sort:'recent'};
  assert.deepEqual(ids(topicDirectory(catalog,curation,[],base)),[['zcg'],['zebra-disclosure','bug-bounties','konclave']]);
  assert.deepEqual(ids(topicDirectory(catalog,curation,[],{...base,sort:'posts'})),[['zcg'],['bug-bounties','konclave','zebra-disclosure']]);
  assert.deepEqual(ids(topicDirectory(catalog,curation,['grants'],base)),[['zcg'],['zebra-disclosure']]);
  assert.deepEqual(ids(topicDirectory(catalog,curation,['developers'],base)),[[],['bug-bounties','konclave']]);
  assert.deepEqual(ids(topicDirectory(catalog,curation,['developers','grants'],base)),[['zcg'],['zebra-disclosure','bug-bounties','konclave']]);
  assert.deepEqual(ids(topicDirectory(catalog,curation,[],{...base,query:'  BOUNTIES ai '})),[[],['bug-bounties']]);
  for(const query of ['Only-body-magic','needle','ZCG bounties']) assert.equal(topicDirectory(catalog,curation,[],{...base,query}).count,0);
  const missing={...catalog,topics:catalog.topics.filter(d=>d.topic.id!=='zcg')};
  assert.deepEqual(ids(topicDirectory(missing,curation,[],base)),[[],['zebra-disclosure','bug-bounties','konclave']]);
});
test('manual featured order has up to three unique topics, honors filters and does not duplicate cards',t=>{
  installDom(t);
  const catalog=fixture(), config=parseCuration({...curation,featured:['konclave','zcg','bug-bounties']});
  const home=renderTopics(catalog,{interests:[]},{},config,{query:'',sort:'recent'});
  assert.deepEqual(nodes(nodes(home,'featured-topics')[0],'topic-card').map(n=>n.attributes.get('href')),['#/topic/konclave','#/topic/zcg','#/topic/bug-bounties']);
  assert.equal(nodes(home,'topic-card').length,4);
  assert.deepEqual(ids(topicDirectory(catalog,config,['grants'],{query:'',sort:'recent'})),[['zcg'],['zebra-disclosure']]);
  assert.deepEqual(parseCuration({featured:[],interests:{}}),{featured:[],interests:{}});
  for(const invalid of [null,{}, {...curation,featured:['zcg','zcg']},{...curation,featured:['a','b','c','d']},{...curation,featured:['../zcg']},{...curation,interests:{zcg:['x']}},{...curation,interests:{zcg:['grants','grants']}},{...curation,interests:{zcg:[]}},{...curation,extra:true}]) assert.throws(()=>parseCuration(invalid),{message:`Invalid topic curation: ${JSON.stringify(invalid)}`});
});
