import {checker} from './checker.mjs';
import {readJsonStrict} from './fsio.mjs';
import { REVIEW_INSTRUCTIONS } from './review-display.mjs';

export async function newThreadReview(state,store,get) {
  const candidates=state.discovery.threads.filter(t=>!store.trackedThread(t.id)&&store.threadReview(t.id)===null);
  if(!candidates.length)return null;
  const threads=[];
  state.reviewSources=[];
  for(const thread of candidates) {
    const response=await get(`/t/${thread.id}.json?include_raw=true`);
    let title=thread.title??`Thread ${thread.id}`,excerpt='',raw='';
    if(!response.unavailable) {
      const topic=response.body;
      if(topic.id!==thread.id||typeof topic.title!=='string'||!Array.isArray(topic.post_stream?.posts))throw new Error(`Thread ${thread.id}: invalid new-thread review response`);
      title=topic.title;
      const opening=topic.post_stream.posts.find(p=>p.post_number===1);
      if(opening&&opening.hidden===false&&!opening.deleted_at){if(typeof opening.raw!=='string')throw new Error(`Thread ${thread.id}: public opening text missing`);raw=opening.raw;excerpt=[...raw].slice(0,600).join('');}
    }
    state.reviewSources.push({id:thread.id,title,raw,availability:response.unavailable?'unavailable':raw===''?'opening unavailable or empty':'public opening'});
    threads.push({id:thread.id,title:[...title].slice(0,180).join(''),excerpt,classification:'unreviewed',decision:'pending',reason:''});
  }
  return {status:'pending',format:'zforum-thread-review-1',run:state.id,threads};
}

export function threadReviewPacket(review) {
  return {format:'zforum-thread-review-2',run:review.run,instructions:REVIEW_INSTRUCTIONS,source_label:'untrusted_forum_content',
    threads:review.threads.map(({excerpt,...thread})=>({...thread,opening_excerpt:excerpt}))};
}

export function acceptThreadReview(path,pending,store) {
  const reviewed=validateThreadReview(readJsonStrict(path),pending);
  store.recordThreadReviews(reviewed.threads);
  return reviewed;
}

export function validateThreadReview(value,pending) {
  if(value?.format==='zforum-thread-review-2') {
    if(Object.keys(value).sort().join(',')!=='format,instructions,run,source_label,threads'||value.instructions!==REVIEW_INSTRUCTIONS||value.source_label!=='untrusted_forum_content'||!Array.isArray(value.threads))throw new Error('Invalid labelled new-thread review');
    value={format:'zforum-thread-review-1',run:value.run,threads:value.threads.map(entry=>{
      if(Object.keys(entry).sort().join(',')!=='classification,decision,id,opening_excerpt,reason,title')throw new Error('Invalid labelled thread source');
      const {opening_excerpt,...thread}=entry;return {...thread,excerpt:opening_excerpt};
    })};
  }
  const {problems,exactKeys,text}=checker();
  if(!exactKeys(value,['format','run','threads'],'review'))throw new Error(problems.join('; '));
  if(value.format!=='zforum-thread-review-1'||value.run!==pending.run||!Array.isArray(value.threads)||value.threads.length!==pending.threads.length)throw new Error('New-thread review does not match the staged run');
  if(new Set(value.threads.map(t=>t?.id)).size!==value.threads.length)throw new Error('New-thread review repeats thread IDs');
  for(const [index,entry]of value.threads.entries()) {
    if(!exactKeys(entry,['id','title','excerpt','classification','decision','reason'],`review.threads[${index}]`))continue;
    const source=pending.threads[index];
    if(!Number.isSafeInteger(entry.id)||entry.id<1||typeof entry.title!=='string'||[...entry.title].length>180||typeof entry.excerpt!=='string'||[...entry.excerpt].length>600)throw new Error(`Invalid bounded review source for thread ${entry.id}`);
    if(entry.id!==source.id||entry.title!==source.title||entry.excerpt!==source.excerpt)throw new Error(`New-thread review source changed at position ${index}`);
    if(!['substantive','frivolous','uncertain'].includes(entry.classification))throw new Error(`Thread ${entry.id}: choose substantive, frivolous or uncertain`);
    if(!['include','exclude'].includes(entry.decision))throw new Error(`Thread ${entry.id}: confirmation must choose include or exclude`);
    text(entry.reason,240,`thread ${entry.id} reason`);
  }
  if(problems.length)throw new Error(problems.join('; '));
  return {status:'confirmed',...value};
}
