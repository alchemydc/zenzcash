import { dirname, join } from "node:path";
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SITE_DATA_FILE } from "./lib/config.mjs";
import { writeJsonAtomic, writeFileAtomic } from "./lib/fsio.mjs";
import { INTEREST_IDS } from "../site/js/vocab.js";
import { TONE_BANDS, SUPPORT_BANDS, POST_VERSIONS, ids } from "../site/js/reader-options.js";

export const readingContract = () => ({ toneBands: ids(TONE_BANDS), supportBands: ids(SUPPORT_BANDS), postVersions: ids(POST_VERSIONS), preferredVersion: ["neutral", "original"], threadView: ["all", "thread"], postOrder: ["newest", "oldest"], interests: INTEREST_IDS });

export function buildRuntime(site) {
  const modules = readdirSync(join(site,'js')).sort();
  if (!modules.length || modules.some(name=>!name.endsWith('.js'))) throw new Error(`Expected only JavaScript modules in ${site}/js: ${JSON.stringify(modules)}`);
  const files = ['index.html','style.css',...modules.map(name=>`js/${name}`)]
    .map(path=>({path,text:readFileSync(join(site,path),'utf8')}));
  const revision = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const prefix = `/assets/${revision}`;
  let html = files[0].text;
  for (const [before,after] of [['href="style.css"',`href="${prefix}/style.css"`],['src="js/app.js"',`src="${prefix}/js/app.js"`]]) {
    if (html.split(before).length!==2) throw new Error(`Expected one ${before} reference in ${site}/index.html`);
    html=html.replace(before,after);
  }
  const runtime=join(site,'runtime');
  mkdirSync(runtime,{recursive:true});
  for (const {path,text} of files.slice(1)) writeFileAtomic(join(runtime,'assets',revision,path),text);
  // Publish entry HTML only after the complete module graph is available.
  writeFileAtomic(join(runtime,'index.html'),html);
  writeJsonAtomic(join(site,'data','reading-contract.json'),readingContract());
  return {revision,prefix};
}

if (import.meta.main) {
  const site=dirname(dirname(SITE_DATA_FILE));
  console.log(JSON.stringify(buildRuntime(site)));
}
