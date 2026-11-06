import { importTimestamp } from './import-store.mjs';
import { sha256 } from './jobs.mjs';

export function historyStartDates(value) {
  if(value===undefined)return {};
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('threadHistorySince must map thread IDs to exact UTC timestamps');
  return Object.fromEntries(Object.entries(value).map(([id,since])=>{
    if(!/^[1-9][0-9]*$/.test(id)||!Number.isSafeInteger(Number(id)))throw new Error(`Invalid history-scope thread ID ${JSON.stringify(id)}`);
    return [id,importTimestamp(since)];
  }));
}

export function scopeThreadHistory(snapshot,starts) {
  const limits=historyStartDates(starts);
  const threads=snapshot.threads.map(thread=>{
    const since=limits[thread.id];
    if(since===undefined)return thread;
    const posts=thread.posts.filter(post=>Date.parse(post.created_at)>=Date.parse(since));
    if(!posts.some(post=>!post.hidden))throw new Error(`Thread ${thread.id}: no visible posts on or after history cutoff ${since}`);
    return {...thread,history_since:since,posts};
  });
  if(threads.every((thread,index)=>thread===snapshot.threads[index]))return snapshot;
  const usernames=new Set(threads.flatMap(thread=>thread.posts.map(post=>post.username)));
  return {...snapshot,threads,source_sha256:sha256(JSON.stringify(threads)),accounts:Object.fromEntries(Object.entries(snapshot.accounts).filter(([name])=>usernames.has(name)))};
}
