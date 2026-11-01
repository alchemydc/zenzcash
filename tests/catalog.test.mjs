import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseCatalog, catalogRoute, catalogRevision } from "../site/js/catalog.js";
import { renderHome } from "../site/js/home.js";
import { installDom, nodes } from "./recorded-dom.mjs";
const initial=JSON.parse(readFileSync(new URL("../site/data/zcg.json",import.meta.url),"utf8"));
function fixture(){
  const a=structuredClone(initial),b=structuredClone(initial);
  a.topic.card.interests=["grants"];
  b.topic.id="konclave";b.topic.card.title="Konclave";b.topic.card.interests=["protocol"];
  b.topic.threads=[{...b.topic.threads[0],id:57218,posts:[{...b.topic.threads[0].posts[0],number:1,key:"57218/1"}]}];
  a.release_id="a";b.release_id="b";
  return {topics:[a,b],unavailable:["zebra-disclosure"]};
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
  const duplicate=fixture();duplicate.unavailable.push("zcg");
  assert.throws(()=>parseCatalog(duplicate),/duplicate catalog topic/);
  const invalid=fixture();invalid.topics[1].topic.threads[0].posts[0].key="<script>";
  assert.throws(()=>parseCatalog(invalid),/Invalid or duplicate catalog post/);
  assert.deepEqual(parseCatalog({topics:[],unavailable:[]}),{topics:[],unavailable:[]});
});
test("home renders every available real topic and applies interest filters",t=>{
  installDom(t);
  const catalog=parseCatalog(fixture());
  const home=renderHome(catalog,{interests:[]},{setSettings(){}});
  assert.deepEqual(nodes(home,"topic-card").map(card=>card.attributes.get("href")),["#/topic/zcg","#/topic/konclave"]);
  assert.equal(nodes(home,"placeholder").length,0);
  assert.match(home.textContent,/1 topic\(s\) temporarily unavailable/);
  const filtered=renderHome(catalog,{interests:["protocol"]},{setSettings(){}});
  assert.deepEqual(nodes(filtered,"topic-card").map(card=>card.attributes.get("href")),["#/topic/konclave"]);
});
