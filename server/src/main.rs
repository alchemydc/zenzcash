//! The design prototype's server: serves the static page, stores mind-change ratings, and
//! stores restatement feedback.
//! Usage: zforum-server --site <dir> --ratings <file> --feedback <file> --port <n>
//! It binds to 127.0.0.1 only.

mod feedback;
mod ratings;
mod store;

use axum::Router;
use axum::extract::{DefaultBodyLimit, Json, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use feedback::{Answers, Score};
use ratings::{Counts, Level};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use store::{PostKey, ReaderId, SetError, Store};
use tower_http::services::ServeDir;

#[derive(Debug, PartialEq, Eq)]
struct Config {
    site: PathBuf,
    ratings: PathBuf,
    feedback: PathBuf,
    port: u16,
}

const USAGE: &str = "usage: zforum-server --site <dir> --ratings <file> --feedback <file> --port <n>";

fn parse_args(args: &[String]) -> Result<Config, String> {
    let mut site = None;
    let mut ratings = None;
    let mut feedback = None;
    let mut port = None;
    let mut rest = args.iter();
    while let Some(flag) = rest.next() {
        let value = rest.next().ok_or_else(|| format!("{flag} needs a value"))?;
        match flag.as_str() {
            "--site" => site = Some(PathBuf::from(value)),
            "--ratings" => ratings = Some(PathBuf::from(value)),
            "--feedback" => feedback = Some(PathBuf::from(value)),
            "--port" => port = Some(value.parse::<u16>().map_err(|error| format!("--port {value:?}: {error}"))?),
            other => return Err(format!("unknown argument {other:?}")),
        }
    }
    Ok(Config {
        site: site.ok_or("missing --site <dir>")?,
        ratings: ratings.ok_or("missing --ratings <file>")?,
        feedback: feedback.ok_or("missing --feedback <file>")?,
        port: port.ok_or("missing --port <n>")?,
    })
}

/// The site data file the page reads; the server takes the posts it accepts answers for
/// from it.
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
    analysis: Option<SiteAnalysis>,
}

#[derive(Deserialize)]
struct SiteAnalysis {
    neutral_rendition: Option<String>,
}

const SITE_DATA_FORMAT: &str = "zforum-design-4";

/// Readers rate visible posts, and give feedback on posts that have a restatement.
struct AcceptedPosts {
    visible: BTreeSet<PostKey>,
    restated: BTreeSet<PostKey>,
}

fn accepted_posts(text: &str) -> Result<AcceptedPosts, String> {
    let data: SiteData = serde_json::from_str(text).map_err(|error| error.to_string())?;
    if data.format != SITE_DATA_FORMAT {
        return Err(format!("format is {:?}, expected {SITE_DATA_FORMAT:?}", data.format));
    }
    let visible: Vec<SitePost> = data.topic.threads.into_iter().flat_map(|thread| thread.posts).filter(|post| !post.hidden).collect();
    for post in &visible {
        if post.analysis.is_none() {
            return Err(format!("visible post {:?} has no analysis", post.key));
        }
    }
    Ok(AcceptedPosts {
        restated: visible.iter().filter(|post| post.analysis.as_ref().is_some_and(|analysis| analysis.neutral_rendition.is_some())).map(|post| post.key.clone()).collect(),
        visible: visible.into_iter().map(|post| post.key).collect(),
    })
}

fn read_accepted_posts(site: &std::path::Path) -> Result<AcceptedPosts, String> {
    let path = site.join("data/zcg.json");
    let text = std::fs::read_to_string(&path).map_err(|error| format!("reading {}: {error} (run node tools/build.mjs first)", path.display()))?;
    accepted_posts(&text).map_err(|message| format!("{}: {message}", path.display()))
}

struct Stores {
    ratings: Mutex<Store<Level>>,
    feedback: Mutex<Store<Answers>>,
}

type Shared = Arc<Stores>;

const LOCK_POISONED: &str = "a panic while holding a store lock is a bug";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReaderQuery {
    reader: ReaderId,
}

