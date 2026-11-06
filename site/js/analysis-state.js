export const DATED_ANALYSIS_LABEL='Not analyzed · dated post';

export function validatePostAnalysisState(post,{originalsOnly=false}={}) {
  const omitted=post.analysis_omitted;
  if(omitted!==undefined){
    const valid=omitted!==null&&typeof omitted==='object'&&!Array.isArray(omitted)&&Object.keys(omitted).sort().join(',')==='before,reason'&&omitted.reason==='dated'&&typeof omitted.before==='string'&&Number.isFinite(Date.parse(omitted.before))&&new Date(omitted.before).toISOString()===omitted.before;
    if(!valid||post.hidden||post.analysis!==null||post.analysis_run!==undefined||!(post.rendition_version===undefined||post.rendition_version===null)||!Number.isFinite(Date.parse(post.created_at))||Date.parse(post.created_at)>=Date.parse(omitted.before))throw new Error(`Invalid dated analysis state for post ${post.key??post.number}`);
  }else if(post.hidden||originalsOnly){
    if(post.analysis!==null)throw new Error(`Original-only post ${post.key??post.number} contains analysis`);
  }else if(post.analysis===null||typeof post.analysis!=='object'||Array.isArray(post.analysis))throw new Error(`Visible post ${post.key??post.number} lacks analysis or a dated omission`);
}

export const postBrief=post=>post.analysis===null?DATED_ANALYSIS_LABEL:post.analysis.summary;
