use crate::database::{Database, Result};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::collections::BTreeMap;

fn failure(error: impl std::fmt::Display) -> String { format!("topic listing: {error}") }

pub fn listing(data: &Value) -> Result<Value> {
    let threads = data["topic"]["threads"].as_array().ok_or("listing threads missing")?;
    let mut accounts = BTreeMap::new();
    let mut count = 0;
    let mut last = None;
    for thread in threads {
        for post in thread["posts"].as_array().ok_or("listing posts missing")? {
            count += 1;
            accounts.insert(post["author"].as_str().ok_or("listing author missing")?, post["account"]["created_at"].clone());
            let date = post["created_at"].as_str().ok_or("listing post timestamp missing")?;
            if last.is_none_or(|previous| date > previous) { last = Some(date); }
        }
    }
    let mut ages = Vec::new();
    for created in accounts.values().filter_map(Value::as_str) {
        let snapshot = chrono::DateTime::parse_from_rfc3339(data["snapshot_at"].as_str().ok_or("listing snapshot missing")?).map_err(failure)?;
        let created = chrono::DateTime::parse_from_rfc3339(created).map_err(failure)?;
        ages.push((snapshot.timestamp_millis()-created.timestamp_millis()) as f64 / 86400000.0);
    }
    ages.sort_by(f64::total_cmp);
    let median = if ages.is_empty() { None } else {
        let middle = ages.len()/2;
        Some(if ages.len()%2 == 1 { ages[middle] } else { (ages[middle-1]+ages[middle])/2.0 } / 365.25)
    };
    Ok(json!({"format":"zforum-topic-listing-1","release_id":data["release_id"],"snapshot_at":data["snapshot_at"],
        "visibility_pending":false,"topic":{"id":data["topic"]["id"],"card":data["topic"]["card"],
            "threads":threads.iter().map(|thread|json!({"id":thread["id"],"title":thread["title"],"url":thread["url"]})).collect::<Vec<_>>()},
        "stats":{"threads":threads.len(),"posts":count,"participants":accounts.len(),"medianYears":median,
            "joinedRecently":ages.iter().filter(|age|**age<90.0).count(),"unknownAge":accounts.len()-ages.len(),"lastPostAt":last}}))
}

pub fn migrate(connection: &Connection) -> Result<()> {
    let tx = connection.unchecked_transaction().map_err(failure)?;
    tx.execute_batch("CREATE TABLE topic_listings(topic TEXT PRIMARY KEY REFERENCES published(topic) ON DELETE CASCADE,release TEXT NOT NULL REFERENCES releases(id),data TEXT NOT NULL);").map_err(failure)?;
    {
        let mut query = tx.prepare("SELECT p.topic,p.release,r.data FROM published p JOIN releases r ON r.id=p.release").map_err(failure)?;
        let mut rows = query.query([]).map_err(failure)?;
        while let Some(row) = rows.next().map_err(failure)? {
            let topic: String = row.get(0).map_err(failure)?;
            let release: String = row.get(1).map_err(failure)?;
            let raw: String = row.get(2).map_err(failure)?;
            let mut data: Value = serde_json::from_str(&raw).map_err(failure)?;
            data["release_id"] = json!(release);
            tx.execute("INSERT INTO topic_listings VALUES(?1,?2,?3)", params![topic,release,listing(&data)?.to_string()]).map_err(failure)?;
        }
    }
    tx.execute_batch("PRAGMA user_version=10").map_err(failure)?;
    tx.commit().map_err(failure)
}

impl Database {
    pub fn topic_list(&self) -> Result<Value> {
        let mut query = self.connection.prepare("SELECT p.topic,p.release,l.release,l.data,EXISTS(SELECT 1 FROM current_posts c JOIN restrictions x ON x.post=c.post WHERE c.topic=p.topic AND c.hidden=0) FROM published p LEFT JOIN topic_listings l ON l.topic=p.topic ORDER BY p.topic").map_err(failure)?;
        let mut rows = query.query([]).map_err(failure)?;
        let mut topics = Vec::new();
        while let Some(row) = rows.next().map_err(failure)? {
            let topic: String = row.get(0).map_err(failure)?;
            let release: String = row.get(1).map_err(failure)?;
            let listed: String = row.get(2).map_err(failure)?;
            if release != listed { return Err(format!("stale listing for {topic}")); }
            let text: String = row.get(3).map_err(failure)?;
            let mut data: Value = serde_json::from_str(&text).map_err(failure)?;
            if row.get::<_,bool>(4).map_err(failure)? {
                data["visibility_pending"] = json!(true);
                data["topic"]["card"] = json!({"title":"Discussion","byline":"Public originals remain available while analysis is refreshed.","keywords":[],"interests":data["topic"]["card"]["interests"]});
            }
            topics.push(data);
        }
        // Must match ImportStore.cutoff() in tools/lib/import-store.mjs: the next import
        // starts from this cutoff, so the page states the same one.
        let last_pull_cutoff: Option<String> = self.connection.query_row("SELECT MAX(until) FROM import_runs WHERE status='complete' AND json_extract(state,'$.scope_thread') IS NULL", [], |row| row.get(0)).map_err(failure)?;
        Ok(json!({"topics":topics,"unavailable":[],"last_pull_cutoff":last_pull_cutoff}))
    }
}
