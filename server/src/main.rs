mod api;
use api::router;
mod account_types;
mod auth;
mod verifier;
#[cfg(test)]
mod verifier_tests;
#[cfg(test)]
mod progress_tests;
mod content;
mod listing;
#[cfg(test)]
mod listing_tests;
mod merge;
mod proxy;
mod publication;
mod visibility;
#[cfg(test)]
mod publication_tests;
#[cfg(test)]
mod merge_tests;
mod database;
mod reading;
#[cfg(test)]
mod database_tests;
#[cfg(test)]
mod feedback;
#[cfg(test)]
mod ratings;
#[cfg(test)]
mod store;

use auth::{Auth, Challenge, account, cookie};
use axum::{
    Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use database::{Database, hash, now};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path as FsPath, PathBuf},
    sync::{Arc, Mutex},
};
const SITE_DATA_FORMAT: &str = "zforum-design-4";
struct App {
    db: Database,
    auth: Auth,
    contract: Value,
    proxy: proxy::Proxy,
}
type Shared = Arc<Mutex<App>>;
type ApiResult = Result<Response, ApiError>;
struct ApiError(StatusCode, String);
impl From<String> for ApiError {
    fn from(message: String) -> Self {
        Self(StatusCode::BAD_REQUEST, message)
    }
}
impl From<&str> for ApiError {
    fn from(message: &str) -> Self {
        Self::from(message.to_owned())
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
fn locked(state: &Shared) -> std::sync::MutexGuard<'_, App> {
    state.lock().expect("application lock poisoned")
}
fn sql(error: rusqlite::Error) -> ApiError {
    eprintln!("database operation failed: {error}");
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Could not save account data.".into(),
    )
}

fn read_json(path: &FsPath) -> Result<Value, String> {
    serde_json::from_str(
        &std::fs::read_to_string(path).map_err(|e| format!("reading {}: {e}", path.display()))?,
    )
    .map_err(|e| format!("{}: {e}", path.display()))
}
#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
async fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command=args.first().ok_or("usage: zforum-server serve|publish|merge|restrict|record-pull|rollback|backup|report|import-history --db <path> [options]")?;
    let mut flags = std::collections::BTreeMap::new();
    for pair in args[1..].chunks(2) {
        if pair.len() != 2
            || !pair[0].starts_with("--")
            || flags.insert(pair[0].as_str(), pair[1].as_str()).is_some()
        {
            return Err("flags must be unique --name value pairs".into());
        }
    }
    let flag = |key: &str| {
        flags
            .get(key)
            .copied()
            .ok_or_else(|| format!("missing {key}"))
    };
    let db_path = PathBuf::from(flag("--db")?);
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("database directory: {e}"))?;
    }
    let mut db = Database::open(&db_path)?;
    match command.as_str() {
        "publish" => {
            println!("{}", db.publish(read_json(FsPath::new(flag("--file")?))?)?);
            return Ok(());
        }
        "publish-import" => {
            let request: publication::PublicationRequest=serde_json::from_value(read_json(FsPath::new(flag("--file")?))?).map_err(|e|format!("invalid publication request: {e}"))?;
            println!("{}",db.publish_import(request)?);
            return Ok(());
        }
        "merge" => {
            let request: merge::MergeRequest=serde_json::from_value(read_json(FsPath::new(flag("--file")?))?).map_err(|e|format!("invalid merge request: {e}"))?;
            println!("{}",db.merge(request)?);
            return Ok(());
        }
        "restrict" => {
            let keys: Vec<String> =
                serde_json::from_value(read_json(FsPath::new(flag("--file")?))?)
                    .map_err(|e| e.to_string())?;
            db.restrict(&keys)?;
            return Ok(());
        }
        "record-pull" => {
            db.record_pull(read_json(FsPath::new(flag("--file")?))?)?;
            return Ok(());
        }
        "reset-content" => {
            db.backup(FsPath::new(flag("--backup")?))?;
            db.reset_content()?;
            println!("Cleared content and content-dependent state; accounts and credentials retained.");
            return Ok(());
        }
        "rollback" => {
            println!("{}", db.rollback(flag("--release")?)?);
            return Ok(());
        }
        "backup" => {
            db.backup(FsPath::new(flag("--to")?))?;
            return Ok(());
        }
        "report" => {
            println!(
                "{}",
                serde_json::to_string_pretty(&db.report()?).map_err(|e| e.to_string())?
            );
            return Ok(());
        }
        "import-history" => {
            let path = flag("--file")?;
            let value = read_json(FsPath::new(path))?;
            db.connection
                .execute(
                    "INSERT INTO historical(name,data) VALUES(?1,?2)",
                    params![path, value.to_string()],
                )
                .map_err(|e| e.to_string())?;
            println!("Imported as unattributed history; no account votes were created.");
            return Ok(());
        }
        "serve" => {}
        _ => return Err(format!("unknown command {command}")),
    }
    let site = PathBuf::from(flag("--site")?);
    if db_path
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(site.canonicalize().map_err(|e| e.to_string())?)
    {
        return Err("private database must be outside the served site directory".into());
    }
    let auth = Auth::new(
        flag("--origin")?,
        flag("--rp-id")?,
        PathBuf::from(flag("--webauthn")?),
    )?;
    if !auth.available() {
        eprintln!(
            "Passkeys disabled: WebAuthn verifier is unavailable. Guest browsing remains available."
        );
    }
    let public_origin = auth.origin.clone();
    let app = Arc::new(Mutex::new(App {
        db,
        auth,
        contract: read_json(&site.join("data/reading-contract.json"))?,
        proxy: proxy::Proxy::parse(flags.get("--proxy").copied().unwrap_or("direct"))?,
    }));
    let port = flag("--port")?
        .parse::<u16>()
        .map_err(|e| format!("port: {e}"))?;
    let host = match flags.get("--host") {
        Some(value) => value.parse::<IpAddr>().map_err(|e| format!("host {value}: {e}"))?,
        None => IpAddr::V4(Ipv4Addr::LOCALHOST),
    };
    let address = SocketAddr::from((host, port));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .map_err(|e| format!("binding {address}: {e}"))?;
    println!("zforum on {public_origin}/");
    axum::serve(
        listener,
        router(app, &site).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        tokio::signal::ctrl_c().await.expect("Ctrl-C handler");
    })
    .await
    .map_err(|e| e.to_string())
}
