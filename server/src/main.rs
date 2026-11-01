//! The design prototype's server: serves the static page and stores mind-change ratings.
//! Usage: zforum-server --site <dir> --ratings <file> --port <n>
//! It binds to 127.0.0.1 only.

mod ratings;

use axum::Router;
use axum::extract::{DefaultBodyLimit, Json, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use ratings::{Counts, Level, PostKey, ReaderId, SetError, Store};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tower_http::services::ServeDir;

struct Config {
    site: PathBuf,
    ratings: PathBuf,
    port: u16,
}

fn parse_args(args: &[String]) -> Result<Config, String> {
    let mut site = None;
    let mut ratings = None;
    let mut port = None;
    let mut rest = args.iter();
    while let Some(flag) = rest.next() {
        let value = rest.next().ok_or_else(|| format!("{flag} needs a value"))?;
        match flag.as_str() {
            "--site" => site = Some(PathBuf::from(value)),
            "--ratings" => ratings = Some(PathBuf::from(value)),
            "--port" => port = Some(value.parse::<u16>().map_err(|error| format!("--port {value:?}: {error}"))?),
            other => return Err(format!("unknown argument {other:?}")),
        }
    }
    Ok(Config {
        site: site.ok_or("missing --site <dir>")?,
        ratings: ratings.ok_or("missing --ratings <file>")?,
        port: port.ok_or("missing --port <n>")?,
    })
}

/// The site data file the page reads; the server takes the list of ratable posts from it.
#[derive(Deserialize)]
struct SiteData {
    format: String,
    topic: SiteTopic,
}
#[derive(Deserialize)]
struct SiteTopic {
    threads: Vec<SiteThread>,
}
#[derive(Deserialize)]
struct SiteThread {
    posts: Vec<SitePost>,
}
#[derive(Deserialize)]
struct SitePost {
    key: PostKey,
    hidden: bool,
}

const SITE_DATA_FORMAT: &str = "zforum-design-1";

fn visible_posts(site: &std::path::Path) -> Result<BTreeSet<PostKey>, String> {
    let path = site.join("data/zcg.json");
    let text = std::fs::read_to_string(&path).map_err(|error| format!("reading {}: {error} (run node tools/build.mjs first)", path.display()))?;
    let data: SiteData = serde_json::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))?;
    if data.format != SITE_DATA_FORMAT {
        return Err(format!("{}: format is {:?}, expected {SITE_DATA_FORMAT:?}", path.display(), data.format));
    }
    Ok(data.topic.threads.into_iter().flat_map(|thread| thread.posts).filter(|post| !post.hidden).map(|post| post.key).collect())
}

type Shared = Arc<Mutex<Store>>;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReaderQuery {
    reader: ReaderId,
}

#[derive(Serialize)]
struct AllRatings {
    posts: BTreeMap<PostKey, Counts>,
    mine: BTreeMap<PostKey, Level>,
}

async fn list_ratings(State(store): State<Shared>, Query(query): Query<ReaderQuery>) -> Json<AllRatings> {
    let store = store.lock().expect("a panic while holding the ratings lock is a bug");
    Json(AllRatings { posts: store.all_counts(), mine: store.mine(&query.reader) })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SetRequest {
    reader: ReaderId,
    rating: Option<Level>,
}

#[derive(Serialize)]
struct PostRatings {
    counts: Counts,
    mine: Option<Level>,
}

async fn set_rating(State(store): State<Shared>, Path((topic, post)): Path<(u64, u64)>, Json(request): Json<SetRequest>) -> Response {
    let key = match PostKey::from_parts(topic, post) {
        Ok(key) => key,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let mut store = store.lock().expect("a panic while holding the ratings lock is a bug");
    match store.set(&key, request.reader.clone(), request.rating) {
        Ok(()) => Json(PostRatings { counts: store.counts(&key), mine: store.rating_of(&key, &request.reader) }).into_response(),
        Err(SetError::UnknownPost(key)) => (StatusCode::NOT_FOUND, format!("{key:?} is not a visible post")).into_response(),
        Err(SetError::Save(message)) => {
            eprintln!("{message}");
            (StatusCode::INTERNAL_SERVER_ERROR, message).into_response()
        }
    }
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let config = parse_args(&args).unwrap_or_else(|message| {
        eprintln!("{message}\nusage: zforum-server --site <dir> --ratings <file> --port <n>");
        std::process::exit(2);
    });
    let store = visible_posts(&config.site)
        .and_then(|posts| Store::open(&config.ratings, posts))
        .unwrap_or_else(|message| {
            eprintln!("{message}");
            std::process::exit(1);
        });
    let app = Router::new()
        .route("/api/ratings", get(list_ratings))
        .route("/api/ratings/{topic}/{post}", put(set_rating))
        .layer(DefaultBodyLimit::max(1024))
        .with_state(Arc::new(Mutex::new(store)))
        .fallback_service(ServeDir::new(&config.site));
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, config.port));
    let listener = tokio::net::TcpListener::bind(address).await.unwrap_or_else(|error| {
        eprintln!("binding {address}: {error}");
        std::process::exit(1);
    });
    println!("zforum design prototype on http://{address}/");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.expect("installing the Ctrl-C handler");
        })
        .await
        .unwrap_or_else(|error| {
            eprintln!("server error: {error}");
            std::process::exit(1);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|arg| (*arg).to_owned()).collect()
    }

    #[test]
    fn all_three_arguments_are_required() {
        let config = parse_args(&args(&["--site", "s", "--ratings", "r.json", "--port", "8000"])).unwrap();
        assert_eq!((config.site, config.ratings, config.port), (PathBuf::from("s"), PathBuf::from("r.json"), 8000));
        assert_eq!(parse_args(&args(&["--site", "s", "--ratings", "r.json"])).err(), Some("missing --port <n>".to_owned()));
        assert_eq!(parse_args(&args(&["--site", "s", "--port", "8000"])).err(), Some("missing --ratings <file>".to_owned()));
        assert_eq!(parse_args(&args(&["--site"])).err(), Some("--site needs a value".to_owned()));
        assert_eq!(parse_args(&args(&["--bogus", "x"])).err(), Some("unknown argument \"--bogus\"".to_owned()));
        assert!(parse_args(&args(&["--site", "s", "--ratings", "r", "--port", "70000"])).err().unwrap().starts_with("--port \"70000\": "));
    }
}
