import test from 'node:test';
import assert from 'node:assert/strict';
import {historyStartDates,scopeThreadHistory} from '../tools/lib/history-scope.mjs';
import {post,random} from './helpers.mjs';
import {sha256} from '../tools/lib/jobs.mjs';
import {frozenJobs} from '../tools/lib/refresh-analysis.mjs';
import {MODEL_INPUT_FORMAT,structuredPrompt} from '../tools/lib/model-input.mjs';

const cutoff='2025-11-06T00:00:00.000Z';
const account={created_at:'2020-01-01T00:00:00Z',status:'ok'};
const snapshot=posts=>({topic:'test',threads:[{id:7,title:'Discussion',posts}],accounts:{alice:account,bob:account},source_sha256:'original'});
test('history limits reject invalid configuration and normalize exact UTC timestamps',()=>{
  assert.deepEqual(historyStartDates(undefined),{});
  assert.deepEqual(historyStartDates({'7':'2025-11-06T00:00:00Z'}),{'7':cutoff});
  for(const value of [null,[],false,'date'])assert.throws(()=>historyStartDates(value),{message:'threadHistorySince must map thread IDs to exact UTC timestamps'});
  for(const id of ['0','-1','07','1.5','9007199254740992'])assert.throws(()=>historyStartDates({[id]:cutoff}),{message:`Invalid history-scope thread ID ${JSON.stringify(id)}`});
  assert.throws(()=>historyStartDates({'7':'2025-02-30T00:00:00Z'}),{message:'Expected an exact UTC timestamp YYYY-MM-DDTHH:mm:ssZ, received "2025-02-30T00:00:00Z"'});
});
test('generated history windows retain exact source records at and after the boundary without mutating input',()=>{
  const rng=random(142),epoch=Date.parse(cutoff);
  for(let trial=0;trial<100;trial++) {
    const offsets=[-1,0,1,...Array.from({length:rng.int(0,60)},()=>rng.int(-86400000,86400000))];
    const posts=offsets.map((ms,i)=>post(i+1,i%2?'alice':'bob',new Date(epoch+ms).toISOString(),`Evidence ${i}`,{hidden:i>2&&i%4===0}));
    const source=snapshot(posts),before=structuredClone(source),scoped=scopeThreadHistory(source,{'7':cutoff});
    assert.deepEqual(source,before);
    assert.deepEqual(scoped.threads[0].posts,posts.filter((_,i)=>offsets[i]>=0));
    assert.equal(scoped.threads[0].history_since,cutoff);
    assert.equal(scoped.source_sha256,sha256(JSON.stringify(scoped.threads)));
    assert.deepEqual(scopeThreadHistory(scoped,{'7':cutoff}),scoped);
    assert.equal(scopeThreadHistory(source,{}),source);
    assert.equal(scopeThreadHistory(source,{'8':cutoff}),source);
  }
});
test('scoped requests disclose omitted history and preserve cross-boundary reply and quote claims',()=>{
  const source=snapshot([post(1,'bob','2025-11-05T23:59:59Z','Earlier evidence'),post(2,'alice',cutoff,'[quote="bob, post:1, topic:7"]\nEarlier evidence\n[/quote]\nA recent reply',{replyTo:1})]);
  const scoped=scopeThreadHistory(source,{'7':cutoff});
  assert.deepEqual(Object.keys(scoped.accounts),['alice']);
  const jobs=frozenJobs({...scoped,modelInputFormat:MODEL_INPUT_FORMAT,analysisPolicy:'reply-reuse-v1',analysisBaseline:null,importRun:'scoped'},{summary:'summary',marks:'marks'});
  for(const item of jobs){
    const data=JSON.parse(structuredPrompt(item).split('\n').find(line=>line.startsWith('{"job":')));
    assert.deepEqual(data.source.threads[0].history_scope,{created_at_on_or_after:cutoff,earlier_posts:'intentionally omitted; this is not the full thread history'});
    assert.deepEqual(data.source.threads[0].posts.map(p=>p.id),['7/2']);
    assert.equal(data.source.threads[0].posts[0].reply_target,'7/1');
    assert.deepEqual(data.source.threads[0].posts[0].segments[0].verification,{status:'unverified',source_post_id:null});
  }
  assert.throws(()=>scopeThreadHistory(source,{'7':'2027-01-01T00:00:00Z'}),{message:'Thread 7: no visible posts on or after history cutoff 2027-01-01T00:00:00.000Z'});
});
