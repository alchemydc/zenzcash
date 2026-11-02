use rusqlite::{OptionalExtension, Transaction, params};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MergeRequest { pub data: Value, pub plan: MergePlan }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MergePlan {
    pub expected_releases: BTreeMap<String, String>,
    pub snapshot: Value,
    pub snapshot_json: String,
    pub summary: Value,
    pub fingerprints: BTreeMap<u64,String>,
}

// Called inside publication's transaction. Any refusal rolls back all membership changes.
pub fn apply(tx: &Transaction<'_>, data: &Value, plan: &MergePlan) -> Result<(), String> {
    let fail = |e: rusqlite::Error| format!("topic merge: {e}");
    let topic=data["topic"]["id"].as_str().ok_or("merge topic missing")?;
    let serialized:Value=serde_json::from_str(&plan.snapshot_json).map_err(|e|format!("invalid serialized merge snapshot: {e}"))?;
    if serialized!=plan.snapshot { return Err("serialized merge snapshot differs from checked snapshot".into()); }
    if plan.expected_releases.is_empty() { return Err("merge requires expected source releases".into()); }
    let active: bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM import_runs WHERE status!='complete')",[],|r|r.get(0)).map_err(fail)?;
    if active { return Err("finish the active import before merging topics".into()); }
    let existing: bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM published WHERE topic=?1)",[topic],|r|r.get(0)).map_err(fail)?;
    if existing && !plan.expected_releases.contains_key(topic) { return Err(format!("merge target {topic} already exists outside the source releases")); }
    if plan.snapshot["topic"]!=topic || plan.summary["topic"]!=topic || plan.snapshot["source_sha256"]!=data["source_sha256"] {
        return Err("merge source/summary identity mismatch".into());
    }
    let threads=data["topic"]["threads"].as_array().ok_or("merge threads missing")?;
    let sources=plan.snapshot["threads"].as_array().ok_or("merge source threads missing")?;
    let mut ids=BTreeSet::new();
    for thread in threads {
        let id=thread["id"].as_u64().filter(|id|*id>0).ok_or("merge thread id invalid")?;
        if !ids.insert(id) { return Err(format!("duplicate merge thread {id}")); }
        let source=sources.iter().find(|s|s["id"]==id).ok_or_else(||format!("merge source thread {id} missing"))?;
        let posts=thread["posts"].as_array().ok_or("merge posts missing")?;
        let originals=source["posts"].as_array().ok_or("merge source posts missing")?;
        if posts.len()!=originals.len() { return Err(format!("merge source coverage differs for thread {id}")); }
        for post in posts {
            let number=post["number"].as_u64().filter(|n|*n>0).ok_or("merge post number invalid")?;
            let original=originals.iter().find(|p|p["number"]==number).ok_or_else(||format!("merge source post {id}/{number} missing"))?;
            if post["key"]!=format!("{id}/{number}") || post["author"]!=original["username"] || ["raw","own_text","segments","hidden","reply_to","created_at"].iter().any(|field|post[*field]!=original[*field]) {
                return Err(format!("merge source differs for {id}/{number}"));
            }
            if original["forum_id"].as_u64().filter(|id|*id>0).is_none() || !original["hidden"].is_boolean() { return Err(format!("merge source identity invalid for {id}/{number}")); }
        }
    }
    if sources.len()!=ids.len() { return Err("merge source thread coverage differs".into()); }
    for (old,expected) in &plan.expected_releases {
        let row: Option<(String,String)>=tx.query_row("SELECT p.release,r.data FROM published p JOIN releases r ON r.id=p.release WHERE p.topic=?1",[old],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(fail)?;
        let Some((release,text))=row else { return Err(format!("merge source topic {old} is no longer published")); };
        if &release!=expected { return Err(format!("merge source topic {old} changed; prepare again")); }
        let previous: Value=serde_json::from_str(&text).map_err(|e|format!("merge source {old}: {e}"))?;
        for old_thread in previous["topic"]["threads"].as_array().ok_or("published source threads missing")? {
            let thread=threads.iter().find(|t|t["id"]==old_thread["id"]).ok_or_else(||format!("merge omits a thread from {old}"))?;
            if thread["posts"]!=old_thread["posts"] { return Err(format!("merge changes published posts in {old}; update them separately")); }
        }
    }
    tx.execute("INSERT INTO import_topics(topic,snapshot,summary) VALUES(?1,?2,?3) ON CONFLICT(topic) DO UPDATE SET snapshot=excluded.snapshot,summary=excluded.summary",params![topic,plan.snapshot_json,plan.summary.to_string()]).map_err(fail)?;
    for thread in sources {
        let id=thread["id"].as_u64().ok_or("merge source thread id invalid")?;
        let owner:Option<String>=tx.query_row("SELECT topic FROM import_threads WHERE thread=?1",[id],|r|r.get(0)).optional().map_err(fail)?;
        if owner.as_ref().is_some_and(|old|old!=topic && !plan.expected_releases.contains_key(old)) { return Err(format!("thread {id} belongs to another tracked topic")); }
        tx.execute("INSERT INTO import_threads(thread,topic) VALUES(?1,?2) ON CONFLICT(thread) DO UPDATE SET topic=excluded.topic",params![id,topic]).map_err(fail)?;
        for post in thread["posts"].as_array().ok_or("merge source posts missing")? {
            let forum_id=post["forum_id"].as_u64().ok_or("merge forum id missing")?;
            let number=post["number"].as_u64().ok_or("merge source number missing")?;
            let identity:Option<(u64,u64)>=tx.query_row("SELECT thread,number FROM import_posts WHERE id=?1",[forum_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(fail)?;
            if identity.is_some_and(|old|old!=(id,number)) { return Err(format!("forum post {forum_id} already has a different identity")); }
            let fingerprint=plan.fingerprints.get(&forum_id).ok_or_else(||format!("missing source fingerprint for forum post {forum_id}"))?;
            if fingerprint.len()!=64 || !fingerprint.bytes().all(|c|c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) { return Err(format!("invalid source fingerprint for forum post {forum_id}")); }
            tx.execute("INSERT INTO import_posts(id,thread,number,hidden,fingerprint) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO NOTHING",params![forum_id,id,number,post["hidden"].as_bool().ok_or("merge visibility missing")?,fingerprint]).map_err(fail)?;
        }
    }
    for old in plan.expected_releases.keys() {
        tx.execute("DELETE FROM current_posts WHERE topic=?1",[old]).map_err(fail)?;
        tx.execute("DELETE FROM published WHERE topic=?1",[old]).map_err(fail)?;
        if old!=topic {
            tx.execute("DELETE FROM import_topics WHERE topic=?1",[old]).map_err(fail)?;
        }
    }
    Ok(())
}
