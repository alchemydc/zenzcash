import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ImportStore } from './lib/import-store.mjs';
import { reviewJson } from './lib/review-display.mjs';

export function threadDecisionArgs(args) {
  const flags={};
  for(let index=0;index<args.length;index+=2){const key=args[index],value=args[index+1];if(!['--db','--thread','--from','--to','--classification','--operator','--reason'].includes(key)||key in flags||!value?.trim())throw new Error(`Invalid thread-review option ${key}`);flags[key]=value;}
  if(Object.keys(flags).length!==7||!/^\d+$/.test(flags['--thread'])||!Number.isSafeInteger(Number(flags['--thread']))||Number(flags['--thread'])<1)throw new Error('usage: scripts/zforum review-thread --db PATH --thread ID --from exclude --to include --classification substantive --operator NAME --reason REASON');
  return {db:resolve(flags['--db']),change:{thread:Number(flags['--thread']),expected:flags['--from'],decision:flags['--to'],classification:flags['--classification'],operator:flags['--operator'],reason:flags['--reason']}};
}
if(import.meta.main) {
  process.umask(0o077);
  const {db,change}=threadDecisionArgs(process.argv.slice(2));
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('A human must confirm thread-review changes in an interactive terminal');
  const store=new ImportStore(db),terminal=createInterface({input:process.stdin,output:process.stdout});
  try {
    console.log(reviewJson({thread:change.thread,prior:store.threadReview(change.thread),proposed:change}));
    const phrase=`${change.decision} ${change.thread}`;
    if(await terminal.question(`Confirm the exact proposed change by typing ${phrase}: `)!==phrase)throw new Error('Thread-review change not confirmed');
    console.log(reviewJson(store.changeThreadReview(change)));
    console.log('Recorded with its prior decision. An included untracked thread is fetched in the next full import even if older than its cutoff. Explicit configuration exclusions still apply.');
  } finally {terminal.close();store.close();}
}
