use crate::database::{Database, Result};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};

pub const PAGE_SIZE: usize = 200;
const ENTRY_LIMIT: i64 = 50000;
pub const DEVICE_LIMIT: i64 = 64;
fn failure(error: impl std::fmt::Display) -> String { format!("reading state: {error}") }

impl Database {
    pub fn reading_entry(&self, account: &str, post: &str) -> Result<Value> {
        self.connection.query_row("SELECT bookmarked,read FROM reading WHERE account=?1 AND post=?2", params![account,post],
            |row| Ok(json!({"bookmarked":row.get::<_,bool>(0)?,"read":row.get::<_,bool>(1)?})))
            .optional().map(|entry| entry.unwrap_or(Value::Null)).map_err(failure)
    }

    pub fn set_reading(&self, account: &str, post: &str, bookmarked: Option<bool>, read: Option<bool>) -> Result<Value> {
        crate::account_types::post_key(post)?;
        let tx = self.connection.unchecked_transaction().map_err(failure)?;
        let existing = self.reading_entry(account, post)?;
        if bookmarked.is_none() && read.is_none() { tx.commit().map_err(failure)?; return Ok(existing); }
        if !self.visible(post)? && (bookmarked == Some(true) || read.is_some()) {
            return Err("post is unavailable".into());
        }
        let bookmarked = bookmarked.unwrap_or(existing["bookmarked"] == true);
        let read = read.unwrap_or(existing["read"] == true);
        let result = if !bookmarked && !read {
            tx.execute("DELETE FROM reading WHERE account=?1 AND post=?2", params![account,post]).map_err(failure)?;
            Value::Null
        } else {
            if existing.is_null() {
                let count: i64 = tx.query_row("SELECT count(*) FROM reading WHERE account=?1", [account], |row|row.get(0)).map_err(failure)?;
                if count >= ENTRY_LIMIT { return Err(format!("Reading history limit reached ({ENTRY_LIMIT}); remove saved entries before adding more.")); }
            }
            tx.execute("INSERT INTO reading(account,post,bookmarked,read) VALUES(?1,?2,?3,?4) ON CONFLICT(account,post) DO UPDATE SET bookmarked=excluded.bookmarked,read=excluded.read", params![account,post,bookmarked,read]).map_err(failure)?;
            json!({"bookmarked":bookmarked,"read":read})
        };
        tx.commit().map_err(failure)?;
        Ok(result)
    }

