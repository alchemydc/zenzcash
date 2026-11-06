// Build a merge request from frozen, checked sources; publication is a separate atomic command.
// node tools/group-topics.mjs INPUT.json OUTPUT.json
import { readJsonStrict, writeJsonAtomic } from './lib/fsio.mjs';
import { buildTopicGroup } from './lib/topic-group.mjs';
const [input,output,...extra]=process.argv.slice(2);
if(!input||!output||extra.length)throw new Error('usage: node tools/group-topics.mjs INPUT.json OUTPUT.json');
writeJsonAtomic(output,buildTopicGroup(readJsonStrict(input)));
console.log(`Prepared ${output}. Scan with tools/review-publication.mjs, review findings and authorize the exact file before zforum-server merge --db DATABASE --file ${output} --review REVIEW_DIRECTORY.`);
