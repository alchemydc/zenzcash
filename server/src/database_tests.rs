use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use tower::ServiceExt;
const A: &str = "11111111-1111-4111-8111-111111111111";
const B: &str = "22222222-2222-4222-8222-222222222222";
fn fixture() -> Value {
    json!({"format":SITE_DATA_FORMAT,"models":["test"],"topic":{"threads":[{"posts":[{"key":"7/1","hidden":false,"raw":"original","reply_to":null,"author":"alice","created_at":"2026-11-01T00:00:00Z","analysis":{"neutral_rendition":"rendition"}}]}]}})
}
fn db() -> Database {
    let db = Database::open(FsPath::new(":memory:")).unwrap();
    db.create_account(A).unwrap();
    db.create_account(B).unwrap();
    db
}
fn rendition(db: &Database) -> String {
    db.published().unwrap()["topic"]["threads"][0]["posts"][0]["rendition_version"]
        .as_str()
        .unwrap()
        .into()
}
#[test]
fn feedback_is_exact_versioned_idempotent_and_independent() {
    let mut db = db();
    db.publish(fixture()).unwrap();
    let first = rendition(&db);
    db.set_feedback(A, "7/1", &first, Some(-5), Some(8))
        .unwrap();
    db.set_feedback(A, "7/1", &first, Some(-5), Some(8))
        .unwrap();
    assert_eq!(db.progress(A).unwrap(), json!({"emotions":-5.0,"head":8.0}));
    assert_eq!(
        db.report().unwrap()["distributions"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(db.feedback(B).unwrap(), json!({}));
    let mut changed = fixture();
    changed["topic"]["threads"][0]["posts"][0]["analysis"]["neutral_rendition"] =
        json!("another wording");
    db.publish(changed).unwrap();
    let second = rendition(&db);
    assert_ne!(first, second);
    assert_eq!(db.feedback(A).unwrap(), json!({}));
    assert!(
        db.set_feedback(A, "7/1", &first, Some(10), Some(10))
            .is_err()
    );
    db.set_feedback(A, "7/1", &second, Some(10), Some(-2))
        .unwrap();
    assert_eq!(
        db.progress(A).unwrap(),
        json!({"emotions":10.0,"head":-2.0})
    );
    db.set_feedback(A, "7/1", &second, None, Some(-2)).unwrap();
    assert_eq!(db.progress(A).unwrap(), json!({"emotions":0.0,"head":-2.0}));
    assert_eq!(
        db.feedback(A).unwrap(),
        json!({"7/1":{"emotions":null,"head":-2}})
    );
    for bad in [-11, 11] {
        assert!(db.set_feedback(A, "7/1", &second, Some(bad), None).is_err());
    }
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
    assert!(db.published().is_err());
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
    headers.insert("x-zforum-request", "1".parse().unwrap());
    auth.verify_origin(&headers).unwrap();
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
    let directory=std::env::temp_dir().join(format!("zforum-static-{}",database::secret()));std::fs::create_dir_all(directory.join("data")).unwrap();std::fs::write(directory.join("data/zcg.json"),"PRIVATE OLD CONTENT").unwrap();
    let mut db=db();db.publish(fixture()).unwrap();db.restrict(&["7/1".into()]).unwrap();
    let state=Arc::new(Mutex::new(App{db,auth:Auth::new("http://localhost:8000","localhost",PathBuf::from("missing")).unwrap(),contract:json!({})}));let app=router(state,&directory);
    for path in ["/data/zcg.json","/data//zcg.json","/data/%7Acg.json","/js/../data/zcg.json","/js/%2e%2e/data/zcg.json"] {
        let response=app.clone().oneshot(Request::builder().uri(path).body(Body::empty()).unwrap()).await.unwrap();
        assert!(!response.status().is_success(),"{path}");let bytes=to_bytes(response.into_body(),65536).await.unwrap();assert!(!String::from_utf8_lossy(&bytes).contains("PRIVATE OLD CONTENT"));
    }
    std::fs::remove_dir_all(directory).unwrap();
}
