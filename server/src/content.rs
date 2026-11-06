use crate::database::{Database, Result, hash, now};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};

use crate::SITE_DATA_FORMAT;
const WITHHELD: &str = "Content temporarily unavailable: forum visibility changed; a checked release is pending.";
fn topic_id(value: &str) -> Result<&str> {
    if value.is_empty() || value == "topics" || value.len() > 80 || !value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') {
        return Err(format!("invalid topic id {value:?}"));
    }
    Ok(value)
}
fn failure(error: impl std::fmt::Display) -> String {
    format!("content store: {error}")
}
impl Database {
    pub fn reset_content(&mut self) -> Result<()> {
        self.connection.execute_batch("BEGIN IMMEDIATE;
            DELETE FROM feedback; DELETE FROM feedback_signed_v1;
            DELETE FROM feedback_clears; DELETE FROM feedback_clears_signed_v1;
            DELETE FROM moods; DELETE FROM ratings; DELETE FROM reading;
            DELETE FROM current_posts; DELETE FROM renditions; DELETE FROM source_revisions;
            DELETE FROM published; DELETE FROM releases; DELETE FROM restrictions;
            DELETE FROM source_pulls; DELETE FROM historical;
            DELETE FROM import_posts; DELETE FROM import_threads; DELETE FROM import_topics;
            DELETE FROM import_runs; COMMIT;").map_err(failure)
    }
    pub fn published(&self, topic: &str) -> Result<Value> {
        topic_id(topic)?;
        let (text, restrictions): (String,String) = self
            .connection
            .query_row(
                "SELECT r.data,(SELECT json_group_array(x.post) FROM restrictions x JOIN current_posts c ON c.post=x.post WHERE c.topic=?1) FROM releases r JOIN published p ON p.release=r.id WHERE p.topic=?1",
                [topic],
                |row| Ok((row.get(0)?,row.get(1)?)),
            )
            .map_err(failure)?;
        let value: Value = serde_json::from_str(&text).map_err(failure)?;
        let restricted=serde_json::from_str(&restrictions).map_err(failure)?;
        crate::visibility::protect(value,&restricted)
    }
    pub fn record_pull(&self, snapshot: Value) -> Result<()> {
        topic_id(snapshot["topic"].as_str().ok_or("pull topic missing")?)?;
        let completed = snapshot["snapshotAt"]
            .as_str()
            .ok_or("pull completion timestamp missing")?;
        let end = chrono::DateTime::parse_from_rfc3339(completed).map_err(failure)?;
        let threads = snapshot["threads"]
            .as_array()
            .ok_or("pull threads missing")?;
        let pulls = snapshot["pulls"]
            .as_array()
            .ok_or("per-thread pull metadata missing")?;
        if threads.is_empty() || threads.len() != pulls.len() || !snapshot["accounts"].is_object() {
            return Err("incomplete forum pull".into());
        }
        let mut seen = std::collections::BTreeSet::new();
        for (thread, pull) in threads.iter().zip(pulls) {
            let id = thread["id"].as_u64().ok_or("invalid thread id")?;
            if !seen.insert(id) || pull["thread"] != id || !thread["posts"].is_array() {
                return Err("pull membership mismatch".into());
            }
            let date = chrono::DateTime::parse_from_rfc3339(
                pull["pulled_at"]
                    .as_str()
                    .ok_or("thread pull time missing")?,
            )
            .map_err(failure)?;
            if date > end {
                return Err("thread pull completed after snapshot".into());
            }
        }
        let text = snapshot.to_string();
        self.connection
            .execute(
                "INSERT OR IGNORE INTO source_pulls(id,snapshot,completed) VALUES(?1,?2,?3)",
            params![hash(&text), text, end.with_timezone(&chrono::Utc).to_rfc3339()],
            )
            .map_err(failure)?;
        Ok(())
    }
    pub fn check_visibility(&self, value: &Value) -> Result<()> {
        let mut query = self
            .connection
            .prepare("SELECT post FROM restrictions")
            .map_err(failure)?;
        let restricted = query
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(failure)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(failure)?;
        if value["topic"]["threads"]
            .as_array()
            .ok_or("content threads missing")?
            .iter()
            .flat_map(|thread| thread["posts"].as_array().into_iter().flatten())
            .any(|post| post["hidden"] == false && restricted.iter().any(|key| post["key"] == *key))
        {
            return Err(WITHHELD.into());
        }
        Ok(())
    }
    pub fn restrict(&mut self, keys: &[String]) -> Result<()> {
        let tx = self.connection.savepoint().map_err(failure)?;
        for key in keys {
            crate::account_types::post_key(key)?;
            tx.execute("INSERT INTO restrictions(post,observed) VALUES(?1,?2) ON CONFLICT(post) DO UPDATE SET observed=excluded.observed", params![key, now()]).map_err(failure)?;
        }
        tx.commit().map_err(failure)
    }
    pub fn publish(&mut self, data: Value) -> Result<String> { self.publish_with_merge(data, None) }
    pub fn merge(&mut self, request: crate::merge::MergeRequest) -> Result<String> { self.publish_with_merge(request.data, Some(request.plan)) }
    fn publish_with_merge(&mut self, mut data: Value, merge: Option<crate::merge::MergePlan>) -> Result<String> {
        let topic = topic_id(data["topic"]["id"].as_str().ok_or("content topic id missing")?)?.to_owned();
        if data["format"] != SITE_DATA_FORMAT {
            return Err("unsupported content format".into());
        }
        self.check_visibility(&data)?;
        let models = data["models"].to_string();
        let threads = data["topic"]["threads"]
            .as_array_mut()
            .ok_or("content threads missing")?;
        let mut seen = std::collections::BTreeSet::new();
        let mut records = Vec::new();
        for thread in threads {
            for post in thread["posts"]
                .as_array_mut()
                .ok_or("thread posts missing")?
            {
                let key = post["key"].as_str().ok_or("post key missing")?.to_owned();
                crate::account_types::post_key(&key)?;
                if !seen.insert(key.clone()) {
                    return Err(format!("duplicate post {key}"));
                }
                let hidden = post["hidden"].as_bool().ok_or("hidden must be boolean")?;
                if hidden
                    && (!post["raw"].is_null()
                        || !post["analysis"].is_null()
                        || !post["segments"].is_null()
                        || !post["own_text"].is_null())
                {
                    return Err(format!("hidden post {key} contains source or derived text"));
                }
                if !hidden && (!post["raw"].is_string() || !post["analysis"].is_object()) {
                    return Err(format!("visible post {key} lacks original or analysis"));
                }
                let source_data = json!([
                    key,
                    post["raw"],
                    post["reply_to"],
                    post["author"],
                    post["created_at"]
                ]);
                let source = hash(&source_data.to_string());
                let rendition = post["analysis"]["neutral_rendition"].as_str().map(|text| {
                    (
                        hash(&json!([key, source, text]).to_string()),
                        text.to_owned(),
                    )
                });
                post["source_revision"] = json!(source);
                post["rendition_version"] = json!(rendition.as_ref().map(|(id, _)| id));
                let run = post
                    .get("analysis_run")
                    .map(Value::to_string)
                    .unwrap_or_else(|| models.clone());
                records.push((key, hidden, source, source_data.to_string(), rendition, run));
            }
        }
        let id = hash(&data.to_string());
        data["release_id"] = json!(id);
        let tx = self.connection.savepoint().map_err(failure)?;
        if let Some(plan)=merge { crate::merge::apply(&tx,&data,&plan)?; }
        tx.execute(
            "INSERT OR IGNORE INTO releases(id,data,created) VALUES(?1,?2,?3)",
            params![id, data.to_string(), now()],
        )
        .map_err(failure)?;
        tx.execute("DELETE FROM current_posts WHERE topic=?1", [&topic])
            .map_err(failure)?;
        for (key, hidden, source, source_data, rendition, run) in records {
            tx.execute(
                "INSERT OR IGNORE INTO source_revisions(id,post,data) VALUES(?1,?2,?3)",
                params![source, key, source_data],
            )
            .map_err(failure)?;
            tx.execute(
                "INSERT INTO current_posts(post,hidden,source,rendition,topic) VALUES(?1,?2,?3,?4,?5)",
                params![key, hidden, source, rendition.as_ref().map(|(id, _)| id), topic],
            )
            .map_err(failure)?;
            if let Some((id, text)) = rendition {
                tx.execute("INSERT OR IGNORE INTO renditions(id,post,source,run,text) VALUES(?1,?2,?3,?4,?5)", params![id,key,source,run,text]).map_err(failure)?;
            }
        }
        tx.execute("INSERT INTO published(topic,release) VALUES(?1,?2) ON CONFLICT(topic) DO UPDATE SET release=excluded.release", params![topic,id]).map_err(failure)?;
        tx.execute("INSERT INTO topic_listings(topic,release,data) VALUES(?1,?2,?3) ON CONFLICT(topic) DO UPDATE SET release=excluded.release,data=excluded.data",
            params![topic,id,crate::listing::listing(&data)?.to_string()]).map_err(failure)?;
        tx.commit().map_err(failure)?;
        Ok(id)
    }
    pub fn rollback(&mut self, id: &str) -> Result<String> {
        let text: String = self
            .connection
            .query_row("SELECT data FROM releases WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .map_err(failure)?;
        let mut value: Value = serde_json::from_str(&text).map_err(failure)?;
        value
            .as_object_mut()
            .ok_or("release is not an object")?
            .remove("release_id");
        self.publish(value)
    }
    pub fn has_release(&self, topic: &str) -> Result<bool> {
        Ok(self
            .connection
            .query_row("SELECT release FROM published WHERE topic=?1", [topic], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(failure)?
            .is_some())
    }
    pub fn visible(&self, key: &str) -> Result<bool> {
        self.connection.query_row("SELECT EXISTS(SELECT 1 FROM available_posts WHERE post=?1)", [key], |row| row.get::<_,bool>(0)).map_err(failure)
    }
}
