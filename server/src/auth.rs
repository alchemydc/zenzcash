use crate::database::{Database, RECENT_SECONDS, Result, SESSION_SECONDS, hash, now, secret};
use axum::http::{HeaderMap, HeaderValue, header};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub struct Challenge {
    pub expires: i64,
    pub account: Option<String>,
    pub operation: String,
    pub state: Value,
    pub recovery: Option<String>,
    pub session: Option<String>,
}
pub struct Auth {
    pub origin: String,
    pub rp_id: String,
    pub helper: PathBuf,
    pub secure: bool,
    pub challenges: HashMap<String, Challenge>,
    pub limits: HashMap<String, (i64, u32)>,
}
impl Auth {
    pub fn new(origin: &str, rp_id: &str, helper: PathBuf) -> Result<Self> {
        let url =
            url::Url::parse(origin).map_err(|e| format!("invalid authentication origin: {e}"))?;
        if url.origin().ascii_serialization() != origin
            || url.host_str() != Some(rp_id)
            || !(url.scheme() == "https" || url.scheme() == "http" && rp_id == "localhost")
        {
            return Err("origin must be an exact HTTPS origin with matching RP domain (http://localhost is allowed for development)".into());
        }
        Ok(Self {
            origin: origin.into(),
            rp_id: rp_id.into(),
            helper,
            secure: url.scheme() == "https",
            challenges: HashMap::new(),
            limits: HashMap::new(),
        })
    }
    pub fn verify_origin(&self, headers: &HeaderMap) -> Result<()> {
        if headers.get(header::ORIGIN).and_then(|h| h.to_str().ok()) != Some(&self.origin) {
            return Err(format!("Open {}/ to use accounts; this request came from a different website address.", self.origin));
        }
        if headers
                .get("x-zforum-request")
                .and_then(|h| h.to_str().ok())
                != Some("1")
        {
            return Err("Required request header missing or invalid; refresh the page before trying again.".into());
        }
        Ok(())
    }
    pub fn rate_limit(&mut self, key: &str, max: u32, timestamp: i64) -> Result<()> {
        self.limits.retain(|_, (at, _)| timestamp - *at < 60);
        if !self.limits.contains_key(key) && self.limits.len() >= 10000 {
            return Err("rate limiter is full; retry in a minute".into());
        }
        let entry = self.limits.entry(key.into()).or_insert((timestamp, 0));
        entry.1 += 1;
        if entry.1 > max {
            return Err("too many requests; retry in a minute".into());
        }
        Ok(())
    }
    pub fn available(&self) -> bool {
        self.helper.is_file()
    }
    pub fn call(&self, operation: Value) -> Result<Value> {
        if !self.available() {
            return Err("Passkeys are unavailable: build the maintained WebAuthn verifier before enabling accounts.".into());
        }
        let request =
            json!({"rp_id":self.rp_id,"origin":self.origin,"operation":operation}).to_string();
        if request.len() > 131072 {
            return Err("WebAuthn request exceeds limit".into());
        }
        let mut child = Command::new(&self.helper)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("starting WebAuthn verifier: {e}"))?;
        let mut input = child.stdin.take().expect("piped verifier input");
        let output = child.stdout.take().expect("piped verifier output");
        // Drain while writing so neither bounded pipe can deadlock the request.
        let reader = std::thread::spawn(move || {
            let mut text = String::new();
            output.take(131073).read_to_string(&mut text).map(|_| text)
        });
        let writer = std::thread::spawn(move || input.write_all(request.as_bytes()));
        let start = Instant::now();
        let outcome = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) if start.elapsed() < Duration::from_secs(10) => {
                    std::thread::sleep(Duration::from_millis(10))
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err("WebAuthn verifier timed out".to_owned());
                }
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(format!("waiting for verifier: {e}"));
                }
            }
        };
        let written = writer
            .join()
            .map_err(|_| "verifier input thread panicked")?;
        let text = reader
            .join()
            .map_err(|_| "verifier output thread panicked")?
            .map_err(|e| format!("reading verifier result: {e}"))?;
        if !outcome?.success() {
            return Err("WebAuthn verification failed".into());
        }
        written.map_err(|e| format!("writing verifier request: {e}"))?;
        if text.len() > 131072 {
            return Err("verifier response exceeds limit".into());
        }
        serde_json::from_str(&text).map_err(|e| format!("invalid verifier result: {e}"))
    }
    pub fn challenge(&mut self, value: Challenge) -> String {
        self.challenges.retain(|_, c| c.expires > now());
        let token = secret();
        self.challenges.insert(hash(&token), value);
        token
    }
    pub fn take_challenge(&mut self, headers: &HeaderMap) -> Result<Challenge> {
        let token =
            cookie(headers, "zforum_challenge").ok_or("missing authentication challenge")?;
        let value = self
            .challenges
            .remove(&hash(&token))
            .ok_or("authentication challenge was used or is unknown")?;
        if value.expires <= now() {
            return Err("authentication challenge expired".into());
        }
        Ok(value)
    }
    pub fn cookie(&self, name: &str, value: &str, age: i64) -> HeaderValue {
        HeaderValue::from_str(&format!(
            "{name}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{}",
            if self.secure { "; Secure" } else { "" }
        ))
        .expect("generated cookie contains only valid characters")
    }
    pub fn session_headers(&self, token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.append(
            header::SET_COOKIE,
            self.cookie("zforum_session", token, SESSION_SECONDS),
        );
        headers.append(header::SET_COOKIE, self.cookie("zforum_challenge", "", 0));
        headers
    }
}
pub fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let value = headers.get(header::COOKIE)?.to_str().ok()?;
    value.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        if key == name
            && value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            Some(value.to_owned())
        } else {
            None
        }
    })
}
pub fn account(db: &Database, headers: &HeaderMap, write: bool, recent: bool) -> Result<String> {
    let token = cookie(headers, "zforum_session").ok_or("sign in to save account data")?;
    let (id, verified, csrf) = db
        .session(&token, now())?
        .ok_or("session expired; sign in again")?;
    if write
        && headers
            .get("x-csrf-token")
            .and_then(|v| v.to_str().ok())
            .map(hash)
            .as_deref()
            != Some(hash(&csrf).as_str())
    {
        return Err("CSRF token rejected".into());
    }
    if recent && now() - verified > RECENT_SECONDS {
        return Err("sign in again to verify this account change (within five minutes)".into());
    }
    Ok(id)
}
