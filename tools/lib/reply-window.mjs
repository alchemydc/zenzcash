import { calendarCutoff } from '../../site/js/logic.js';
import { validatePostAnalysisState } from '../../site/js/analysis-state.js';
import { importTimestamp } from './import-time.mjs';
import { postKey } from './jobs.mjs';

export const NEW_TOPIC_REPLY_POLICY='new-topics-one-year-v1';

export function replyAnalysisSince(settings,previous,baseline,until) {
  if(settings.newTopicReplyAnalysisPolicy!==undefined&&settings.newTopicReplyAnalysisPolicy!==NEW_TOPIC_REPLY_POLICY)throw new Error(`Unknown new-topic reply policy ${settings.newTopicReplyAnalysisPolicy}`);
  if(previous.replyAnalysisSince!==undefined)return importTimestamp(previous.replyAnalysisSince);
  if(settings.newTopicReplyAnalysisPolicy===NEW_TOPIC_REPLY_POLICY&&baseline===null)return new Date(calendarCutoff(importTimestamp(until),12)).toISOString();
  return undefined;
}

// Accepted assessments survive age boundaries. Omitted historical replies remain
// source records, including when they are edited or a grouped topic is refreshed.
export function datedReplies(snapshot) {
  const since=snapshot.replyAnalysisSince===undefined?undefined:importTimestamp(snapshot.replyAnalysisSince);
  const prior=new Map();
  for(const thread of snapshot.analysisBaseline?.threads??[])for(const post of thread.posts){
    validatePostAnalysisState(post);
    prior.set(postKey(thread.id,post.number),post);
  }
  const dated=new Map();
  for(const thread of snapshot.threads)for(const post of thread.posts){
    if(post.hidden)continue;
    const key=postKey(thread.id,post.number),old=prior.get(key);
    if(old?.analysis!==null&&old?.analysis!==undefined)continue;
    const cutoff=old?.analysis_omitted?.before??since;
    if(cutoff!==undefined&&Date.parse(post.created_at)<Date.parse(cutoff))dated.set(key,{reason:'dated',before:cutoff});
  }
  return dated;
}
