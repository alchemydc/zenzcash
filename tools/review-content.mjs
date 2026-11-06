// Human-operated acknowledgment. An agent must not acknowledge its own review.
import { resolve,join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { readJsonStrict } from './lib/fsio.mjs';
import { acknowledgeReview,scanNotice } from './lib/content-review.mjs';

export function reviewAcknowledgmentArgs(args) {
  if(args.length!==10)throw new Error('usage: scripts/zforum review-content --directory DIR --candidate DIGEST --report DIGEST --operator NAME --reason REASON');
  const values={};
  for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--directory','--candidate','--report','--operator','--reason'].includes(key)||key in values||!args[i+1]?.trim())throw new Error(`Invalid acknowledgment option ${key}`);values[key]=args[i+1];}
  for(const key of ['--candidate','--report'])if(!/^[a-f0-9]{64}$/.test(values[key]))throw new Error(`${key} requires the full digest printed by preview`);
  return values;
}
if(import.meta.main) {
  process.umask(0o077);
  const values=reviewAcknowledgmentArgs(process.argv.slice(2));
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('A human must acknowledge findings in an interactive terminal; piped/agent-generated confirmation is refused');
  const directory=resolve(values['--directory']),meta=readJsonStrict(join(directory,'source-scan.json'));
  console.log(scanNotice(directory,meta));
  const phrase=`acknowledge ${values['--report']}`;
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  try {
    if(await terminal.question(`After reviewing the exact report and candidate, type ${phrase}: `)!==phrase)throw new Error('Acknowledgment not confirmed');
    acknowledgeReview(directory,meta,{candidate_digest:values['--candidate'],report_digest:values['--report'],operator:values['--operator'],reason:values['--reason']});
    console.log('Acknowledgment recorded for these exact digests. Publication remains a separate explicit step.');
  } finally {terminal.close();}
}
