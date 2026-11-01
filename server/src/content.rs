use crate::database::{Database, Result, hash, now};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};

use crate::SITE_DATA_FORMAT;
fn failure(error: impl std::fmt::Display) -> String {
    format!("content store: {error}")
}
impl Database {
    pub fn published(&self) -> Result<Value> {
        let text: String = self
            .connection
            .query_row(
                "SELECT r.data FROM releases r JOIN published p ON p.release=r.id",
                [],
                |row| row.get(0),
            )
            .map_err(failure)?;
        let mut value: Value = serde_json::from_str(&text).map_err(failure)?;
        self.check_visibility(&value)?;
        let latest: Option<String> = self
            .connection
            .query_row(
                "SELECT snapshot FROM source_pulls ORDER BY completed DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(failure)?;
        if let Some(latest) = latest {
            let snapshot: Value = serde_json::from_str(&latest).map_err(failure)?;
            let ids = |threads: &Value| -> Vec<Value> {
                threads
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|thread| thread["id"].clone())
                    .collect()
            };
            if ids(&snapshot["threads"]) == ids(&value["topic"]["threads"]) {
                value["last_pulled_at"] = snapshot["snapshotAt"].clone();
                value["analysis_pending"] = json!(snapshot["snapshotAt"] != value["snapshot_at"]);
            }
        }
        Ok(value)
    }
    pub fn record_pull(&self, snapshot: Value) -> Result<()> {
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
            return Err("Content temporarily unavailable: forum visibility changed; a checked release is pending.".into());
        }
        Ok(())
    }
    pub fn restrict(&mut self, keys: &[String]) -> Result<()> {
        let tx = self.connection.transaction().map_err(failure)?;
        for key in keys {
            crate::account_types::post_key(key)?;
            tx.execute("INSERT INTO restrictions(post,observed) VALUES(?1,?2) ON CONFLICT(post) DO UPDATE SET observed=excluded.observed", params![key, now()]).map_err(failure)?;
        }
        tx.commit().map_err(failure)
    }
    pub fn publish(&mut self, mut data: Value) -> Result<String> {
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
        let tx = self.connection.transaction().map_err(failure)?;
        tx.execute(
            "INSERT OR IGNORE INTO releases(id,data,created) VALUES(?1,?2,?3)",
            params![id, data.to_string(), now()],
        )
        .map_err(failure)?;
        tx.execute("DELETE FROM current_posts", [])
            .map_err(failure)?;
        for (key, hidden, source, source_data, rendition, run) in records {
            tx.execute(
                "INSERT OR IGNORE INTO source_revisions(id,post,data) VALUES(?1,?2,?3)",
                params![source, key, source_data],
            )
            .map_err(failure)?;
            tx.execute(
                "INSERT INTO current_posts(post,hidden,source,rendition) VALUES(?1,?2,?3,?4)",
                params![key, hidden, source, rendition.as_ref().map(|(id, _)| id)],
            )
            .map_err(failure)?;
            if let Some((id, text)) = rendition {
                tx.execute("INSERT OR IGNORE INTO renditions(id,post,source,run,text) VALUES(?1,?2,?3,?4,?5)", params![id,key,source,run,text]).map_err(failure)?;
            }
        }
        tx.execute("INSERT INTO published(singleton,release) VALUES(1,?1) ON CONFLICT(singleton) DO UPDATE SET release=excluded.release", [&id]).map_err(failure)?;
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
    pub fn has_release(&self) -> Result<bool> {
        Ok(self
            .connection
            .query_row("SELECT release FROM published", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(failure)?
            .is_some())
    }
    pub fn visible(&self, key: &str) -> Result<bool> {
        Ok(self.connection.query_row("SELECT hidden=0 AND NOT EXISTS(SELECT 1 FROM restrictions WHERE post=?1) FROM current_posts WHERE post=?1", [key], |row| row.get::<_,bool>(0)).optional().map_err(failure)?.unwrap_or(false))
    }
}
