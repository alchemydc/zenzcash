import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTopicGroup } from '../tools/lib/topic-group.mjs';
import { buildSiteData } from '../tools/build.mjs';
import { sha256 } from '../tools/lib/jobs.mjs';
import { sampleThread } from './helpers.mjs';
import { goodMarks } from './marks-fixture.mjs';
import { ISSUE_DETAIL_IDS } from '../site/js/summary-fields.js';
import { catalogRoute } from '../site/js/catalog.js';
import { topicRoute } from '../site/js/selection.js';
function fixture(){
  const title='The future of funding', statement={text:'An author proposes ending grants.',cites:['7/1']};
  const output={task:'summary',topic:'funding',card:{title,byline:'Different funding proposals.',keywords:['grants','funding'],interests:['grants']},headline:title,overview:[statement],points:[{id:'p1',...statement}],issues:[{id:'q1',issue:'Should grants end?',description:statement,decision_at_stake:statement,positions_with_post_references:[{label:'End grants',...statement}],unresolved_status:statement,points:['p1'],related_issues:[],...Object.fromEntries(ISSUE_DETAIL_IDS.map(id=>[id,[]]))}]};
  const accounts=Object.fromEntries(['alice','bob','carol'].map(n=>[n,{created_at:null,status:'profile hidden'}]));
  const source=id=>{
    const thread=sampleThread();thread.id=id;thread.posts.forEach(p=>p.forum_id=id*100+p.number);
    const snapshot={topic:`thread-${id}`,snapshotAt:`2026-11-0${id===7?1:2}T00:00:00Z`,threads:[thread],accounts,pulls:[{thread:id,pulled_at:`2026-11-0${id===7?1:2}T00:00:00Z`}]};snapshot.source_sha256=sha256(JSON.stringify(snapshot.threads));
    const marks=JSON.parse(JSON.stringify(goodMarks()).replaceAll('7/',`${id}/`));marks.topic_id=id;
    const originalSummary={...output,topic:`thread-${id}`,issues:['q1','q2','q3'].map(id=>({id,issue:`Original ${id}`}))};
    const data=buildSiteData(snapshot,accounts,[{task:'marks',model:'test',backend:'primary-agent',output:marks},{task:'summary',model:'test',backend:'primary-agent',output:originalSummary}]);data.release_id=`release-${id}`;
    return {data,snapshot};
  };
  const a=source(7),b=source(8);
  const snapshot={...b.snapshot,topic:'funding',threads:[...a.snapshot.threads,...b.snapshot.threads],pulls:[...a.snapshot.pulls,...b.snapshot.pulls]};snapshot.source_sha256=sha256(JSON.stringify(snapshot.threads));
  return {id:'funding',title,snapshot,sources:[a],recovered:[b.data],summary:{output,model:'test',agent:'codex',input:'input',request_sha256:'request',prompt_sha256:'prompt',view_sha256:'view'}};
}
test('grouping preserves exact source/assessments and original question context while using a new combined summary',()=>{
  const input=fixture(),before=structuredClone(input),request=buildTopicGroup(input);
  assert.deepEqual(input,before);
  assert.equal(request.data.topic.card.title,input.title);
  assert.deepEqual(request.data.topic.threads.map(t=>t.id),[7,8]);
  assert.deepEqual(request.data.topic.threads[0].posts,input.sources[0].data.topic.threads[0].posts);
  assert.deepEqual(request.data.topic.threads[1].posts,input.recovered[0].topic.threads[0].posts);
  assert.deepEqual(request.data.topic.threads.map(t=>t.assessment_context.topic_id),['thread-7','thread-8']);
  assert.deepEqual(request.plan.expected_releases,{'thread-7':'release-7'});
  assert.equal(request.data.last_pulled_at,'2026-11-01T00:00:00Z');
  assert.equal(request.data.topic.points[0].first_at,'2026-10-30T10:00:00Z');
  assert.equal(Object.keys(request.plan.fingerprints).length,8);
  assert.equal(request.plan.snapshot_json,JSON.stringify(input.snapshot));
  assert.equal(sha256(JSON.stringify(JSON.parse(request.plan.snapshot_json).threads)),input.snapshot.source_sha256);
  const catalog={topics:[request.data],unavailable:[],last_pull_cutoff:null};
  for(const thread of [7,8]){
    assert.equal(catalogRoute(`#/topic/thread-${thread}`,catalog).data.topic.id,'funding');
    assert.equal(catalogRoute(`#/topic/thread-${thread}/post/${thread}/2`,catalog).post,`${thread}/2`);
  }
  assert.deepEqual(catalogRoute('#/topic/thread-7/post/8/2',catalog),{kind:'missing'});
  const pending = catalogRoute('#/topic/thread-7/post/7/99',catalog);
  assert.equal(pending.post,'7/99');
  assert.deepEqual(topicRoute(`#/topic/${pending.data.topic.id}/post/${pending.post}`,request.data.topic),{kind:'missing'});
});
test('grouping refuses changed or uncovered content and cannot silently drop threads',()=>{
  const changed=fixture();changed.recovered[0].topic.threads[0].posts[0].raw='changed';
  assert.throws(()=>buildTopicGroup(changed),{message:'topic grouping: source changed for 8/1; checked analysis required'});
  const omitted=fixture();omitted.sources[0].data.topic.threads.push({...omitted.sources[0].data.topic.threads[0],id:9,posts:[]});
  assert.throws(()=>buildTopicGroup(omitted),{message:'topic grouping: would omit part of thread-7'});
  const missing=fixture();missing.recovered=[];
  assert.throws(()=>buildTopicGroup(missing),{message:'topic grouping: no checked assessments for thread 8'});
  const title=fixture();title.title='Different';
  assert.throws(()=>buildTopicGroup(title),{message:'topic grouping: summary does not use the requested title'});
  const tampered=fixture();tampered.snapshot.source_sha256='bad';
  assert.throws(()=>buildTopicGroup(tampered),{message:'topic grouping: source snapshot identity mismatch'});
});

test('JSON object field order is immaterial when checking frozen source preservation',()=>{
  const input=fixture();
  for(const post of input.sources[0].data.topic.threads[0].posts){
    if(post.segments) post.segments=post.segments.map(segment=>Object.fromEntries(Object.entries(segment).reverse()));
  }
  assert.equal(buildTopicGroup(input).data.topic.threads.length,2);
});
