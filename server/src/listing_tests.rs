use crate::*;
use axum::body::{Body,to_bytes};
use tower::ServiceExt;
use std::time::Duration;

fn content(id:&str, thread:u64, text:&str) -> Value {
    json!({"format":SITE_DATA_FORMAT,"snapshot_at":"2026-11-05T00:00:00Z","models":["test"],
        "topic":{"id":id,"card":{"title":text,"byline":"byline","keywords":[text],"interests":[]},
        "threads":[{"id":thread,"title":text,"url":"https://example.test/thread","posts":[
            {"key":format!("{thread}/1"),"hidden":false,"raw":text,"reply_to":null,"author":"alice","account":{"created_at":null},"created_at":"2026-11-01T00:00:00Z","analysis":{"neutral_rendition":text}}
        ]}]}})
}

#[test]
fn listing_is_materialized_and_follows_publication_rollback_and_restrictions() {
    let mut db=Database::open(FsPath::new(":memory:")).unwrap();
    let first=db.publish(content("one",1,"first")).unwrap();
    let unrelated=db.publish(content("two",2,"second")).unwrap();
    let listed=db.topic_list().unwrap();
    assert_eq!(listed["topics"][0]["stats"],json!({"threads":1,"posts":1,"participants":1,"medianYears":null,"joinedRecently":0,"unknownAge":1,"lastPostAt":"2026-11-01T00:00:00Z"}));
    assert!(listed["topics"][0]["topic"]["threads"][0].get("posts").is_none());
    db.connection.execute("UPDATE releases SET data='deliberately invalid' WHERE id=?1",[unrelated]).unwrap();
    assert_eq!(db.topic_list().unwrap(),listed);
    assert_eq!(db.published("one").unwrap()["topic"]["card"]["title"],"first");
    assert!(db.published("two").unwrap_err().contains("expected value"));
    db.publish(content("one",1,"changed")).unwrap();
    assert_eq!(db.topic_list().unwrap()["topics"][0]["topic"]["card"]["title"],"changed");
    db.rollback(&first).unwrap();
    assert_eq!(db.topic_list().unwrap(),listed);
    db.connection.execute("INSERT INTO restrictions(post,observed) VALUES('1/1',1)",[]).unwrap();
    let restricted=db.topic_list().unwrap();
    assert_eq!(restricted["topics"][0]["visibility_pending"],true);
    assert_eq!(restricted["topics"][0]["topic"]["card"]["keywords"],json!([]));
    assert_eq!(restricted["topics"][0]["topic"]["card"]["title"],"Discussion");
    assert_eq!(restricted["topics"][1],listed["topics"][1]);
}

#[test]
fn listing_states_the_cutoff_of_the_newest_completed_full_import() {
    let db=Database::open(FsPath::new(":memory:")).unwrap();
    assert_eq!(db.topic_list().unwrap(),json!({"topics":[],"unavailable":[],"last_pull_cutoff":null}));
    let cutoff=||db.topic_list().unwrap()["last_pull_cutoff"].clone();
    let run=|id:&str,until:&str,status:&str,state:Value|{db.connection.execute("INSERT INTO import_runs VALUES(?1,'2026-10-01T00:00:00.000Z',?2,?3,?4)",params![id,until,status,state.to_string()]).unwrap();};
    let status=|id:&str,status:&str|{db.connection.execute("UPDATE import_runs SET status=?1 WHERE id=?2",params![status,id]).unwrap();};
    run("first","2026-11-02T00:00:00.000Z","running",json!({"scope_thread":null}));
    assert_eq!(cutoff(),Value::Null);
    status("first","failed");
    assert_eq!(cutoff(),Value::Null);
    status("first","complete");
    assert_eq!(cutoff(),"2026-11-02T00:00:00.000Z");
    run("one-thread","2026-11-04T00:00:00.000Z","complete",json!({"scope_thread":7}));
    assert_eq!(cutoff(),"2026-11-02T00:00:00.000Z");
    run("predates-scopes","2026-11-03T00:00:00.000Z","complete",json!({}));
    assert_eq!(cutoff(),"2026-11-03T00:00:00.000Z");
    run("newest","2026-11-05T12:34:56.789Z","complete",json!({"scope_thread":null}));
    assert_eq!(cutoff(),"2026-11-05T12:34:56.789Z");
    run("in-progress","2026-11-06T00:00:00.000Z","running",json!({"scope_thread":null}));
    assert_eq!(cutoff(),"2026-11-05T12:34:56.789Z");
}

#[tokio::test(flavor="current_thread")]
async fn slow_reads_are_bounded_and_leave_health_and_other_reads_responsive() {
    let mut db=Database::open(FsPath::new(":memory:")).unwrap();
    db.publish(content("one",1,"first")).unwrap();
    let reader=db.reader();
    let state=Arc::new(Mutex::new(App { db,proxy:proxy::Proxy::Direct,contract:json!({}),
        auth:Auth::new("http://localhost:8000","localhost",PathBuf::from("/bin/true")).unwrap() }));
    let app=router(state,FsPath::new("site"));
    let (started,mut received)=tokio::sync::mpsc::unbounded_channel();
    let barrier=Arc::new(std::sync::Barrier::new(9));
    let mut handles=Vec::new();
    for _ in 0..8 {
        let reader=reader.clone();let started=started.clone();let barrier=barrier.clone();
        handles.push(tokio::spawn(async move { reader.run(move |_| {
            started.send(()).unwrap();barrier.wait();Ok(())
        }).await }));
    }
    for _ in 0..8 { tokio::time::timeout(Duration::from_secs(2),received.recv()).await.unwrap().unwrap(); }
    handles[0].abort();
    assert_eq!(reader.run(|_|Ok(())).await.unwrap_err(),"Database readers busy; retry shortly");
    let start=std::time::Instant::now();
    let response=tokio::time::timeout(Duration::from_millis(500),app.clone().oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())).await.unwrap().unwrap();
    assert_eq!(response.status(),StatusCode::OK);
    eprintln!("health with eight blocked readers: {:?}",start.elapsed());
    let response=app.clone().oneshot(Request::builder().uri("/data/topics.json").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(response.status(),StatusCode::SERVICE_UNAVAILABLE);
    barrier.wait();
    for handle in handles { let _=handle.await; }
    let response=app.oneshot(Request::builder().uri("/data/topics.json").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(response.status(),StatusCode::OK);
    let body:Value=serde_json::from_slice(&to_bytes(response.into_body(),16384).await.unwrap()).unwrap();
    assert_eq!(body["topics"][0]["topic"]["id"],"one");
}
