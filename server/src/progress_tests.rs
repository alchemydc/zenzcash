use super::*;
use std::time::Instant;

const ORIGINAL: &str = "WITH contributions AS (
 SELECT post,score,seq FROM feedback f WHERE account=?1 AND dimension=?2 AND seq>coalesce((SELECT seq FROM feedback_clears c WHERE c.account=f.account AND c.post=f.post AND c.dimension=f.dimension),0) AND seq=(SELECT max(seq) FROM feedback g WHERE g.account=f.account AND g.post=f.post AND g.dimension=f.dimension)
 UNION ALL SELECT post,score,seq FROM moods WHERE account=?1 AND ?2='emotions'
) SELECT avg(score) FROM contributions a WHERE seq=(SELECT max(seq) FROM contributions b WHERE b.post=a.post)";

fn database() -> Database {
    let db = Database::open(FsPath::new(":memory:")).unwrap();
    db.create_account("test-account").unwrap();
    db.create_account("other-account").unwrap();
    db
}
fn seed(db: &Database, count: i64) {
    let tx = db.connection.unchecked_transaction().unwrap();
    for post in 0..count {
        for version in 0..3 {
            let rendition = format!("r{post}-{version}");
            tx.execute("INSERT INTO renditions VALUES(?1,?2,'source','run','text')", params![rendition,post.to_string()]).unwrap();
            for dimension in ["head", "emotions"] {
                tx.execute("INSERT INTO feedback VALUES('test-account',?1,?2,?3,?4,?5)", params![post.to_string(),rendition,dimension,(post+version)%3-1,post*10+version]).unwrap();
            }
        }
        if post % 2 == 0 {
            tx.execute("INSERT INTO moods VALUES('test-account',?1,?2,?3)", params![post.to_string(),post%3-1,post*10+3]).unwrap();
        }
        if post % 5 == 0 {
            tx.execute("INSERT INTO feedback_clears VALUES('test-account',?1,'head',?2)", params![post.to_string(),post*10+4]).unwrap();
        }
    }
    tx.commit().unwrap();
}

#[test]
fn query_matches_original_and_cache_invalidates_for_all_input_tables() {
    let db = database();
    seed(&db, 67);
    db.connection.execute("INSERT INTO renditions VALUES('extra-rendition','extra','source','run','text')", []).unwrap();
    let compare = || {
        let value = db.progress("test-account").unwrap();
        for dimension in ["head", "emotions"] {
            let expected: Option<f64> = db.connection.query_row(ORIGINAL, ["test-account", dimension], |r| r.get(0)).unwrap();
            assert_eq!(value[dimension], json!(expected.unwrap_or(0.0)));
        }
    };
    compare();
    for statement in [
        "INSERT INTO moods VALUES('test-account','new',1,9999)",
        "UPDATE moods SET score=-1 WHERE post='new'",
        "DELETE FROM moods WHERE post='new'",
        "INSERT INTO feedback VALUES('test-account','extra','extra-rendition','head',1,99999)",
        "UPDATE feedback SET score=-1 WHERE post='extra'",
        "DELETE FROM feedback WHERE post='extra'",
        "INSERT INTO feedback_clears VALUES('test-account','1','emotions',99999)",
        "UPDATE feedback_clears SET seq=0 WHERE post='1'",
        "DELETE FROM feedback_clears WHERE post='1'",
    ] {
        db.progress("other-account").unwrap();
        db.connection.execute(statement, []).unwrap();
        let accounts: Vec<String> = db.connection.prepare("SELECT account FROM progress_cache ORDER BY account").unwrap().query_map([], |r|r.get(0)).unwrap().collect::<Result<_,_>>().unwrap();
        assert_eq!(accounts, vec!["other-account"], "{statement}");
        compare();
    }
    db.connection.execute("UPDATE accounts SET label='changed' WHERE id='test-account'", []).unwrap();
    assert_eq!(db.connection.query_row("SELECT count(*) FROM progress_cache", [], |r|r.get::<_,i64>(0)).unwrap(), 2);
    db.connection.execute("DELETE FROM accounts WHERE id='test-account'", []).unwrap();
    assert_eq!(db.connection.query_row("SELECT count(*) FROM progress_cache", [], |r|r.get::<_,i64>(0)).unwrap(), 1);
}

#[test]
fn progress_scaling_and_query_plan() {
    eprintln!("SQLite {} / Rust debug build / three renditions per post", rusqlite::version());
    for count in [500, 1000, 2000, 3260] {
        let db = database();
        seed(&db, count);
        let start = Instant::now();
        let result = db.progress("test-account").unwrap();
        let cold = start.elapsed();
        let start = Instant::now();
        for _ in 0..100 { assert_eq!(db.progress("test-account").unwrap(), result); }
        eprintln!("{count} posts: cold {cold:?}; cached mean {:?}", start.elapsed()/100);
        let plan = db.connection.prepare(&format!("EXPLAIN QUERY PLAN {}", database::PROGRESS_QUERY)).unwrap().query_map(["test-account","head"], |r|r.get::<_,String>(3)).unwrap().collect::<Result<Vec<_>,_>>().unwrap();
        assert!(plan.iter().any(|line| line.contains("feedback_account_post")));
        assert!(!plan.iter().any(|line| line.contains("CORRELATED")));
        if count == 3260 { eprintln!("query plan: {plan:?}"); }
    }
}
