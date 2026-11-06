import assert from "node:assert/strict";
import test from "node:test";
import { corpusData } from './corpus-fixture.mjs';
import { parseCatalog, parseTopicContent, catalogRoute, catalogRevision } from "../site/js/catalog.js";
import { listingFixture } from './helpers.mjs';
import { renderTopics } from "../site/js/home.js";
import { installDom, nodes } from "./recorded-dom.mjs";
import { shortDate } from "../site/js/logic.js";
const initial=corpusData();
function fixture(){
  const a=structuredClone(initial),b=structuredClone(initial);
  a.topic.card.interests=["grants"];
  b.topic.id="konclave";b.topic.card.title="Konclave";b.topic.card.interests=["protocol"];
  b.topic.threads=[{...b.topic.threads[0],id:57218,posts:[{...b.topic.threads[0].posts[0],number:1,key:"57218/1"}]}];
  a.release_id="a";b.release_id="b";
  return {topics:[a,b].map(listingFixture),unavailable:["zebra-disclosure"],last_pull_cutoff:"2026-11-06T03:51:56.235Z"};
}
test("catalog navigation resolves separate topics and direct posts, with text-free unavailable routes",()=>{
  const catalog=parseCatalog(fixture());
  assert.equal(catalogRoute("#/",catalog).kind,"home");
  const route=catalogRoute("#/topic/konclave/post/57218/1",catalog);
  assert.equal(route.data.topic.id,"konclave");assert.equal(route.post,"57218/1");
  assert.deepEqual(catalogRoute("#/topic/zcg/post/57218/1",catalog),{kind:"missing"});
  assert.deepEqual(catalogRoute("#/topic/zebra-disclosure",catalog),{kind:"unavailable"});
  assert.deepEqual(catalogRoute("#/topic/unknown",catalog),{kind:"missing"});
  const changed=fixture();changed.topics[1].release_id="new";
  assert.notEqual(catalogRevision(changed),catalogRevision(catalog));
  const privacy=fixture();privacy.topics[0].visibility_pending=true;assert.notEqual(catalogRevision(privacy),catalogRevision(catalog));
  const duplicate=fixture();duplicate.unavailable.push("zcg");
  assert.throws(()=>parseCatalog(duplicate),/duplicate catalog topic/);
  const invalid=fixture();invalid.topics[1].topic.threads[0].posts=[];
  assert.throws(()=>parseCatalog(invalid),/Invalid or duplicate listing thread/);
  const invalidContent=structuredClone(initial);invalidContent.topic.threads[0].posts[0].key='<script>';
  assert.throws(()=>parseTopicContent(invalidContent,'zcg'),/Invalid or duplicate topic post/);
  assert.deepEqual(parseCatalog({topics:[],unavailable:[],last_pull_cutoff:null}),{topics:[],unavailable:[],last_pull_cutoff:null});
});
test("catalog pull cutoff is null or exactly one canonical UTC timestamp",()=>{
  assert.equal(parseCatalog(fixture()).last_pull_cutoff,"2026-11-06T03:51:56.235Z");
  const none=fixture();none.last_pull_cutoff=null;
  assert.equal(parseCatalog(none).last_pull_cutoff,null);
  const shape="Invalid topic catalog: expected exactly topics and unavailable arrays and last_pull_cutoff";
  const missing=fixture();delete missing.last_pull_cutoff;
  assert.throws(()=>parseCatalog(missing),{message:shape});
  const extra=fixture();extra.last_published_at="2026-11-06T15:00:00.000Z";
  assert.throws(()=>parseCatalog(extra),{message:shape});
  for(const value of ["2026-11-06T03:51:56Z","2026-11-06T03:51:56.235+00:00","2026-11-06 03:51:56.235Z","2026-02-30T00:00:00.000Z","2026-11-06","",1762401116235,{},undefined]){
    const invalid=fixture();invalid.last_pull_cutoff=value;
    assert.throws(()=>parseCatalog(invalid),{message:`Invalid topic catalog last_pull_cutoff ${JSON.stringify(value)}: expected null or a canonical UTC timestamp`},JSON.stringify(value));
  }
});
test("topics page states the last forum pull cutoff directly below the introduction, only when one is recorded",t=>{
  installDom(t);
  const render=catalog=>renderTopics(parseCatalog(catalog),{interests:[]},{setSettings(){}},{featured:[],interests:{}},{query:"",sort:"recent"});
  const hero=nodes(render(fixture()),"hero")[0];
  assert.deepEqual(hero.children.map(child=>child.attributes.get("class")??child.tag),["h1","lede","pull-cutoff small muted"]);
  assert.equal(hero.children[2].textContent,`Last forum pull cutoff: ${shortDate("2026-11-06T03:51:56.235Z")}`);
  const none=fixture();none.last_pull_cutoff=null;
  const unrecorded=render(none);
  assert.deepEqual(nodes(unrecorded,"hero")[0].children.map(child=>child.attributes.get("class")??child.tag),["h1","lede"]);
  assert.equal(nodes(unrecorded,"pull-cutoff").length,0);
  assert.equal(unrecorded.textContent.includes("pull cutoff"),false);
});
test("home renders every available real topic and applies interest filters",t=>{
  installDom(t);
  const catalog=parseCatalog(fixture());
  const home=renderTopics(catalog,{interests:[]},{setSettings(){}}, {featured:[],interests:{}}, {query:"",sort:"recent"});
  assert.deepEqual(nodes(home,"topic-card").map(card=>card.attributes.get("href")),["#/topic/zcg","#/topic/konclave"]);
  assert.equal(nodes(home,"placeholder").length,0);
  assert.match(home.textContent,/1 topic\(s\) temporarily unavailable/);
  const filtered=renderTopics(catalog,{interests:["protocol"]},{setSettings(){}}, {featured:[],interests:{}}, {query:"",sort:"recent"});
  assert.deepEqual(nodes(filtered,"topic-card").map(card=>card.attributes.get("href")),["#/topic/konclave"]);
});

test("header pages have separate routes and informational home hides impact statistics",async t=>{
  installDom(t);
  const {renderHome,renderHowToUse}=await import('../site/js/info-pages.js');
  for(const kind of ['topics','how-to-use','profile','saved']) assert.deepEqual(catalogRoute(`#/${kind}`,fixture()),{kind});
  const home=renderHome();
  assert.equal(home.textContent.includes('Zcon 7 in Cancun in October 2026'),true);
  assert.equal(home.textContent.includes('Impact statistics'),false);
  const guide=renderHowToUse();
  for(const text of ['1 day ending at the last forum pull','all posts in a forum thread','pre-written prompt','same file to NotebookLM']) assert.equal(guide.textContent.includes(text),true);
});
