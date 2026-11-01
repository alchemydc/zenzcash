//! Account data and content releases share transactions, never replacement databases.
use rand::{RngCore, rngs::OsRng};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::Path;

pub type Result<T> = std::result::Result<T, String>;
pub fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
pub fn secret() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}
pub const PETS: [&str; 10] = [
    "cat", "bunny", "fox", "panda", "otter", "frog", "owl", "penguin", "axolotl", "cloud",
];
pub const SESSION_SECONDS: i64 = 30 * 86400;
pub const RECENT_SECONDS: i64 = 300;
pub const VISIT_SECONDS: i64 = 1800;
pub struct Database {
    pub connection: Connection,
}
fn error(e: impl std::fmt::Display) -> String {
    format!("database operation: {e}")
}
impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        if path != Path::new(":memory:") {
            std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .mode(0o600)
                .open(path)
                .map_err(error)?;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(error)?;
        }
        let connection = Connection::open(path).map_err(error)?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(error)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
            )
            .map_err(error)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(error)?;
        if version > 3 {
            return Err(format!("unsupported database schema {version}"));
        }
        if version == 0 {
            connection
                .execute_batch(include_str!("schema.sql"))
                .map_err(error)?;
        }
        if version < 2 {
            connection.execute_batch("BEGIN IMMEDIATE; CREATE TABLE source_pulls(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, completed TEXT NOT NULL); PRAGMA user_version=2; COMMIT;").map_err(error)?;
        }
        if version < 3 {
            connection.execute_batch("BEGIN IMMEDIATE;
                ALTER TABLE published RENAME TO published_single;
                CREATE TABLE published(topic TEXT PRIMARY KEY, release TEXT NOT NULL REFERENCES releases(id));
                INSERT INTO published(topic,release) SELECT json_extract(r.data,'$.topic.id'),p.release FROM published_single p JOIN releases r ON r.id=p.release;
                DROP TABLE published_single;
                ALTER TABLE current_posts ADD COLUMN topic TEXT NOT NULL DEFAULT 'zcg';
                CREATE INDEX current_posts_topic ON current_posts(topic);
                UPDATE source_pulls SET snapshot=json_set(snapshot,'$.topic','zcg') WHERE json_extract(snapshot,'$.topic') IS NULL;
                CREATE VIEW available_posts AS SELECT p.* FROM current_posts p WHERE p.hidden=0 AND NOT EXISTS(SELECT 1 FROM current_posts blocked JOIN restrictions r ON r.post=blocked.post WHERE blocked.topic=p.topic AND blocked.hidden=0);
                PRAGMA user_version=3; COMMIT;").map_err(error)?;
        }
        Ok(Self { connection })
    }
    pub fn backup(&self, path: &Path) -> Result<()> {
        if path.exists() {
            return Err(format!(
                "backup destination already exists: {}",
                path.display()
            ));
        }
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(path)
            .map_err(error)?;
        self.connection
            .backup(rusqlite::MAIN_DB, path, None)
            .map_err(error)
    }
    pub fn create_account(&self, id: &str) -> Result<()> {
        self.connection
            .execute(
                "INSERT INTO accounts(id,label,appearance) VALUES(?1,?2,'cat')",
                params![id, format!("Reader {}", &id[..8])],
            )
            .map_err(error)?;
        Ok(())
    }
    pub fn replace_codes(&mut self, account: &str) -> Result<Vec<String>> {
        let codes: Vec<_> = (0..10).map(|_| secret()).collect();
        let tx = self.connection.transaction().map_err(error)?;
        tx.execute("DELETE FROM recovery WHERE account=?1", [account])
            .map_err(error)?;
        for code in &codes {
            tx.execute(
                "INSERT INTO recovery(hash,account) VALUES(?1,?2)",
                params![hash(code), account],
            )
            .map_err(error)?;
        }
        tx.commit().map_err(error)?;
        Ok(codes)
    }
    // Code consumption and a replacement credential are committed together after verification.
    pub fn complete_recovery(
        &mut self,
        code_hash: &str,
        account: &str,
        credential_id: &str,
        credential: &Value,
    ) -> Result<()> {
        let tx = self.connection.transaction().map_err(error)?;
        if tx
            .execute(
                "DELETE FROM recovery WHERE hash=?1 AND account=?2",
                params![code_hash, account],
            )
            .map_err(error)?
            != 1
        {
            return Err("recovery code is invalid or already used".into());
        }
        tx.execute("DELETE FROM credentials WHERE account=?1", [account])
            .map_err(error)?;
        tx.execute("DELETE FROM sessions WHERE account=?1", [account])
            .map_err(error)?;
        tx.execute(
            "INSERT INTO credentials(id,account,data) VALUES(?1,?2,?3)",
            params![credential_id, account, credential.to_string()],
        )
        .map_err(error)?;
        tx.commit().map_err(error)
    }
    pub fn recovery_account(&self, code: &str) -> Result<Option<String>> {
        if code.len() != 64
            || !code
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return Ok(None);
        }
        self.connection
            .query_row(
                "SELECT account FROM recovery WHERE hash=?1",
                [hash(code)],
                |row| row.get(0),
            )
            .optional()
            .map_err(error)
    }
    pub fn session(&self, token: &str, timestamp: i64) -> Result<Option<(String, i64, String)>> {
        self.connection
            .query_row(
                "SELECT account,verified,csrf FROM sessions WHERE hash=?1 AND expires>?2",
                params![hash(token), timestamp],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(error)
    }
    pub fn new_session(&self, account: &str, timestamp: i64) -> Result<(String, String)> {
        let token = secret();
        let csrf = secret();
        self.connection
            .execute("DELETE FROM sessions WHERE expires<=?1", [timestamp])
            .map_err(error)?;
        self.connection
            .execute(
                "INSERT INTO sessions(hash,account,csrf,verified,expires) VALUES(?1,?2,?3,?4,?5)",
                params![
                    hash(&token),
                    account,
                    csrf,
                    timestamp,
                    timestamp + SESSION_SECONDS
                ],
            )
            .map_err(error)?;
        Ok((token, csrf))
    }
    pub fn visit(&mut self, account: &str, device: &str, timestamp: i64) -> Result<Option<i64>> {
        let tx = self.connection.transaction().map_err(error)?;
        let current: Option<(i64, Option<i64>)> = tx
            .query_row(
                "SELECT active,cutoff FROM visits WHERE account=?1 AND device=?2",
                params![account, device],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(error)?;
        let cutoff = if let Some((active, cutoff)) =
            current.filter(|(active, _)| timestamp - active < VISIT_SECONDS)
        {
            let _ = active;
            cutoff
        } else {
            tx.query_row(
                "SELECT last_visit FROM accounts WHERE id=?1",
                [account],
                |row| row.get(0),
            )
            .map_err(error)?
        };
        tx.execute("INSERT INTO visits(account,device,active,cutoff) VALUES(?1,?2,?3,?4) ON CONFLICT(account,device) DO UPDATE SET active=excluded.active,cutoff=excluded.cutoff", params![account, device, timestamp, cutoff]).map_err(error)?;
        tx.execute(
            "UPDATE accounts SET last_visit=?1 WHERE id=?2",
            params![timestamp, account],
        )
        .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(cutoff)
    }
    pub fn credential(&self, id: &str) -> Result<Option<(String, Value)>> {
        let row: Option<(String, String)> = self
            .connection
            .query_row(
                "SELECT account,data FROM credentials WHERE id=?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(error)?;
        row.map(|(account, text)| Ok((account, serde_json::from_str(&text).map_err(error)?)))
            .transpose()
    }
    pub fn credentials(&self, account: &str) -> Result<Vec<Value>> {
        let mut statement = self
            .connection
            .prepare("SELECT data FROM credentials WHERE account=?1 ORDER BY id")
            .map_err(error)?;
        statement
            .query_map([account], |row| row.get::<_, String>(0))
            .map_err(error)?
            .map(|row| serde_json::from_str(&row.map_err(error)?).map_err(error))
            .collect()
    }
    pub fn save_credential(&self, id: &str, account: &str, data: &Value) -> Result<()> {
        self.connection.execute("INSERT INTO credentials(id,account,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE credentials.account=excluded.account", params![id, account, data.to_string()]).map_err(error)?;
        Ok(())
    }
    pub fn personal(&self, account: &str) -> Result<Value> {
        let (label, appearance, prefs): (String, String, Option<String>) = self
            .connection
            .query_row(
                "SELECT label,appearance,preferences FROM accounts WHERE id=?1",
                [account],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(error)?;
        let mut rows = self
            .connection
            .prepare("SELECT post,bookmarked,read FROM reading WHERE account=?1 ORDER BY post")
            .map_err(error)?;
        let reading = rows
            .query_map([account], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    json!({"bookmarked": row.get::<_, bool>(1)?, "read": row.get::<_, bool>(2)?}),
                ))
            })
            .map_err(error)?
            .collect::<std::result::Result<serde_json::Map<_, _>, _>>()
            .map_err(error)?;
        let remaining: i64 = self
            .connection
            .query_row(
                "SELECT count(*) FROM recovery WHERE account=?1",
                [account],
                |row| row.get(0),
            )
            .map_err(error)?;
        Ok(
            json!({"label":label,"appearance":appearance,"preferences":prefs.map(|text| serde_json::from_str::<Value>(&text)).transpose().map_err(error)?,"reading":reading,"recovery_remaining":remaining,"progress":self.progress(account)?}),
        )
    }
    pub fn progress(&self, account: &str) -> Result<Value> {
        let mut result = serde_json::Map::new();
        for dimension in ["emotions", "head"] {
            let mean: Option<f64> = self.connection.query_row("SELECT avg(score) FROM feedback f WHERE account=?1 AND dimension=?2 AND seq>coalesce((SELECT seq FROM feedback_clears c WHERE c.account=f.account AND c.post=f.post AND c.dimension=f.dimension),0) AND seq=(SELECT max(seq) FROM feedback g WHERE g.account=f.account AND g.post=f.post AND g.dimension=f.dimension)", params![account, dimension], |row| row.get(0)).map_err(error)?;
            result.insert(dimension.into(), json!(mean.unwrap_or(0.0)));
        }
        Ok(Value::Object(result))
    }
    pub fn set_reading(
        &self,
        account: &str,
        post: &str,
        bookmarked: Option<bool>,
        read: Option<bool>,
    ) -> Result<()> {
        self.connection.execute("INSERT INTO reading(account,post,bookmarked,read) VALUES(?1,?2,coalesce(?3,0),coalesce(?4,0)) ON CONFLICT(account,post) DO UPDATE SET bookmarked=coalesce(?3,reading.bookmarked),read=coalesce(?4,reading.read)", params![account, post, bookmarked, read]).map_err(error)?;
        Ok(())
    }
    pub fn feedback(&self, account: &str) -> Result<Value> {
        let mut result = serde_json::Map::new();
        let mut query = self.connection.prepare("SELECT f.post,f.dimension,f.score FROM feedback f JOIN available_posts p ON p.post=f.post AND p.rendition=f.rendition WHERE f.account=?1").map_err(error)?;
        for row in query
            .query_map([account], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(error)?
        {
            let (post, dimension, score) = row.map_err(error)?;
            result
                .entry(post)
                .or_insert_with(|| json!({"emotions":null,"head":null}))[dimension] = json!(score);
        }
        Ok(Value::Object(result))
    }
    pub fn set_feedback(
        &mut self,
        account: &str,
        post: &str,
        rendition: &str,
        emotions: Option<i64>,
        head: Option<i64>,
    ) -> Result<()> {
        if [emotions, head]
            .into_iter()
            .flatten()
            .any(|v| !(-10..=10).contains(&v))
        {
            return Err("feedback must be an integer from -10 to 10".into());
        }
        let tx = self.connection.transaction().map_err(error)?;
        let current: Option<String> = tx
            .query_row(
                "SELECT rendition FROM available_posts WHERE post=?1",
                [post],
                |row| row.get(0),
            )
            .optional()
            .map_err(error)?
            .flatten();
        if current.as_deref() != Some(rendition) {
            return Err("rendition has changed or is unavailable; refresh before answering".into());
        }
        for (dimension, score) in [("emotions", emotions), ("head", head)] {
            let old: Option<i64> = tx
                .query_row(
                    "SELECT score FROM feedback WHERE account=?1 AND rendition=?2 AND dimension=?3",
                    params![account, rendition, dimension],
                    |row| row.get(0),
                )
                .optional()
                .map_err(error)?;
            if old == score {
                continue;
            }
            if let Some(value) = score {
                tx.execute("UPDATE sequence SET value=value+1", [])
                    .map_err(error)?;
                tx.execute("INSERT INTO feedback(account,post,rendition,dimension,score,seq) VALUES(?1,?2,?3,?4,?5,(SELECT value FROM sequence)) ON CONFLICT(account,rendition,dimension) DO UPDATE SET score=excluded.score,seq=excluded.seq", params![account,post,rendition,dimension,value]).map_err(error)?;
            } else {
                // A clear removes this post/dimension's active progress, including older rewrites.
                tx.execute(
                    "DELETE FROM feedback WHERE account=?1 AND rendition=?2 AND dimension=?3",
                    params![account, rendition, dimension],
                )
                .map_err(error)?;
                tx.execute("UPDATE sequence SET value=value+1", [])
                    .map_err(error)?;
                tx.execute("INSERT INTO feedback_clears(account,post,dimension,seq) VALUES(?1,?2,?3,(SELECT value FROM sequence)) ON CONFLICT(account,post,dimension) DO UPDATE SET seq=excluded.seq", params![account,post,dimension]).map_err(error)?;
            }
        }
        tx.commit().map_err(error)
    }
    pub fn report(&self) -> Result<Value> {
        let mut statement = self.connection.prepare("SELECT f.post,f.rendition,f.dimension,f.score,count(*),p.rendition=f.rendition FROM feedback f LEFT JOIN current_posts p ON p.post=f.post GROUP BY f.post,f.rendition,f.dimension,f.score ORDER BY f.post,f.rendition,f.dimension,f.score").map_err(error)?;
        let rows = statement.query_map([], |row| Ok(json!({"post":row.get::<_,String>(0)?,"rendition":row.get::<_,String>(1)?,"dimension":row.get::<_,String>(2)?,"score":row.get::<_,i64>(3)?,"respondents":row.get::<_,i64>(4)?,"current":row.get::<_,Option<bool>>(5)?.unwrap_or(false)}))).map_err(error)?.collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
        Ok(json!({"scale":"signed-benefit-v1","distributions":rows}))
    }
}