    pub fn reading_page(&self, account: &str, after: &str, topic: Option<&str>, bookmarks: bool) -> Result<Value> {
        if !after.is_empty() { crate::account_types::post_key(after)?; }
        if topic.is_some() && bookmarks { return Err("choose a topic or bookmarks, not both".into()); }
        let query = if topic.is_some() {
            "SELECT r.post,r.bookmarked,r.read FROM current_posts p INDEXED BY current_posts_topic_post CROSS JOIN reading r ON r.account=?1 AND r.post=p.post WHERE p.topic=?3 AND p.post>?2 ORDER BY p.post LIMIT ?4"
        } else if bookmarks {
            "SELECT post,bookmarked,read FROM reading WHERE account=?1 AND post>?2 AND bookmarked=1 AND ?3 IS NULL ORDER BY post LIMIT ?4"
        } else {
            "SELECT post,bookmarked,read FROM reading WHERE account=?1 AND post>?2 AND ?3 IS NULL ORDER BY post LIMIT ?4"
        };
        let mut statement = self.connection.prepare(query).map_err(failure)?;
        let mut entries = statement.query_map(params![account,after,topic,PAGE_SIZE+1], |row| {
            Ok((row.get::<_,String>(0)?, json!({"bookmarked":row.get::<_,bool>(1)?,"read":row.get::<_,bool>(2)?})))
        }).map_err(failure)?.collect::<std::result::Result<Vec<_>,_>>().map_err(failure)?;
        let next = if entries.len() > PAGE_SIZE { entries.truncate(PAGE_SIZE); Some(entries[PAGE_SIZE-1].0.clone()) } else { None };
        Ok(json!({"entries":entries.into_iter().collect::<serde_json::Map<_,_>>(),"next":next}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn database() -> Database {
        let db = Database::open(Path::new(":memory:")).unwrap();
        db.create_account("test-account").unwrap();
        db.connection.execute("INSERT INTO current_posts(post,hidden,source,topic) VALUES('7/1',0,'source','topic')", []).unwrap();
        db
    }
    #[test]
    fn patches_preserve_omissions_and_never_allocate_empty_or_missing_entries() {
        for bookmark in [None, Some(false), Some(true)] {
            for read in [None, Some(false), Some(true)] {
                let db = database();
                let result = db.set_reading("test-account", "999/1", bookmark, read);
                if bookmark == Some(true) || read.is_some() { assert_eq!(result.unwrap_err(), "post is unavailable"); }
                else { assert_eq!(result.unwrap(), Value::Null); }
                assert_eq!(db.connection.query_row("SELECT count(*) FROM reading", [], |r|r.get::<_,i64>(0)).unwrap(), 0);
                db.set_reading("test-account", "7/1", Some(true), Some(true)).unwrap();
                assert_eq!(db.set_reading("test-account", "7/1", bookmark, read).unwrap(),
                    if bookmark == Some(false) && read == Some(false) { Value::Null }
                    else { json!({"bookmarked":bookmark.unwrap_or(true),"read":read.unwrap_or(true)}) });
            }
        }
        let db = database();
        db.set_reading("test-account", "7/1", Some(true), None).unwrap();
        db.connection.execute("UPDATE current_posts SET hidden=1", []).unwrap();
        assert_eq!(db.set_reading("test-account", "7/1", Some(false), None).unwrap(), Value::Null);
        assert_eq!(db.reading_entry("test-account", "7/1").unwrap(), Value::Null);
    }
    #[test]
    fn oversized_history_has_bounded_pages_and_quota_allows_removal() {
        let db = database();
        db.connection.execute_batch("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<50001) INSERT INTO reading SELECT 'test-account','99/'||x,1,0 FROM n;").unwrap();
        let start = std::time::Instant::now();
        let page = db.reading_page("test-account", "", None, true).unwrap();
        eprintln!("50,001-row reading page: {:?}, {} bytes", start.elapsed(), page.to_string().len());
        assert_eq!(page["entries"].as_object().unwrap().len(), PAGE_SIZE);
        let next = page["next"].as_str().unwrap();
        let second = db.reading_page("test-account", next, None, true).unwrap();
        assert_eq!(second["entries"].as_object().unwrap().len(), PAGE_SIZE);
        assert!(second["entries"].as_object().unwrap().keys().all(|key|key.as_str()>next));
        assert!(!db.personal("test-account").unwrap().as_object().unwrap().contains_key("reading"));
        assert_eq!(db.set_reading("test-account","7/1",Some(true),None).unwrap_err(), "Reading history limit reached (50000); remove saved entries before adding more.");
        assert_eq!(db.set_reading("test-account","99/1",Some(false),None).unwrap(), Value::Null);
        assert_eq!(db.set_reading("test-account","99/2",Some(false),None).unwrap(), Value::Null);
        assert_eq!(db.set_reading("test-account","7/1",Some(true),None).unwrap(), json!({"bookmarked":true,"read":false}));
        assert_eq!(db.reading_page("test-account","",Some("topic"),false).unwrap(), json!({"entries":{"7/1":{"bookmarked":true,"read":false}},"next":null}));
    }
    #[test]
    fn device_history_retains_latest_sixty_four() {
        let mut db = database();
        for device in 0..100 { db.visit("test-account", &format!("{device:032x}"), device).unwrap(); }
        assert_eq!(db.connection.query_row("SELECT count(*) FROM visits", [], |r|r.get::<_,i64>(0)).unwrap(), DEVICE_LIMIT);
        assert_eq!(db.connection.query_row("SELECT min(active) FROM visits", [], |r|r.get::<_,i64>(0)).unwrap(), 36);
    }
    #[test]
    fn migration_removes_only_redundant_reading_and_is_safe_to_reopen() {
        let directory = std::env::temp_dir().join(format!("zforum-reading-migration-{}", crate::database::secret()));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("db.sqlite");
        {
            let db = Database::open(&path).unwrap();
            db.create_account("test-account").unwrap();
            db.connection.execute_batch("DROP INDEX reading_bookmarks; DROP INDEX current_posts_topic_post; DROP INDEX visits_account_active; DROP TABLE topic_listings; DROP TABLE import_review_history; PRAGMA user_version=8;
              INSERT INTO reading VALUES('test-account','99/1',0,0),('test-account','99/2',1,0),('test-account','99/3',0,1);
              WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100) INSERT INTO visits SELECT 'test-account',printf('%032x',x),x,NULL FROM n;").unwrap();
        }
        for _ in 0..2 {
            let db = Database::open(&path).unwrap();
            assert_eq!(db.reading_page("test-account","",None,false).unwrap(), json!({"entries":{"99/2":{"bookmarked":true,"read":false},"99/3":{"bookmarked":false,"read":true}},"next":null}));
            assert_eq!(db.connection.query_row("SELECT count(*) FROM visits", [], |r|r.get::<_,i64>(0)).unwrap(),DEVICE_LIMIT);
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
}
