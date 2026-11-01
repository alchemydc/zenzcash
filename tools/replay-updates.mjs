// Replays recorded public source through the real reconciler. No network, model or DB writes.
import assert from "node:assert/strict";
import { join } from "node:path";
import { IMPORT_TOPICS, WORK_DIR } from "./lib/config.mjs";
import { readJsonStrict, writeJsonAtomic } from "./lib/fsio.mjs";
import { fetchSnapshot, sourceChanges } from "./lib/refresh-source.mjs";

export function recordedForum(snapshot, { failBatchAfter = Infinity } = {}) {
  let batches = 0;
  return async (path) => {
    const url = new URL(path, "https://recorded.invalid");
    if (url.pathname.startsWith("/u/")) {
      const username = decodeURIComponent(url.pathname.slice(3, -5));
      const account = snapshot.accounts[username];
      if (!account) throw new Error(`replay has no account ${username}`);
      return account.created_at === null ? { unavailable: 404 } : { body: { user: { created_at: account.created_at } } };
    }
    const match = /^\/t\/(\d+)(\.json|\/posts\.json)$/.exec(url.pathname);
    if (!match) throw new Error(`unexpected replay request ${path}`);
    const thread = snapshot.threads.find((thread) => thread.id === Number(match[1]));
    if (!thread) return { unavailable: 404 };
    if (match[2] === ".json") return { body: { ...thread, post_stream: { stream: thread.posts.map((post) => post.number) } } };
    if (batches++ >= failBatchAfter) throw new Error("simulated interrupted post batch");
    const requested = new Set(url.searchParams.getAll("post_ids[]").map(Number));
    return { body: { post_stream: { posts: thread.posts.filter((post) => requested.has(post.number)).map((post) => ({ id: post.number, post_type: 1, post_number: post.number, username: post.username, created_at: post.created_at, reply_to_post_number: post.reply_to, hidden: post.hidden, ...(!post.hidden ? { raw: post.raw } : {}) })) } } };
  };
}

export async function replayWeek(run) {
  if (typeof run !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(run)) throw new Error(`invalid replay run ${JSON.stringify(run)}`);
  const root = join(WORK_DIR,"refresh"), discovery = readJsonStrict(join(root,run,"discovery.json"));
  const report = { kind: "recorded-source-replay", historical_snapshot: false, note: "Baseline omits posts created during the window from today's complete snapshots. Older edits and profile states are not reconstructed. Edits/removals/interruption below are synthetic local cases.", since: discovery.since, topics: [] };
  for (const topic of IMPORT_TOPICS) {
    const full = readJsonStrict(join(root,`${run}-${topic.id}`,"snapshot.json"));
    const before = { ...full, threads: full.threads.map((thread) => ({ ...thread, posts: thread.posts.filter((post) => Date.parse(post.created_at) < Date.parse(discovery.since)) })) };
    const baseline = before.threads.every(thread=>thread.posts.length===0) ? {threads:[]} : await fetchSnapshot({get:recordedForum(before),previous:{threads:[]},topic,restrict:async()=>{},checkpoint:async()=>{},clock:()=>discovery.since});
    const current = await fetchSnapshot({get:recordedForum(full),previous:baseline,topic,restrict:async()=>{},checkpoint:async()=>{},clock:()=>full.snapshotAt});
    const changes = sourceChanges(baseline,current);
    assert.deepEqual(changes.added,full.threads.flatMap(thread=>thread.posts.filter(post=>Date.parse(post.created_at)>=Date.parse(discovery.since)).map(post=>`${thread.id}/${post.number}`)));
    const repeat = await fetchSnapshot({get:recordedForum(full),previous:current,topic,restrict:async()=>{},checkpoint:async()=>{},clock:()=>full.snapshotAt});
    assert.deepEqual(sourceChanges(current,repeat),{added:[],changed:[],unavailable:[]});
    report.topics.push({topic:topic.id,new_topic:baseline.threads.length===0,changes,repeat:{added:0,changed:0,unavailable:0}});
  }
  const topic = IMPORT_TOPICS.find(topic=>topic.id === "konclave");
  const full = readJsonStrict(join(root,`${run}-${topic.id}`,"snapshot.json"));
  const changed = structuredClone(full), posts = changed.threads[0].posts;
  const editedKey=`${topic.threadIds[0]}/${posts[0].number}`, hiddenKey=`${topic.threadIds[0]}/${posts[1].number}`, removedKey=`${topic.threadIds[0]}/${posts[2].number}`;
  posts[0].raw += "\nDevelopment replay correction.";
  posts[1].hidden=true;posts[1].raw=null;posts.splice(2,1);
  const restricted = [];
  const options={previous:full,topic,restrict:async(keys)=>restricted.push(...keys),checkpoint:async()=>{},clock:()=>full.snapshotAt};
  const edited = await fetchSnapshot({...options,get:recordedForum(changed)});
  assert.deepEqual(sourceChanges(full,edited),{added:[],changed:[editedKey],unavailable:[hiddenKey,removedKey]});
  restricted.length=0;
  await assert.rejects(fetchSnapshot({...options,get:recordedForum(changed,{failBatchAfter:1})}),/simulated interrupted post batch/);
  assert.ok(restricted.includes(hiddenKey));
  report.synthetic={edited:editedKey,hidden:hiddenKey,removed:removedKey,interrupted_pull_rejected:true,hidden_restricted_before_failure:true};
  writeJsonAtomic(join(root,run,"replay-report.json"),report);
  return report;
}
if(import.meta.main) console.log(JSON.stringify(await replayWeek(process.argv[2]),null,2));
