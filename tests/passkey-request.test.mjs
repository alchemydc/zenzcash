import test from 'node:test';
import assert from 'node:assert/strict';
import { passkeyRequest, PASSKEY_STATUS } from '../site/js/passkey-request.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
const options = {publicKey:{challenge:'AQID',user:{id:'BAUG'}}};
const bytes = new Uint8Array([1,2,3]).buffer;
const credential = {id:'AQID',rawId:bytes,type:'public-key',response:{clientDataJSON:bytes,authenticatorData:bytes,signature:bytes,userHandle:null},getClientExtensionResults:()=>({})};
const tick = () => new Promise(resolve=>setImmediate(resolve));
function fixture(overrides = {}) {
  const calls=[], states=[];
  let flow;
  flow=passkeyRequest({
    start:async(mode,code)=>{calls.push(['start',mode,code]);return options;},
    credentials:{create:async()=>{calls.push(['create']);return credential;},get:async()=>{calls.push(['get']);return credential;}},
    finish:async()=>{calls.push(['finish']);return {csrf:'test',recovery_codes:['private']};},
    completed:async result=>{calls.push(['completed',result]);},
    ...overrides,
    changed:()=>states.push(flow.state),
  });
  return {flow,calls,states};
}

test('all four ceremonies use the correct browser operation and publish before releasing their lock', async()=>{
  for(const mode of ['register','login','add','recover']) {
    const {flow,calls,states}=fixture();
    await flow.run(mode,mode==='recover'?'code':null);
    assert.deepEqual(calls.map(call=>call[0]), ['start',mode==='login'?'get':'create','finish','completed']);
    assert.deepEqual(calls[0],['start',mode,mode==='recover'?'code':null]);
    assert.deepEqual(states.map(state=>state.phase),['starting','waiting','verifying','idle']);
    for(const state of states) assert.equal(state.message,PASSKEY_STATUS[state.phase]);
    assert.equal(flow.state.problem,null);
  }
});

test('duplicate requests cannot overwrite a challenge at any pending phase, across every mode pair',async()=>{
  for(const mode of ['register','login','add','recover']) for(const duplicate of ['register','login','add','recover']) for(const phase of ['starting','waiting','verifying']) {
    const blocked=deferred();let starts=0, finishes=0, prompts=0;
    const {flow}=fixture({
      start:async()=>{starts++;if(phase==='starting')await blocked.promise;return options;},
      credentials:Object.fromEntries(['create','get'].map(method=>[method,async()=>{prompts++;if(phase==='waiting')await blocked.promise;return credential;}])),
      finish:async()=>{finishes++;if(phase==='verifying')await blocked.promise;return {};},
    });
    const work=flow.run(mode);await tick();assert.equal(flow.state.phase,phase);
    await flow.run(duplicate);
    blocked.resolve();await work;
    assert.deepEqual([starts,prompts,finishes],[1,1,1]);assert.equal(flow.state.phase,'idle');
  }
});

test('cancel aborts start/browser work, rejects late credentials and permits retry',async()=>{
  for(const phase of ['starting','waiting']) for(const mode of ['register','login','add','recover']) {
    const blocked=deferred();let signal,finishes=0;
    const {flow}=fixture({
      start:async(_mode,_code,s)=>{signal=s;if(phase==='starting')await blocked.promise;return options;},
      credentials:Object.fromEntries(['create','get'].map(method=>[method,async args=>{assert.equal(args.signal,signal);if(phase==='waiting')await blocked.promise;return credential;}])),
      finish:async()=>{finishes++;return {};},
    });
    const work=flow.run(mode);await tick();flow.cancel();assert.equal(signal.aborted,true);
    blocked.resolve();await work;
    assert.equal(finishes,0);assert.equal(flow.state.phase,'idle');
    assert.equal(flow.state.problem,'Passkey request cancelled. You can try again.');
    await flow.run(mode);assert.equal(finishes,1);assert.equal(flow.state.problem,null);
  }
});

test('cancel during final verification cannot discard issued recovery codes',async()=>{
  const blocked=deferred();let signal;
  const {flow,calls}=fixture({start:async(_mode,_code,s)=>{signal=s;return options;},finish:()=>blocked.promise});
  const work=flow.run('register');await tick();assert.equal(flow.state.phase,'verifying');
  flow.cancel();assert.equal(signal.aborted,false);
  blocked.resolve({recovery_codes:['keep']});await work;
  assert.deepEqual(calls.at(-1),['completed',{recovery_codes:['keep']}]);
});

test('prompt timeout aborts and unlocks without finishing registration',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {flow,calls}=fixture({credentials:{get:({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}});
  const work=flow.run('login');await tick();t.mock.timers.tick(120000);await work;
  assert.equal(flow.state.problem,'Passkey request timed out. You can try again.');
  assert.equal(flow.state.phase,'idle');assert.deepEqual(calls.map(call=>call[0]),['start']);
});

test('browser cancellation, missing credential, conflicts and server failures have actionable stable errors',async()=>{
  const notAllowed='No passkey was received. The prompt may have been dismissed, timed out, or found no matching passkey. Try again using the browser or password manager where you saved it, or recover with a code.';
  const conflict='A matching passkey already exists, or your browser still has a passkey request open. Close that prompt, then sign in or try again.';
  for(const [error,expected] of [[new DOMException('raw','NotAllowedError'),notAllowed],[new DOMException('raw','InvalidStateError'),conflict],[null,notAllowed],[new Error('server offline'),'Passkey verification failed: server offline']]) {
    const {flow}=fixture({credentials:{get:async()=>{if(error)throw error;return null;}}});
    await flow.run('login');assert.equal(flow.state.problem,expected);assert.equal(flow.state.phase,'idle');
  }
  for(const stage of ['start','finish','completed']) {
    const {flow}=fixture({[stage]:async()=>{throw new Error(`${stage} failed`);}});
    await flow.run('register');assert.equal(flow.state.problem,`Passkey verification failed: ${stage} failed`);assert.equal(flow.state.phase,'idle');
  }
});