/// Runs `handle` for the post in a request path, or refuses a malformed one.
fn for_post(topic: u64, post: u64, handle: impl FnOnce(PostKey) -> Response) -> Response {
    match PostKey::from_parts(topic, post) {
        Ok(key) => handle(key),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

fn set_error_response(error: SetError, refusal: &str) -> Response {
    match error {
        SetError::UnknownPost(key) => (StatusCode::NOT_FOUND, format!("{key:?} {refusal}")).into_response(),
        SetError::Save(message) => {
            eprintln!("{message}");
            (StatusCode::INTERNAL_SERVER_ERROR, message).into_response()
        }
    }
}

#[derive(Serialize)]
struct AllRatings {
    posts: BTreeMap<PostKey, Counts>,
    mine: BTreeMap<PostKey, Level>,
}

async fn list_ratings(State(stores): State<Shared>, Query(query): Query<ReaderQuery>) -> Json<AllRatings> {
    let store = stores.ratings.lock().expect(LOCK_POISONED);
    Json(AllRatings { posts: ratings::all_counts(&store), mine: store.mine(&query.reader) })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RatingRequest {
    reader: ReaderId,
    rating: Option<Level>,
}

#[derive(Serialize)]
struct PostRatings {
    counts: Counts,
    mine: Option<Level>,
}

async fn set_rating(State(stores): State<Shared>, Path((topic, post)): Path<(u64, u64)>, Json(request): Json<RatingRequest>) -> Response {
    for_post(topic, post, |key| {
        let mut store = stores.ratings.lock().expect(LOCK_POISONED);
        match store.set(&key, request.reader.clone(), request.rating) {
            Ok(()) => Json(PostRatings { counts: ratings::counts(&store, &key), mine: store.get(&key, &request.reader) }).into_response(),
            Err(error) => set_error_response(error, "is not a visible post"),
        }
    })
}

/// A reader's own feedback only: nobody else's answers ever leave the server (`D-50`).
#[derive(Serialize)]
struct MyFeedback {
    mine: BTreeMap<PostKey, Answers>,
}

async fn list_feedback(State(stores): State<Shared>, Query(query): Query<ReaderQuery>) -> Json<MyFeedback> {
    let store = stores.feedback.lock().expect(LOCK_POISONED);
    Json(MyFeedback { mine: store.mine(&query.reader) })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FeedbackRequest {
    reader: ReaderId,
    emotions: Option<Score>,
    head: Option<Score>,
}

#[derive(Serialize)]
struct PostFeedback {
    mine: Option<Answers>,
}

async fn set_feedback(State(stores): State<Shared>, Path((topic, post)): Path<(u64, u64)>, Json(request): Json<FeedbackRequest>) -> Response {
    let answers = Answers { emotions: request.emotions, head: request.head };
    for_post(topic, post, |key| {
        let mut store = stores.feedback.lock().expect(LOCK_POISONED);
        match store.set(&key, request.reader.clone(), if answers.is_empty() { None } else { Some(answers) }) {
            Ok(()) => Json(PostFeedback { mine: store.get(&key, &request.reader) }).into_response(),
            Err(error) => set_error_response(error, "has no restatement to give feedback on"),
        }
    })
}

fn open_stores(config: &Config) -> Result<Stores, String> {
    let accepted = read_accepted_posts(&config.site)?;
    Ok(Stores {
        ratings: Mutex::new(Store::open(&config.ratings, ratings::FORMAT, accepted.visible)?),
        feedback: Mutex::new(Store::open(&config.feedback, feedback::FORMAT, accepted.restated)?),
    })
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let config = parse_args(&args).unwrap_or_else(|message| {
        eprintln!("{message}\n{USAGE}");
        std::process::exit(2);
    });
    let stores = open_stores(&config).unwrap_or_else(|message| {
        eprintln!("{message}");
        std::process::exit(1);
    });
    let app = Router::new()
        .route("/api/ratings", get(list_ratings))
        .route("/api/ratings/{topic}/{post}", put(set_rating))
        .route("/api/feedback", get(list_feedback))
        .route("/api/feedback/{topic}/{post}", put(set_feedback))
        .layer(DefaultBodyLimit::max(1024))
        .with_state(Arc::new(stores))
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
    fn all_four_arguments_are_required() {
        let config = parse_args(&args(&["--site", "s", "--ratings", "r.json", "--feedback", "f.json", "--port", "8000"])).unwrap();
        assert_eq!(config, Config { site: PathBuf::from("s"), ratings: PathBuf::from("r.json"), feedback: PathBuf::from("f.json"), port: 8000 });
        assert_eq!(parse_args(&args(&["--site", "s", "--ratings", "r.json", "--feedback", "f.json"])).err(), Some("missing --port <n>".to_owned()));
        assert_eq!(parse_args(&args(&["--site", "s", "--ratings", "r.json", "--port", "8000"])).err(), Some("missing --feedback <file>".to_owned()));
        assert_eq!(parse_args(&args(&["--site", "s", "--feedback", "f.json", "--port", "8000"])).err(), Some("missing --ratings <file>".to_owned()));
        assert_eq!(parse_args(&args(&["--site"])).err(), Some("--site needs a value".to_owned()));
        assert_eq!(parse_args(&args(&["--bogus", "x"])).err(), Some("unknown argument \"--bogus\"".to_owned()));
        assert_eq!(parse_args(&args(&["--site", "s", "--port", "70000"])).err(), Some("--port \"70000\": number too large to fit in target type".to_owned()));
    }

    #[test]
    fn readers_rate_visible_posts_and_give_feedback_only_on_restated_ones() {
        let data = r#"{"format":"zforum-design-4","topic":{"threads":[
            {"posts":[{"key":"7/1","hidden":false,"analysis":{"neutral_rendition":null}},{"key":"7/2","hidden":false,"analysis":{"neutral_rendition":"calmer"}},{"key":"7/3","hidden":true,"analysis":null}]},
            {"posts":[{"key":"8/1","hidden":false,"analysis":{"neutral_rendition":"also calmer"}}]}]}}"#;
        let accepted = accepted_posts(data).unwrap();
        let keys = |set: &BTreeSet<PostKey>| set.iter().map(|key| serde_json::to_value(key).unwrap().as_str().unwrap().to_owned()).collect::<Vec<_>>();
        assert_eq!(keys(&accepted.visible), ["7/1", "7/2", "8/1"]);
        assert_eq!(keys(&accepted.restated), ["7/2", "8/1"]);
    }

    #[test]
    fn site_data_of_another_format_is_refused() {
        assert_eq!(accepted_posts(r#"{"format":"zforum-design-0","topic":{"threads":[]}}"#).err(), Some("format is \"zforum-design-0\", expected \"zforum-design-4\"".to_owned()));
        assert_eq!(accepted_posts(r#"{"format":"zforum-design-4","topic":{"threads":[{"posts":[{"key":"7/1","hidden":false,"analysis":null}]}]}}"#).err(), Some("visible post PostKey(\"7/1\") has no analysis".to_owned()));
    }

    #[test]
    fn feedback_requests_are_strict() {
        let parse = |text: &str| serde_json::from_str::<FeedbackRequest>(text).map(|request| (request.emotions, request.head)).map_err(|error| error.to_string());
        let reader = "0123456789abcdef0123456789abcdef";
        assert_eq!(parse(&format!(r#"{{"reader":"{reader}","emotions":7,"head":null}}"#)), Ok((Some(Score::new(7).unwrap()), None)));
        assert!(parse(&format!(r#"{{"reader":"{reader}","emotions":11,"head":null}}"#)).unwrap_err().contains("must be 0 to 10, got 11"));
        assert!(parse(&format!(r#"{{"reader":"{reader}","emotions":1,"head":2,"mood":3}}"#)).unwrap_err().contains("unknown field `mood`"));
        assert!(parse(r#"{"reader":"nope","emotions":1,"head":2}"#).unwrap_err().contains("reader id must be 32"));
    }
}
