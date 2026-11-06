import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { sha256 } from "./jobs.mjs";
import { isDeepStrictEqual } from "node:util";
import { SUPPORTED_DATABASE_SCHEMAS } from "./config.mjs";
import { publishedSummaryBaseline } from './summary-reuse.mjs';

export function importTimestamp(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text.replace(/Z$/, text.includes(".") ? "Z" : ".000Z")) {
    throw new Error(`Expected an exact UTC timestamp YYYY-MM-DDTHH:mm:ssZ, received ${JSON.stringify(text)}`);
  }
  return new Date(text).toISOString();
}

export class ImportStore {
  constructor(path, {readOnly = false} = {}) {
    this.path = path;
    this.db = new DatabaseSync(path,{readOnly});
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;");
    if (!SUPPORTED_DATABASE_SCHEMAS.includes(this.db.prepare("PRAGMA user_version").get().user_version)) {
      this.db.close(); throw new Error("Build/run the current server to migrate the database before importing");
    }
  }
  close() { this.db.close(); }
  transaction(action, {rollback=false} = {}) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec(rollback ? "ROLLBACK" : "COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  active() {
    const row = this.db.prepare("SELECT state FROM import_runs WHERE status!='complete'").get();
    return row ? JSON.parse(row.state) : null;
  }
  release(topic) {
    return this.db.prepare("SELECT release FROM published WHERE topic=?").get(topic)?.release ?? null;
  }
  published(topic) {
    const row=this.db.prepare("SELECT r.data FROM published p JOIN releases r ON r.id=p.release WHERE p.topic=?").get(topic);
    return row ? JSON.parse(row.data) : null;
  }
  cutoff() {
    return this.db.prepare("SELECT MAX(until) AS cutoff FROM import_runs WHERE status='complete' AND json_extract(state,'$.scope_thread') IS NULL").get().cutoff;
  }
  trackedThread(id) {return this.db.prepare("SELECT topic FROM import_threads WHERE thread=?").get(id)!==undefined;}
  threadReview(id) {const row=this.db.prepare("SELECT decision,classification,reason FROM import_thread_reviews WHERE thread=?").get(id);return row?{...row}:null;}
  reinstatedThreads() {return this.db.prepare("SELECT thread AS id FROM import_thread_reviews WHERE decision='include' AND thread NOT IN (SELECT thread FROM import_threads) ORDER BY thread").all().map(row=>({...row}));}
  changeThreadReview({thread,expected,decision,classification,reason,operator},clock=()=>new Date().toISOString()) {
    if(!Number.isSafeInteger(thread)||thread<1||!['include','exclude'].includes(expected)||!['include','exclude'].includes(decision)||!['substantive','frivolous','uncertain'].includes(classification)||typeof reason!=='string'||!reason.trim()||reason.length>240||typeof operator!=='string'||!operator.trim())throw new Error('Invalid thread-review replacement');
    return this.transaction(()=>{
      if(this.active()!==null)throw new Error('Finish the staged import before changing exclusions; replacement applies to a subsequent import');
      const prior=this.threadReview(thread);
      if(prior===null||prior.decision!==expected)throw new Error(`Thread ${thread}: prior decision differs from ${expected}`);
      if(this.trackedThread(thread))throw new Error(`Thread ${thread}: already published/tracked; exclusion reversal is for untracked discovery decisions`);
      const replacement={decision,classification,reason};
      this.db.prepare('INSERT INTO import_review_history(thread,recorded_at,operator,prior,replacement,reason) VALUES(?,?,?,?,?,?)').run(thread,clock(),operator,JSON.stringify(prior),JSON.stringify(replacement),reason);
      this.db.prepare('UPDATE import_thread_reviews SET decision=?,classification=?,reason=? WHERE thread=?').run(decision,classification,reason,thread);
      return {thread,prior,replacement};
    });
  }
  recordThreadReviews(threads) {
    this.transaction(()=>{for(const thread of threads){
      const previous=this.threadReview(thread.id);
      if(previous!==null&&!isDeepStrictEqual({...previous},{decision:thread.decision,classification:thread.classification,reason:thread.reason}))throw new Error(`Thread ${thread.id} review changed since staging`);
      this.db.prepare("INSERT OR IGNORE INTO import_thread_reviews VALUES(?,?,?,?)").run(thread.id,thread.decision,thread.classification,thread.reason);
    }});
  }
  assertPublicationBase(topic, baseline, candidate) {
    if (this.release(topic) === baseline) return;
    const row = this.db.prepare("SELECT r.data FROM published p JOIN releases r ON r.id=p.release WHERE p.topic=?").get(topic);
    if (row) {
      const data = JSON.parse(row.data);
      delete data.release_id;
      for (const thread of data.topic.threads) for (const post of thread.posts) {
        delete post.source_revision; delete post.rendition_version;
      }
      if (isDeepStrictEqual(data,candidate)) return;
    }
    throw new Error(`Published content for ${topic} changed since fetch; review the new release before publishing`);
  }
  begin(since, until, settings, thread) {
    const requested = since === undefined ? null : importTimestamp(since);
    const end = importTimestamp(until);
    const active = this.active();
    if (active) {
      const state = active;
      if (!(state.scope_thread === null || Number.isSafeInteger(state.scope_thread))) throw new Error(`Unfinished import ${state.id} predates staged previews; explicit migration is required`);
      if (thread !== undefined && thread !== state.scope_thread) throw new Error(`Unfinished import scope is ${state.scope_thread}; cannot switch to thread ${thread}`);
      if (requested !== null && requested !== state.since) throw new Error(`Unfinished import starts at ${state.since}; run scripts/zforum import to resume it before changing the window`);
      const {concurrency: previousConcurrency, ...previousInputs} = state.settings;
      const {concurrency, ...inputs} = settings;
      if (!isDeepStrictEqual(previousInputs,inputs)) throw new Error("Unfinished import settings/prompts differ; restore its committed configuration before resuming");
      if (concurrency !== previousConcurrency) state.settings = settings;
      state.status = "running"; delete state.error; this.save(state); return state;
    }
    const last = this.cutoff();
    if (requested === null && last === null) throw new Error("First import requires a UTC timestamp: scripts/zforum import YYYY-MM-DDTHH:mm:ssZ");
    const start = requested ?? new Date(Date.parse(last) - 300000).toISOString();
    if (start >= end) throw new Error(`Import start ${start} must precede ${end}`);
    const state = { id: randomUUID(), since: start, until: end, status: "running", scope_thread: thread ?? null, settings, discovery: null, topics: [], started_at: end, elapsed_ms: 0 };
    this.db.prepare("INSERT INTO import_runs VALUES(?,?,?,?,?)").run(state.id,start,end,state.status,JSON.stringify(state));
    return state;
  }
  save(state) {
    this.db.prepare("UPDATE import_runs SET status=?,state=? WHERE id=?").run(state.status,JSON.stringify(state),state.id);
  }
  // Existing published membership is authoritative, including maintainer-created groups.
  register(threads, {dryRun=false} = {}) {
    return this.transaction(() => {
      for (const row of this.db.prepare("SELECT r.data FROM published p JOIN releases r ON r.id=p.release").all()) {
        const data = JSON.parse(row.data);
        this.db.prepare("INSERT OR IGNORE INTO import_topics(topic) VALUES(?)").run(data.topic.id);
        for (const thread of data.topic.threads) this.db.prepare("INSERT INTO import_threads VALUES(?,?) ON CONFLICT(thread) DO UPDATE SET topic=excluded.topic").run(thread.id,data.topic.id);
      }
      for (const thread of threads) {
        if (this.db.prepare("SELECT topic FROM import_threads WHERE thread=?").get(thread.id)) continue;
        const topic = `thread-${thread.id}`;
        this.db.prepare("INSERT INTO import_topics(topic) VALUES(?)").run(topic);
        this.db.prepare("INSERT INTO import_threads VALUES(?,?)").run(thread.id,topic);
      }
      const groups = new Map();
      for (const {thread,topic} of this.db.prepare("SELECT thread,topic FROM import_threads ORDER BY thread").all()) {
        if (!groups.has(topic)) groups.set(topic,{id:topic,threadIds:[]});
        groups.get(topic).threadIds.push(thread);
      }
      return [...groups.values()];
    },{rollback:dryRun});
  }
  previous(topic) {
    const row = this.db.prepare("SELECT snapshot FROM import_topics WHERE topic=?").get(topic);
    if (row?.snapshot) return JSON.parse(row.snapshot);
    const pull = this.db.prepare("SELECT snapshot FROM source_pulls WHERE json_extract(snapshot,'$.topic')=? ORDER BY completed DESC LIMIT 1").get(topic);
    return pull ? JSON.parse(pull.snapshot) : {threads:[]};
  }
  summary(topic) {
    const row = this.db.prepare("SELECT summary FROM import_topics WHERE topic=?").get(topic);
    return row?.summary ? JSON.parse(row.summary) : null;
  }
  summaryBaseline(topic,prompt) {
    const data=this.published(topic);
    if(data===null)return null;
    const row=this.db.prepare("SELECT r.state FROM import_runs r,json_each(r.state,'$.topics') t WHERE r.status='complete' AND json_extract(t.value,'$.id')=? AND json_extract(t.value,'$.release')=? ORDER BY r.until DESC LIMIT 1").get(topic,data.release_id);
    if(!row||JSON.parse(row.state).settings.prompts.summary!==prompt)return null;
    return publishedSummaryBaseline(data,this.summary(topic),prompt);
  }
  recordSource(snapshot) {
    this.transaction(() => {
      for (const thread of snapshot.threads) {
        this.db.prepare("UPDATE import_posts SET hidden=1 WHERE thread=?").run(thread.id);
        for (const post of thread.posts) {
          if (!Number.isSafeInteger(post.forum_id) || post.forum_id < 1) throw new Error(`Missing forum post ID in ${thread.id}/${post.number}`);
          const existing = this.db.prepare("SELECT thread,number FROM import_posts WHERE id=?").get(post.forum_id);
          if (existing && (existing.thread !== thread.id || existing.number !== post.number)) throw new Error(`Forum post ${post.forum_id} moved; explicit membership reconciliation required`);
          this.db.prepare("INSERT INTO import_posts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET hidden=excluded.hidden,fingerprint=excluded.fingerprint").run(post.forum_id,thread.id,post.number,Number(post.hidden),sha256(JSON.stringify(post)));
        }
      }
      this.db.prepare("UPDATE import_topics SET snapshot=? WHERE topic=?").run(JSON.stringify(snapshot),snapshot.topic);
    });
  }
  recordSummary(topic,summary) {
    this.db.prepare("UPDATE import_topics SET summary=? WHERE topic=?").run(JSON.stringify(summary),topic);
  }
}
