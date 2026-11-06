import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonStrict } from './fsio.mjs';
import { reviewInput } from './content-review.mjs';
import { importSnapshot } from './import-preview.mjs';

export function importReviewInput(state,root) {
  const directory=join(root,state.id),snapshots=[],candidates=[],unavailable=[];
  const finalized=state.discovery!==null&&state.review?.status!=='pending'&&state.topics.every(topic=>['analyzed','published'].includes(topic.status));
  for(const topic of state.topics) {
    if(topic.status==='pending'){unavailable.push(`${topic.id}: full history not fetched`);continue;}
    snapshots.push(importSnapshot(directory,topic));
    if(['analyzed','published'].includes(topic.status)){
      const path=join(directory,topic.id,'candidate','site.json');
      if(existsSync(path))candidates.push(readJsonStrict(path));else unavailable.push(`${topic.id}: staged candidate missing`);
    }
  }
  if(state.discovery===null)unavailable.push('discovery not completed');
  if(!finalized)for(const opening of state.reviewSources??[])if(opening.availability!=='public opening')unavailable.push(`${opening.id}/1: ${opening.availability}`);
  return reviewInput({run:state.id,phase:finalized?'candidate':state.topics.length?'fetch':'discovery',discovery:state.discovery?.threads??[],openings:state.reviewSources??[],snapshots,candidates,unavailable});
}
