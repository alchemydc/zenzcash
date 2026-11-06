import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonStrict } from './fsio.mjs';
import { reviewInput } from './content-review.mjs';
import { importSnapshot } from './import-preview.mjs';

export function importReviewInput(state,root) {
  const directory=join(root,state.id),snapshots=[],candidates=[],summarySections=[],unavailable=[];
  const finalized=state.discovery!==null&&state.review?.status!=='pending'&&state.topics.every(topic=>['analyzed','published'].includes(topic.status));
  for(const topic of state.topics) {
    if(topic.status==='pending'){unavailable.push(`${topic.id}: full history not fetched`);continue;}
    const snapshot=importSnapshot(directory,topic);snapshots.push(snapshot);
    if(['analyzed','published'].includes(topic.status)){
      const path=join(directory,topic.id,'candidate','site.json');
      if(existsSync(path)){
        candidates.push(readJsonStrict(path));
        if(snapshot.summarySectionPolicy!==undefined){
          const record=readJsonStrict(join(directory,topic.id,'candidate',`summary-${topic.id}.json`));
          if(record.summary_sections)summarySections.push(...record.summary_sections.records.map(part=>({topic:topic.id,job:part.job,input:part.input,output:part.output})));
        }
      }else unavailable.push(`${topic.id}: staged candidate missing`);
    }
  }
  if(state.discovery===null)unavailable.push('discovery not completed');
  if(!finalized)for(const opening of state.reviewSources??[])if(opening.availability!=='public opening')unavailable.push(`${opening.id}/1: ${opening.availability}`);
  return reviewInput({run:state.id,phase:finalized?'candidate':state.topics.length?'fetch':'discovery',discovery:state.discovery?.threads??[],openings:state.reviewSources??[],snapshots,candidates,summarySections,unavailable});
}
