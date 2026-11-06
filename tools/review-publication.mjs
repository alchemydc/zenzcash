// Review existing single-topic/merge artifacts without regeneration or publication.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readJsonStrict } from './lib/fsio.mjs';
import { sha256 } from './lib/jobs.mjs';
import { reviewInput,scanReview,scanNotice,authorizePublication } from './lib/content-review.mjs';

export function fileReviewInput(file) {
  const value=readJsonStrict(file);
  if(value.format==='zforum-publication-1')throw new Error('Imports must use import preview/publish to validate all frozen source artifacts');
  const data=value.data??value;
  if(!data.topic||!Array.isArray(data.topic.threads))throw new Error('Expected a complete topic or merge file');
  return reviewInput({run:`file-${sha256(readFileSync(file,'utf8'))}`,phase:'candidate',snapshots:value.plan?[value.plan.snapshot]:[],candidates:[data]});
}
if(import.meta.main) {
  process.umask(0o077);
  const [command,path,review,...extra]=process.argv.slice(2);
  if(!['scan','authorize'].includes(command)||!path||!review||extra.length)throw new Error('usage: node tools/review-publication.mjs scan|authorize FILE REVIEW_DIRECTORY');
  const file=resolve(path),directory=resolve(review),input=fileReviewInput(file);
  if(command==='scan')console.log(scanNotice(directory,scanReview(directory,input)));
  else {authorizePublication(directory,input,file);console.log(`Review evidence prepared. The explicit publication command requires --review ${directory}.`);}
}
