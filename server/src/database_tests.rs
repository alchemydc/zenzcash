use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use tower::ServiceExt;
const A: &str = "11111111-1111-4111-8111-111111111111";
const B: &str = "22222222-2222-4222-8222-222222222222";
fn fixture() -> Value {
    json!({"format":SITE_DATA_FORMAT,"models":["test"],"topic":{"id":"zcg","threads":[{"posts":[{"key":"7/1","hidden":false,"raw":"original","reply_to":null,"author":"alice","created_at":"2026-11-01T00:00:00Z","analysis":{"neutral_rendition":"rendition"}}]}]}})
}
fn db() -> Database {
    let db = Database::open(FsPath::new(":memory:")).unwrap();
    db.create_account(A).unwrap();
    db.create_account(B).unwrap();
    db
}
fn rendition(db: &Database) -> String {
    db.published("zcg").unwrap()["topic"]["threads"][0]["posts"][0]["rendition_version"]
        .as_str()
        .unwrap()
        .into()
}
#[test]
fn feedback_is_exact_versioned_idempotent_and_independent() {
    let mut db = db();
    db.publish(fixture()).unwrap();
    let first = rendition(&db);
    db.set_feedback(A, "7/1", &first, Some(-1), Some(1)).unwrap();
    let sequence: i64 = db.connection.query_row("SELECT value FROM sequence", [], |r| r.get(0)).unwrap();
    db.set_feedback(A, "7/1", &first, Some(-1), Some(1)).unwrap();
    assert_eq!(db.connection.query_row("SELECT value FROM sequence", [], |r| r.get::<_, i64>(0)).unwrap(), sequence);
    assert_eq!(db.progress(A).unwrap(), json!({"emotions":-1.0,"head":1.0}));
    assert_eq!(db.report().unwrap()["distributions"].as_array().unwrap().len(), 2);
    assert_eq!(db.feedback(B).unwrap(), json!({}));
    let mut changed = fixture();
    changed["topic"]["threads"][0]["posts"][0]["analysis"]["neutral_rendition"] = json!("another wording");
    db.publish(changed).unwrap();
    let second = rendition(&db);
    assert_ne!(first, second);
    assert_eq!(db.feedback(A).unwrap(), json!({}));
    assert_eq!(db.set_feedback(A, "7/1", &first, Some(1), Some(1)).unwrap_err(), "re-write has changed or is unavailable; refresh before answering");
    db.set_feedback(A, "7/1", &second, Some(1), Some(-1)).unwrap();
    assert_eq!(db.progress(A).unwrap(), json!({"emotions":1.0,"head":-1.0}));
    db.set_feedback(A, "7/1", &second, None, Some(-1)).unwrap();
    assert_eq!(db.progress(A).unwrap(), json!({"emotions":0.0,"head":-1.0}));
    assert_eq!(db.feedback(A).unwrap(), json!({"7/1":{"emotions":null,"head":-1}}));
    for bad in [-11, -2, 2, 11] {
        assert_eq!(db.set_feedback(A, "7/1", &second, Some(bad), None).unwrap_err(), "reaction must be -1, 0 or 1");
    }
}
#[test]
fn mood_and_heart_use_latest_per_post_and_head_stays_independent() {
    let mut db = db(); db.publish(fixture()).unwrap();
    let version = rendition(&db);
    for heart in -1..=1 { for mood in -1..=1 {
        db.set_mood(A, "7/1", None).unwrap();
        db.set_feedback(A, "7/1", &version, None, None).unwrap();
        db.set_feedback(A, "7/1", &version, Some(heart), Some(-1)).unwrap();
        db.set_mood(A, "7/1", Some(mood)).unwrap();
        assert_eq!(db.progress(A).unwrap(), json!({"emotions":mood as f64,"head":-1.0}));
        let seq: i64 = db.connection.query_row("SELECT value FROM sequence", [], |r| r.get(0)).unwrap();
        db.set_mood(A, "7/1", Some(mood)).unwrap();
        assert_eq!(db.connection.query_row("SELECT value FROM sequence", [], |r| r.get::<_,i64>(0)).unwrap(),seq);
        assert_eq!(db.moods(B).unwrap(), json!({}));
        db.set_mood(A, "7/1", None).unwrap();
        assert_eq!(db.progress(A).unwrap(), json!({"emotions":heart as f64,"head":-1.0}));
    }}
    assert_eq!(db.set_mood(A, "7/1", Some(2)).unwrap_err(), "reaction must be -1, 0 or 1");
    assert_eq!(db.set_mood(A, "7/99", Some(1)).unwrap_err(), "post is unavailable");
    db.set_mood(A,"7/1",Some(1)).unwrap();
    db.restrict(&["7/1".into()]).unwrap();
    assert_eq!(db.moods(A).unwrap(), json!({}));
    assert_eq!(db.set_mood(A,"7/1",Some(-1)).unwrap_err(), "post is unavailable");
}
#[test]
fn schema_four_preserves_historical_feedback_without_reinterpreting_scores() {
    let path = std::env::temp_dir().join(format!("zforum-migration-{}", database::secret()));
    {
        let mut db = Database::open(&path).unwrap(); db.create_account(A).unwrap(); db.publish(fixture()).unwrap();
        let version = rendition(&db);
        db.set_reading(A,"7/1",Some(true),Some(true)).unwrap();
        // Reconstruct the prior schema from its retained original tables.
        db.connection.execute_batch("DROP TABLE moods; DROP TABLE feedback; DROP TABLE feedback_clears; ALTER TABLE feedback_signed_v1 RENAME TO feedback; ALTER TABLE feedback_clears_signed_v1 RENAME TO feedback_clears; PRAGMA user_version=3;").unwrap();
        db.connection.execute("INSERT INTO feedback VALUES(?1,'7/1',?2,'emotions',-7,1)",params![A,version]).unwrap();
    }
    {
        let db = Database::open(&path).unwrap();
        assert_eq!(db.feedback(A).unwrap(),json!({}));
        assert_eq!(db.progress(A).unwrap(),json!({"emotions":0.0,"head":0.0}));
        assert_eq!(db.report().unwrap()["historical_signed_v1"],json!([{"dimension":"emotions","score":-7,"responses":1}]));
        assert_eq!(db.personal(A).unwrap()["reading"]["7/1"],json!({"read":true,"bookmarked":true}));
        db.connection.execute("DELETE FROM accounts WHERE id=?1",[A]).unwrap();
        assert_eq!(db.report().unwrap()["historical_signed_v1"],json!([]));
    }
    std::fs::remove_file(path).unwrap();
}
#[test]
fn recovery_codes_are_independent_hashed_single_use_and_revoke_old_access() {
    let mut db = db();
    let codes = db.replace_codes(A).unwrap();
    assert_eq!(codes.len(), 10);
    assert_eq!(
        codes
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        10
    );
    let stored: String = db
        .connection
        .query_row("SELECT hash FROM recovery LIMIT 1", [], |r| r.get(0))
        .unwrap();
    assert!(!codes.contains(&stored));
    let (token, _) = db.new_session(A, 100).unwrap();
    db.save_credential("old", A, &json!({"test":true})).unwrap();
    db.complete_recovery(&hash(&codes[0]), A, "new", &json!({"key":"new"}))
        .unwrap();
    assert!(db.recovery_account(&codes[0]).unwrap().is_none());
    assert_eq!(db.recovery_account(&codes[1]).unwrap(), Some(A.into()));
    assert!(
        db.complete_recovery(&hash(&codes[0]), A, "other", &json!({}))
            .is_err()
    );
    assert!(db.session(&token, 101).unwrap().is_none());
    assert!(db.credential("old").unwrap().is_none());
    assert_eq!(db.personal(A).unwrap()["recovery_remaining"], 9);
    let replacements = db.replace_codes(A).unwrap();
    for code in codes {
        assert!(db.recovery_account(&code).unwrap().is_none());
    }
    for code in replacements {
        assert_eq!(db.recovery_account(&code).unwrap(), Some(A.into()));
    }
}
#[test]
fn racing_recovery_consumes_exactly_one_code() {
    let directory = std::env::temp_dir().join(format!("zforum-recovery-{}", database::secret()));
    std::fs::create_dir(&directory).unwrap();
    let path = directory.join("db");
    let mut db = Database::open(&path).unwrap();
    db.create_account(A).unwrap();
    let code = db.replace_codes(A).unwrap()[0].clone();
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = (0..2)
        .map(|index| {
            let mut other = Database::open(&path).unwrap();
            let barrier = barrier.clone();
            let code = code.clone();
            std::thread::spawn(move || {
                barrier.wait();
                other
                    .complete_recovery(&hash(&code), A, &format!("key{index}"), &json!({}))
                    .is_ok()
            })
        })
        .collect();
    let wins = handles
        .into_iter()
        .map(|h| u32::from(h.join().unwrap()))
        .sum::<u32>();
    assert_eq!(wins, 1);
    assert_eq!(db.personal(A).unwrap()["recovery_remaining"], 9);
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}
#[test]
fn visits_are_stable_across_refresh_and_tabs_and_independent_between_devices() {
    let mut db = db();
    assert_eq!(db.visit(A, "one", 100).unwrap(), None);
    assert_eq!(db.visit(A, "one", 200).unwrap(), None);
    assert_eq!(db.visit(A, "two", 300).unwrap(), Some(200));
    assert_eq!(db.visit(A, "one", 400).unwrap(), None);
    assert_eq!(db.visit(A, "one", 2200).unwrap(), Some(400));
    assert_eq!(db.visit(A, "one", 2300).unwrap(), Some(400));
    assert_eq!(db.visit(B, "one", 2300).unwrap(), None);
}
#[test]
fn releases_rollback_and_backup_preserve_user_data_and_restrictions() {
    let mut db = db();
    let initial = db.publish(fixture()).unwrap();
    let first = rendition(&db);
    db.set_reading(A, "7/1", Some(true), Some(true)).unwrap();
    db.publish(fixture()).unwrap();
    assert_eq!(rendition(&db), first);
    let mut changed = fixture();
    changed["topic"]["threads"][0]["posts"][0]["raw"] = json!("edited");
    db.publish(changed).unwrap();
    assert_ne!(rendition(&db), first);
    db.rollback(&initial).unwrap();
    assert_eq!(rendition(&db), first);
    assert_eq!(
        db.personal(A).unwrap()["reading"]["7/1"],
        json!({"bookmarked":true,"read":true})
    );
    db.restrict(&["7/1".into()]).unwrap();
    assert!(db.published("zcg").is_err());
    assert!(db.rollback(&initial).is_err());
    let mut hidden = fixture();
    let post = &mut hidden["topic"]["threads"][0]["posts"][0];
    post["hidden"] = json!(true);
    for field in ["raw", "analysis", "segments", "own_text"] {
        post[field] = Value::Null;
    }
    db.publish(hidden).unwrap();
    assert!(!db.visible("7/1").unwrap());
    let backup = std::env::temp_dir().join(format!("zforum-backup-{}", database::secret()));
    db.backup(&backup).unwrap();
    let mut restored = Database::open(&backup).unwrap();
    assert_eq!(restored.personal(A).unwrap(), db.personal(A).unwrap());
    assert!(restored.rollback(&initial).is_err());
    drop(restored);
    std::fs::remove_file(backup).unwrap();
}
#[test]
fn session_csrf_origin_challenge_expiry_and_replay_are_enforced() {
    assert!(
        Auth::new(
            "http://example.com",
            "example.com",
            PathBuf::from("missing")
        )
        .is_err()
    );
    assert!(Auth::new("https://example.com", "other.com", PathBuf::from("missing")).is_err());
    let mut auth = Auth::new(
        "http://localhost:8000",
        "localhost",
        PathBuf::from("missing"),
    )
    .unwrap();
    let mut headers = HeaderMap::new();
    assert!(auth.verify_origin(&headers).is_err());
    headers.insert(header::ORIGIN, "http://localhost:8000".parse().unwrap());
    assert!(auth.verify_origin(&headers).unwrap_err().contains("refresh the page"));
    headers.insert("x-zforum-request", "1".parse().unwrap());
    auth.verify_origin(&headers).unwrap();
    headers.insert(header::ORIGIN, "http://127.0.0.1:8000".parse().unwrap());
    assert!(auth.verify_origin(&headers).unwrap_err().contains("Open http://localhost:8000/"));
    headers.insert(header::ORIGIN, "http://localhost:8000".parse().unwrap());
    let db = db();
    let (token, csrf) = db.new_session(A, now()).unwrap();
    headers.insert(
        header::COOKIE,
        format!("zforum_session={token}").parse().unwrap(),
    );
    assert!(account(&db, &headers, true, false).is_err());
    headers.insert("x-csrf-token", csrf.parse().unwrap());
    assert_eq!(account(&db, &headers, true, true).unwrap(), A);
    assert!(
        db.session(&token, now() + database::SESSION_SECONDS)
            .unwrap()
            .is_none()
    );
    let token = auth.challenge(Challenge {
        expires: now() + 300,
        account: None,
        operation: "login".into(),
        state: json!({}),
        recovery: None,
        session: None,
    });
    headers.insert(
        header::COOKIE,
        format!("zforum_challenge={token}").parse().unwrap(),
    );
    auth.take_challenge(&headers).unwrap();
    assert!(auth.take_challenge(&headers).is_err());
    let token = auth.challenge(Challenge {
        expires: now() - 1,
        account: None,
        operation: "login".into(),
        state: json!({}),
        recovery: None,
        session: None,
    });
    headers.insert(
        header::COOKIE,
        format!("zforum_challenge={token}").parse().unwrap(),
    );
    assert!(auth.take_challenge(&headers).is_err());
    for _ in 0..3 {
        auth.rate_limit("key", 3, 100).unwrap();
    }
    assert!(auth.rate_limit("key", 3, 100).is_err());
    auth.rate_limit("key", 3, 160).unwrap();
}
#[tokio::test]
async fn actual_routes_authorize_by_cookie_and_do_not_accept_reader_ids() {
    let mut db = db();
    db.publish(fixture()).unwrap();
    let (token, csrf) = db.new_session(A, now()).unwrap();
    let state = Arc::new(Mutex::new(App {
        db,
        auth: Auth::new(
            "http://localhost:8000",
            "localhost",
            PathBuf::from("missing"),
        )
        .unwrap(),
        contract: json!({}),
    }));
    let app = router(state.clone(), FsPath::new("site"));
    let info = app.clone().oneshot(Request::builder().uri("/api/me").body(Body::empty()).unwrap()).await.unwrap();
    let info: Value = serde_json::from_slice(&to_bytes(info.into_body(),65536).await.unwrap()).unwrap();
    assert_eq!(info["auth_origin"], "http://localhost:8000");
    for (origin, status) in [("http://127.0.0.1:8000",StatusCode::FORBIDDEN),("http://localhost:8000",StatusCode::SERVICE_UNAVAILABLE)] {
        let request = Request::builder().method("POST").uri("/api/auth/start").header("origin",origin).header("x-zforum-request","1").header("content-type","application/json").body(Body::from(r#"{"mode":"register","code":null}"#)).unwrap();
        let reply = app.clone().oneshot(request).await.unwrap();
        assert_eq!(reply.status(),status);
        if status == StatusCode::FORBIDDEN {
            let body: Value = serde_json::from_slice(&to_bytes(reply.into_body(),65536).await.unwrap()).unwrap();
            assert!(body["error"].as_str().unwrap().contains("http://localhost:8000/"));
        }
    }
    let make = |body: &str, session: bool, origin: &str| {
        let mut req = Request::builder()
            .method("PUT")
            .uri("/api/account/reading/7/1")
            .header("content-type", "application/json")
            .header("origin", origin)
            .header("x-zforum-request", "1");
        if session {
            req = req
                .header("cookie", format!("zforum_session={token}"))
                .header("x-csrf-token", &csrf);
        }
        req.body(Body::from(body.to_owned())).unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(make(r#"{"read":true}"#, true, "https://evil.example"))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.clone()
            .oneshot(make(r#"{"read":true}"#, false, "http://localhost:8000"))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        app.clone()
            .oneshot(make(
                r#"{"read":true,"reader":"spoof"}"#,
                true,
                "http://localhost:8000"
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let reply = app
        .oneshot(make(
            r#"{"read":true,"bookmarked":true}"#,
            true,
            "http://localhost:8000",
        ))
        .await
        .unwrap();
    assert_eq!(reply.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&to_bytes(reply.into_body(), 65536).await.unwrap()).unwrap();
    assert_eq!(body["reading"]["7/1"]["read"], true);
    assert_eq!(locked(&state).db.personal(B).unwrap()["reading"], json!({}));
}

#[tokio::test]
async fn restricted_content_cannot_bypass_database_using_static_file_paths() {
    let directory = std::env::temp_dir().join(format!("zforum-static-{}", database::secret()));
    std::fs::create_dir_all(directory.join("data")).unwrap();
    std::fs::write(directory.join("data/zcg.json"), "PRIVATE OLD CONTENT").unwrap();
    let mut db = db();
    db.publish(fixture()).unwrap();
    db.restrict(&["7/1".into()]).unwrap();
    let state = Arc::new(Mutex::new(App {
        db,
        auth: Auth::new(
            "http://localhost:8000",
            "localhost",
            PathBuf::from("missing"),
        )
        .unwrap(),
        contract: json!({}),
    }));
    let app = router(state, &directory);
    for path in [
        "/data/zcg.json",
        "/data//zcg.json",
        "/data/%7Acg.json",
        "/js/../data/zcg.json",
        "/js/%2e%2e/data/zcg.json",
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert!(!response.status().is_success(), "{path}");
        let bytes = to_bytes(response.into_body(), 65536).await.unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("PRIVATE OLD CONTENT"));
    }
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn successful_pull_metadata_is_separate_from_publication_and_survives_rollback() {
    let mut db = db();
    let mut data = fixture();
    data["snapshot_at"] = json!("2026-10-31T12:00:00Z");
    data["topic"]["threads"][0]["id"] = json!(7);
    let release = db.publish(data).unwrap();
    let snapshot = json!({"topic":"zcg","snapshotAt":"2026-11-01T12:00:00Z","threads":[{"id":7,"posts":[]}],"accounts":{},"pulls":[{"thread":7,"pulled_at":"2026-11-01T11:59:00Z"}]});
    db.record_pull(snapshot.clone()).unwrap();
    db.record_pull(snapshot.clone()).unwrap();
    let published = db.published("zcg").unwrap();
    assert_eq!(published["last_pulled_at"], snapshot["snapshotAt"]);
    assert_eq!(published["analysis_pending"], true);
    assert_eq!(
        published["topic"]["threads"][0]["posts"][0]["raw"],
        "original"
    );
    let count: i64 = db
        .connection
        .query_row("SELECT count(*) FROM source_pulls", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
    let mut incomplete = snapshot;
    incomplete["pulls"] = json!([]);
    assert!(db.record_pull(incomplete).is_err());
    db.rollback(&release).unwrap();
    assert_eq!(
        db.published("zcg").unwrap()["last_pulled_at"],
        "2026-11-01T12:00:00Z"
    );
    let mut same = fixture();
    same["topic"]["threads"][0]["id"] = json!(7);
    same["source_sha256"] = json!("same-source");
    db.publish(same).unwrap();
    db.record_pull(json!({"topic":"zcg","source_sha256":"same-source","snapshotAt":"2026-11-02T00:00:00Z","threads":[{"id":7,"posts":[]}],"accounts":{},"pulls":[{"thread":7,"pulled_at":"2026-11-02T00:00:00Z"}]})).unwrap();
    assert_eq!(db.published("zcg").unwrap()["analysis_pending"], false);
    db.record_pull(json!({"topic":"konclave","source_sha256":"another-source","snapshotAt":"2026-11-03T00:00:00Z","threads":[{"id":8,"posts":[]}],"accounts":{},"pulls":[{"thread":8,"pulled_at":"2026-11-03T00:00:00Z"}]})).unwrap();
    assert_eq!(db.published("zcg").unwrap()["last_pulled_at"], "2026-11-02T00:00:00Z");
}

#[test]
fn topics_publish_rollback_and_withhold_independently() {
    let mut db = db();
    let zcg = db.publish(fixture()).unwrap();
    let version = rendition(&db);
    db.set_reading(A, "7/1", Some(true), Some(true)).unwrap();
    db.set_feedback(A, "7/1", &version, Some(1), Some(0)).unwrap();
    let mut other = fixture();
    other["topic"]["id"] = json!("konclave");
    other["topic"]["threads"][0]["posts"][0]["key"] = json!("8/1");
    let release = db.publish(other.clone()).unwrap();
    assert!(db.visible("7/1").unwrap());
    assert!(db.visible("8/1").unwrap());
    assert_eq!(db.published("zcg").unwrap()["release_id"], zcg);
    assert_eq!(db.progress(A).unwrap(), json!({"emotions":1.0,"head":0.0}));
    assert_eq!(db.personal(A).unwrap()["reading"]["7/1"], json!({"bookmarked":true,"read":true}));
    other["topic"]["threads"][0]["posts"][0]["raw"] = json!("edited elsewhere");
    db.publish(other).unwrap();
    db.rollback(&release).unwrap();
    assert_eq!(rendition(&db), version);
    assert_eq!(db.catalog().unwrap()["topics"].as_array().unwrap().len(), 2);
    db.restrict(&["8/1".into()]).unwrap();
    let catalog = db.catalog().unwrap();
    assert_eq!(catalog["unavailable"], json!(["konclave"]));
    assert_eq!(catalog["topics"].as_array().unwrap().len(), 1);
    assert_eq!(catalog["topics"][0]["topic"]["id"], "zcg");
    assert!(db.published("konclave").is_err());
    assert!(db.rollback(&release).is_err());
    assert!(db.visible("7/1").unwrap());
    let mut collision = fixture();
    collision["topic"]["id"] = json!("third");
    assert!(db.publish(collision).is_err());
    assert!(!db.has_release("third").unwrap());
    assert_eq!(db.published("zcg").unwrap()["release_id"], zcg);
}

#[test]
fn schema_two_migrates_zcg_and_pull_without_losing_personal_state() {
    let path = std::env::temp_dir().join(format!("zforum-migration-{}", database::secret()));
    {
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection.execute_batch(include_str!("schema.sql")).unwrap();
        connection.execute_batch("CREATE TABLE source_pulls(id TEXT PRIMARY KEY,snapshot TEXT NOT NULL,completed TEXT NOT NULL); PRAGMA user_version=2;").unwrap();
        connection.execute("INSERT INTO releases VALUES('r',?1,0)", [fixture().to_string()]).unwrap();
        connection.execute("INSERT INTO published VALUES(1,'r')", []).unwrap();
        connection.execute("INSERT INTO current_posts VALUES('7/1',0,'s',NULL)", []).unwrap();
        connection.execute("INSERT INTO accounts(id,label,appearance) VALUES(?1,'Reader','cat')", [A]).unwrap();
        connection.execute("INSERT INTO reading VALUES(?1,'7/1',1,1)", [A]).unwrap();
        connection.execute("INSERT INTO source_pulls VALUES('old',?1,'2026-11-01T00:00:00Z')", [json!({"snapshotAt":"2026-11-01T00:00:00Z","threads":[]}).to_string()]).unwrap();
    }
    {
        let db = Database::open(&path).unwrap();
        assert!(db.has_release("zcg").unwrap());
        assert!(db.visible("7/1").unwrap());
        assert_eq!(db.personal(A).unwrap()["reading"]["7/1"], json!({"bookmarked":true,"read":true}));
        let topic: String = db.connection.query_row("SELECT json_extract(snapshot,'$.topic') FROM source_pulls", [], |row| row.get(0)).unwrap();
        assert_eq!(topic, "zcg");
    }
    std::fs::remove_file(path).unwrap();
}

#[test]
fn preferences_v5_contract_and_ternary_input_are_strict() {
    let contract = json!({"threadView":["all","thread"],"postOrder":["newest","oldest"],"preferredVersion":["neutral","original"],"toneBands":["bad","moderate","good"],"supportBands":["low","medium","high"],"ageBands":["under6","6to12","12to36","36plus","custom"],"postVersions":["rewritten","original"],"interests":["grants"]});
    let prefs = json!({"version":5,"anonymous":false,"toneBands":["bad","good"],"supportBands":[],"ageBands":["custom"],"customAge":{"min":6,"max":12},"postVersions":["rewritten"],"threadView":"all","postOrder":"newest","preferredVersion":"neutral","flagAssumptions":true,"showReframing":true,"highlightNew":true,"showRatings":true,"since":{"kind":"hours","hours":24},"interests":[]});
    account_types::Preferences::validate(&prefs,&contract).unwrap();
    for (key,value,error) in [("version",json!(4),"invalid preferences version or custom account age range"),("toneBands",json!(["good","good"]),"invalid toneBands list"),("ageBands",json!(["invalid"]),"invalid ageBands list"),("customAge",json!({"min":6,"max":6}),"invalid preferences version or custom account age range")] {
        let mut invalid=prefs.clone(); invalid[key]=value;
        assert_eq!(account_types::Preferences::validate(&invalid,&contract).unwrap_err(),error);
    }
    for value in -20..=20 {
        let parsed=serde_json::from_value::<account_types::Reaction>(json!(value));
        assert_eq!(parsed.is_ok(),(-1..=1).contains(&value));
    }
    for value in [json!(1.5),json!("1"),json!(true)] { assert!(serde_json::from_value::<account_types::Reaction>(value).is_err()); }
}

#[tokio::test]
async fn mood_routes_require_session_csrf_origin_and_do_not_accept_impersonation() {
    let mut db=db(); db.publish(fixture()).unwrap();
    let (token,csrf)=db.new_session(A,now()).unwrap();
    let state=Arc::new(Mutex::new(App { db,auth:Auth::new("http://localhost:8000","localhost",PathBuf::from("missing")).unwrap(),contract:json!({}) }));
    let app=router(state.clone(),FsPath::new("site"));
    for (body,session,csrf_header,origin,status) in [
        (r#"{"score":1}"#,false,true,"http://localhost:8000",StatusCode::BAD_REQUEST),
        (r#"{"score":1}"#,true,false,"http://localhost:8000",StatusCode::BAD_REQUEST),
        (r#"{"score":1}"#,true,true,"https://evil.example",StatusCode::FORBIDDEN),
        (r#"{"score":1,"account":"spoof"}"#,true,true,"http://localhost:8000",StatusCode::UNPROCESSABLE_ENTITY),
        (r#"{"score":2}"#,true,true,"http://localhost:8000",StatusCode::UNPROCESSABLE_ENTITY),
        (r#"{"score":1}"#,true,true,"http://localhost:8000",StatusCode::OK),
        (r#"{"score":0}"#,true,true,"http://localhost:8000",StatusCode::OK),
        (r#"{"score":-1}"#,true,true,"http://localhost:8000",StatusCode::OK),
        (r#"{"score":null}"#,true,true,"http://localhost:8000",StatusCode::OK),
    ] {
        let mut request=Request::builder().method("PUT").uri("/api/account/mood/7/1").header("content-type","application/json").header("origin",origin).header("x-zforum-request","1");
        if session { request=request.header("cookie",format!("zforum_session={token}")); }
        if csrf_header { request=request.header("x-csrf-token",&csrf); }
        let response=app.clone().oneshot(request.body(Body::from(body)).unwrap()).await.unwrap();
        assert_eq!(response.status(),status);
        assert_eq!(locked(&state).db.moods(B).unwrap(),json!({}));
    }
    assert_eq!(locked(&state).db.moods(A).unwrap(),json!({}));
}
