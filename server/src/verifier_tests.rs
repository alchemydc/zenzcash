use crate::{verifier::Verifier, *};
use axum::body::{Body, to_bytes};
use std::{os::unix::fs::PermissionsExt, time::Duration};
use tower::ServiceExt;

struct Helper {
    directory: PathBuf,
    path: PathBuf,
}
impl Helper {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("zforum-verifier-{}", database::secret()));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("helper");
        std::fs::write(&path, r#"#!/usr/bin/python3
import json, os, sys, time
request = json.load(sys.stdin)
op = request['operation']
with open(__file__ + '.' + str(os.getpid()), 'w') as f:
    f.write(str(os.getpid()))
kind = op.get('test', 'normal')
if kind == 'hang': time.sleep(60)
if kind == 'delay' or op.get('kind', '').startswith('Finish'): time.sleep(0.3)
if kind == 'invalid': print('invalid'); sys.exit(0)
if kind == 'large': print('x' * 131073); sys.exit(0)
if kind == 'failure': sys.exit(1)
if op.get('kind') == 'FinishAuthenticate':
    print(json.dumps({'id': op['credential']['id'], 'account': op['account'], 'credential': op['passkey']}))
else:
    print(json.dumps({'public': {}, 'state': {}}))
"#).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        Self { directory, path }
    }
    fn verifier(&self) -> Verifier {
        Verifier::new(
            self.path.clone(),
            "localhost".into(),
            "http://localhost:8000".into(),
        )
    }
    fn pids(&self) -> Vec<u32> {
        std::fs::read_dir(&self.directory)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p != &self.path)
            .map(|p| std::fs::read_to_string(p).unwrap().parse().unwrap())
            .collect()
    }
    async fn started(&self, count: usize) {
        tokio::time::timeout(Duration::from_secs(3), async {
            while self.pids().len() < count {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
    }
    async fn reaped(&self) {
        tokio::time::timeout(Duration::from_secs(3), async {
            while self
                .pids()
                .iter()
                .any(|pid| FsPath::new(&format!("/proc/{pid}")).exists())
            {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
    }
}
impl Drop for Helper {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.directory).unwrap();
    }
}

#[tokio::test(flavor = "current_thread")]
async fn verifier_handles_success_errors_bounds_timeout_and_cancellation() {
    let helper = Helper::new();
    let verifier = helper.verifier();
    assert_eq!(
        verifier.clone().call(json!({})).await.unwrap(),
        json!({"public":{},"state":{}})
    );
    for (kind, error) in [
        ("large", "verifier response exceeds limit"),
        ("failure", "WebAuthn verification failed"),
    ] {
        assert_eq!(
            verifier
                .clone()
                .call(json!({"test":kind}))
                .await
                .unwrap_err(),
            error
        );
        helper.reaped().await;
    }
    assert_eq!(
        verifier
            .clone()
            .call(json!({"test":"invalid"}))
            .await
            .unwrap_err(),
        "invalid verifier result: expected value at line 1 column 1"
    );
    assert_eq!(
        verifier
            .clone()
            .call(json!({"text":"x".repeat(131072)}))
            .await
            .unwrap_err(),
        "WebAuthn request exceeds limit"
    );
    assert_eq!(
        verifier
            .clone()
            .call(json!({"test":"hang"}))
            .await
            .unwrap_err(),
        "WebAuthn verifier timed out"
    );
    helper.reaped().await;
    let before = helper.pids().len();
    let first = tokio::spawn(verifier.clone().call(json!({"test":"hang"})));
    let second = tokio::spawn(verifier.clone().call(json!({"test":"hang"})));
    helper.started(before + 2).await;
    assert_eq!(
        verifier.clone().call(json!({})).await.unwrap_err(),
        "Passkey verifier busy; retry shortly"
    );
    first.abort();
    second.abort();
    assert!(first.await.unwrap_err().is_cancelled());
    assert!(second.await.unwrap_err().is_cancelled());
    helper.reaped().await;
    assert_eq!(
        verifier.call(json!({})).await.unwrap(),
        json!({"public":{},"state":{}})
    );
}

fn state(helper: &Helper) -> Shared {
    Arc::new(Mutex::new(App {
        db: Database::open(FsPath::new(":memory:")).unwrap(),
        auth: Auth::new("http://localhost:8000", "localhost", helper.path.clone()).unwrap(),
        contract: json!({}),
        proxy: proxy::Proxy::Direct,
    }))
}
fn finish(token: &str) -> Request {
    Request::builder()
        .method("POST")
        .uri("/api/auth/finish")
        .header("origin", "http://localhost:8000")
        .header("x-zforum-request", "1")
        .header("content-type", "application/json")
        .header("cookie", format!("zforum_challenge={token}"))
        .body(Body::from(r#"{"credential":{"id":"key"}}"#))
        .unwrap()
}

#[tokio::test(flavor = "current_thread")]
async fn slow_login_does_not_lock_health_and_rechecks_credentials() {
    for change in [
        "none",
        "delete-account",
        "delete-credential",
        "update-credential",
        "expire",
    ] {
        let helper = Helper::new();
        let state = state(&helper);
        let token = {
            let mut app = locked(&state);
            app.db.create_account("test-account").unwrap();
            app.db
                .save_credential("key", "test-account", &json!({"counter":0}))
                .unwrap();
            app.auth.challenge(Challenge {
                expires: if change == "expire" {
                    now()
                } else {
                    now() + 300
                },
                account: None,
                operation: "login".into(),
                state: json!({}),
                recovery: None,
                session: None,
            })
        };
        let router = router(state.clone(), FsPath::new("site"));
        let request = tokio::spawn(router.clone().oneshot(finish(&token)));
        if change != "expire" {
            helper.started(1).await;
            let start = std::time::Instant::now();
            let health = tokio::time::timeout(
                Duration::from_millis(150),
                router.clone().oneshot(
                    Request::builder()
                        .uri("/healthz")
                        .body(Body::empty())
                        .unwrap(),
                ),
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(health.status(), StatusCode::OK);
            eprintln!(
                "single-worker health during verification ({change}): {:?}",
                start.elapsed()
            );
            let replay = router.clone().oneshot(finish(&token)).await.unwrap();
            assert_eq!(replay.status(), StatusCode::BAD_REQUEST);
            let app = locked(&state);
            match change {
                "delete-account" => {
                    app.db
                        .connection
                        .execute("DELETE FROM accounts WHERE id='test-account'", [])
                        .unwrap();
                }
                "delete-credential" => {
                    app.db
                        .connection
                        .execute("DELETE FROM credentials WHERE id='key'", [])
                        .unwrap();
                }
                "update-credential" => {
                    app.db
                        .save_credential("key", "test-account", &json!({"counter":1}))
                        .unwrap();
                }
                "none" => {}
                _ => unreachable!(),
            }
        }
        let response = request.await.unwrap().unwrap();
        assert_eq!(
            response.status(),
            if change == "none" {
                StatusCode::OK
            } else {
                StatusCode::BAD_REQUEST
            },
            "{change}"
        );
        let body: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap();
        if change != "none" {
            assert_eq!(
                body["error"],
                if change == "expire" {
                    "authentication challenge expired"
                } else {
                    "credential changed during verification; sign in again"
                }
            );
        }
        let count: i64 = locked(&state)
            .db
            .connection
            .query_row("SELECT count(*) FROM sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, if change == "none" { 1 } else { 0 });
        helper.reaped().await;
    }
}
