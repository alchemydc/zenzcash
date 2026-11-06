import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { SITE_DATA_FORMAT } from '../site/js/vocab.js';

// A real HTTP cache, rather than CDP interception: the first release reproduces
// the old catalog contract; the second proxies the newly built application.
export async function checkCachedDeployment({send,evaluate,waitFor,capture}) {
  let upgraded=false;
  const legacyRequests=[],failures=[];
  const legacy={
    '/js/app.js': 'import {parseCatalog} from "./catalog.js"; fetch("/data/topics.json").then(r=>r.json()).then(parseCatalog).catch(error=>{document.body.textContent="Zenzcash could not load its data: "+error.message;});',
    '/js/catalog.js': `export function parseCatalog(value) { for (const data of value.topics) { if (data.format !== ${JSON.stringify(SITE_DATA_FORMAT)} || !Array.isArray(data.topic?.threads) || data.topic.threads.length === 0) throw new Error("Invalid topic data in catalog"); } return value; }`,
  };
  const server=createServer((request,response)=>{
    void (async()=>{
      const path=new URL(request.url,'http://localhost').pathname;
      if(!upgraded && path==='/'){
        response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
        response.end('<!doctype html><html><body>Loading<script type="module" src="/js/app.js"></script></body></html>');
      }else if(!upgraded && Object.hasOwn(legacy,path)){
        legacyRequests.push(path);
        response.writeHead(200,{'content-type':'text/javascript','cache-control':'public, max-age=14400'});
        response.end(legacy[path]);
      }else{
        const upstream=await fetch(`http://localhost:8017${request.url}`,{signal:AbortSignal.timeout(10000)});
        response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'text/plain','cache-control':upstream.headers.get('cache-control')??'no-store'});
        response.end(Buffer.from(await upstream.arrayBuffer()));
      }
    })().catch(error=>{failures.push(error.message);response.writeHead(502);response.end(error.message);});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://localhost:${server.address().port}`;
  try{
    for(const attempt of [1,2]){
      await send('Page.navigate',{url:`${origin}/?legacy=${attempt}`});
      await waitFor('document.body.textContent === "Zenzcash could not load its data: Invalid topic data in catalog"');
      assert.deepEqual(legacyRequests,['/js/app.js','/js/catalog.js']);
    }
    upgraded=true;
    await send('Page.navigate',{url:`${origin}/?release=new#/topics`});
    await waitFor('document.querySelector(".topic-card") !== null');
    assert.equal(await evaluate('document.body.textContent.includes("could not load its data")'),false);
    const entry=await evaluate('document.querySelector("script[type=module]").src');
    assert.match(entry,/\/assets\/[a-f0-9]{64}\/js\/app\.js$/);
    assert.deepEqual(legacyRequests,['/js/app.js','/js/catalog.js']);
    assert.deepEqual(failures,[]);
    await capture('cached-deployment-topics.png');
    console.log('Warm-cache deployment passed: old catalog failure reproduced twice, cached modules reused, new release loads without clearing cache.');
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
