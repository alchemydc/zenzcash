use crate::database::Result;
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::{Semaphore, oneshot},
};

const MESSAGE_LIMIT: usize = 131072;
const CONCURRENCY: usize = 2;
const DEADLINE: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct Verifier {
    helper: PathBuf,
    rp_id: String,
    origin: String,
    permits: Arc<Semaphore>,
}

impl Verifier {
    pub fn new(helper: PathBuf, rp_id: String, origin: String) -> Self {
        Self {
            helper,
            rp_id,
            origin,
            permits: Arc::new(Semaphore::new(CONCURRENCY)),
        }
    }

    pub async fn call(self, operation: Value) -> Result<Value> {
        let request =
            json!({"rp_id": self.rp_id, "origin": self.origin, "operation": operation}).to_string();
        if request.len() > MESSAGE_LIMIT {
            return Err("WebAuthn request exceeds limit".into());
        }
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| "Passkey verifier busy; retry shortly")?;
        let (mut sender, receiver) = oneshot::channel();
        // The supervisor owns cleanup and its permit even when the HTTP future is dropped.
        // No independent pipe tasks can outlive this supervisor.
        tokio::spawn(async move {
            let result = self.run(request, &mut sender).await;
            drop(permit);
            // A canceled request deliberately has no recipient for the cleaned-up result.
            let _ = sender.send(result);
        });
        receiver
            .await
            .map_err(|_| "WebAuthn verifier supervisor failed")?
    }

    async fn run(
        &self,
        request: String,
        sender: &mut oneshot::Sender<Result<Value>>,
    ) -> Result<Value> {
        if sender.is_closed() {
            return Err("WebAuthn request canceled".into());
        }
        let mut child = Command::new(&self.helper)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("starting WebAuthn verifier: {e}"))?;
        let input = child.stdin.take().expect("piped verifier input");
        let output = child.stdout.take().expect("piped verifier output");
        let result = {
            let exchange = async {
                let write = async move {
                    let mut input = input;
                    input
                        .write_all(request.as_bytes())
                        .await
                        .map_err(|e| format!("writing verifier request: {e}"))?;
                    input
                        .shutdown()
                        .await
                        .map_err(|e| format!("closing verifier input: {e}"))
                };
                let read = async move {
                    let mut bytes = Vec::new();
                    output
                        .take((MESSAGE_LIMIT + 1) as u64)
                        .read_to_end(&mut bytes)
                        .await
                        .map_err(|e| format!("reading verifier result: {e}"))?;
                    if bytes.len() > MESSAGE_LIMIT {
                        return Err("verifier response exceeds limit".into());
                    }
                    Ok(bytes)
                };
                let wait = async {
                    child
                        .wait()
                        .await
                        .map_err(|e| format!("waiting for verifier: {e}"))
                };
                let (_, bytes, status) = tokio::try_join!(write, read, wait)?;
                if !status.success() {
                    return Err("WebAuthn verification failed".into());
                }
                serde_json::from_slice(&bytes).map_err(|e| format!("invalid verifier result: {e}"))
            };
            tokio::select! {
                result = exchange => result,
                _ = sender.closed() => Err("WebAuthn request canceled".into()),
                _ = tokio::time::sleep(DEADLINE) => Err("WebAuthn verifier timed out".into()),
            }
        };
        if result.is_err() {
            // start_kill also succeeds for an already reaped child; wait reaps a live one.
            child
                .start_kill()
                .map_err(|e| format!("terminating verifier: {e}"))?;
            child
                .wait()
                .await
                .map_err(|e| format!("reaping verifier: {e}"))?;
        }
        result
    }
}
