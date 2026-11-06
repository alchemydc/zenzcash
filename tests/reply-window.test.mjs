import test from 'node:test';
import assert from 'node:assert/strict';
import {replyAnalysisSince,datedReplies,NEW_TOPIC_REPLY_POLICY} from '../tools/lib/reply-window.mjs';
import {frozenJobs} from '../tools/lib/refresh-analysis.mjs';
import {MODEL_INPUT_FORMAT} from '../tools/lib/model-input.mjs';
import {post,random} from './helpers.mjs';
import {validatePostAnalysisState,DATED_ANALYSIS_LABEL,postBrief} from '../site/js/analysis-state.js';
import {greyReasons,DEFAULT_SETTINGS} from '../site/js/logic.js';
import {postQueue} from '../site/js/speech.js';

const settings={newTopicReplyAnalysisPolicy:NEW_TOPIC_REPLY_POLICY};
test('new-topic cutoff freezes twelve calendar months, clamps leap days and leaves existing topics unchanged',()=>{
  assert.equal(replyAnalysisSince(settings,{},null,'2026-11-06T03:51:56.235Z'),'2025-11-06T03:51:56.235Z');
  assert.equal(replyAnalysisSince(settings,{},null,'2024-02-29T12:00:00Z'),'2023-02-28T12:00:00.000Z');
  assert.equal(replyAnalysisSince(settings,{}, {},'2026-11-06T00:00:00Z'),undefined);
  assert.equal(replyAnalysisSince({}, {},null,'2026-11-06T00:00:00Z'),undefined);
  assert.equal(replyAnalysisSince(settings,{replyAnalysisSince:'2025-11-06T03:51:56.235Z'},{},'2027-11-06T00:00:00Z'),'2025-11-06T03:51:56.235Z');
  assert.throws(()=>replyAnalysisSince({newTopicReplyAnalysisPolicy:'bad'},{},null,'2026-11-06T00:00:00Z'),{message:'Unknown new-topic reply policy bad'});
});
test('generated dates partition reply targets without changing full source or summary coverage',()=>{
  const rng=random(144),cutoff='2025-11-06T03:51:56.235Z',epoch=Date.parse(cutoff);
  for(let trial=0;trial<80;trial++){
    const offsets=[-1,0,1,...Array.from({length:rng.int(0,40)},()=>rng.int(-366*86400000,366*86400000))];
    const posts=offsets.map((ms,i)=>post(i+1,'alice',new Date(epoch+ms).toISOString(),`Evidence ${i}`,{hidden:i>2&&i%5===0}));
    const snapshot={topic:'window',threads:[{id:7,title:'History',posts}],analysisPolicy:'reply-reuse-v1',analysisBaseline:null,importRun:'fixture',replyAnalysisSince:cutoff,modelInputFormat:MODEL_INPUT_FORMAT};
    const before=structuredClone(snapshot),jobs=frozenJobs(snapshot,{summary:'summary',marks:'marks'});
    assert.deepEqual(snapshot,before);
    assert.deepEqual(jobs[0].job.citable,posts.filter(p=>!p.hidden).map(p=>`7/${p.number}`));
    assert.deepEqual(jobs[0].source.threads[0].posts.map(p=>p.id),posts.map(p=>`7/${p.number}`));
    assert.deepEqual(jobs.filter(j=>j.job.task==='marks').flatMap(j=>j.job.expected),posts.filter((p,i)=>!p.hidden&&offsets[i]>=0).map(p=>p.number));
    assert.deepEqual([...datedReplies(snapshot).keys()],posts.filter((p,i)=>!p.hidden&&offsets[i]<0).map(p=>`7/${p.number}`));
  }
});
test('dated state rejects fabricated assessment/provenance and remains an unscored original',()=>{
  const dated={...post(1,'alice','2024-01-01T00:00:00Z','Original evidence'),key:'7/1',analysis:null,analysis_omitted:{reason:'dated',before:'2025-01-01T00:00:00.000Z'},account:{created_at:'2020-01-01T00:00:00Z',status:'ok'}};
  validatePostAnalysisState(dated);assert.equal(postBrief(dated),DATED_ANALYSIS_LABEL);
  const queue=postQueue({topic:{id:'dated',threads:[{id:7,title:'History',posts:[dated]}]}},new Set(['7/1']),'neutral',false);
  assert.equal(queue[0].version,'original');assert.equal(queue[0].chunks.join(' ').includes('Original evidence'),true);
  assert.deepEqual(greyReasons(dated,{...DEFAULT_SETTINGS,toneBands:[],supportBands:[]},'2026-01-01T00:00:00Z'),[]);
  assert.deepEqual(greyReasons(dated,{...DEFAULT_SETTINGS,postVersions:['rewritten']},'2026-01-01T00:00:00Z'),['no re-write']);
  for(const change of [p=>{p.analysis={};},p=>{delete p.analysis;},p=>{p.analysis_run={};},p=>{p.hidden=true;},p=>{p.rendition_version='fake';},p=>{p.created_at=p.analysis_omitted.before;},p=>{p.analysis_omitted.reason='safe';},p=>{p.analysis_omitted.extra=true;},p=>{p.analysis_omitted.before='yesterday';}]){
    const invalid=structuredClone(dated);change(invalid);assert.throws(()=>validatePostAnalysisState(invalid),{message:'Invalid dated analysis state for post 7/1'});
  }
  const missing=structuredClone(dated);delete missing.analysis_omitted;
  assert.throws(()=>validatePostAnalysisState(missing),{message:'Visible post 7/1 lacks analysis or a dated omission'});
});
test('grouped histories preserve per-post dated decisions without applying one cutoff to other threads',()=>{
  const old=post(1,'alice','2024-01-01T00:00:00Z','Old source');
  const snapshot={threads:[{id:7,posts:[{...old,raw:'Edited old source'}]},{id:8,posts:[old]}],analysisBaseline:{threads:[{id:7,posts:[{...old,analysis:null,analysis_omitted:{reason:'dated',before:'2025-01-01T00:00:00.000Z'}}]},{id:8,posts:[{...old,analysis:{}}]}]}};
  assert.deepEqual([...datedReplies(snapshot)],[['7/1',{reason:'dated',before:'2025-01-01T00:00:00.000Z'}]]);
  snapshot.threads[0].posts[0].hidden=true;
  assert.deepEqual([...datedReplies(snapshot)],[]);
});
