use super::*;
#[path = "auth_routes.rs"]
mod auth_routes;
use auth_routes::{start_auth, finish_auth, control};

async fn health(State(state): State<Shared>) -> ApiResult {
    let app = locked(&state);
    app.db.connection.query_row("SELECT count(*) FROM published", [], |row| row.get::<_, i64>(0))
        .map_err(|e| { eprintln!("health database check: {e}"); ApiError(StatusCode::SERVICE_UNAVAILABLE, "Database unavailable".into()) })?;
    if !app.auth.available() {
        return Err(ApiError(StatusCode::SERVICE_UNAVAILABLE, "Passkey verifier unavailable".into()));
    }
    Ok(Json(json!({"status":"ok"})).into_response())
}

async fn protect(State(shared): State<Shared>, request: Request, next: Next) -> Response {
    let mutation = !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD
    );
    if mutation {
        let mut app = locked(&shared);
        if let Err(error) = app.auth.verify_origin(request.headers()) {
            return ApiError(StatusCode::FORBIDDEN, error).into_response();
        }
        let peer = match app.proxy.client(request.headers(), request.extensions().get::<ConnectInfo<SocketAddr>>().map(|p| p.0)) {
            Ok(peer) => peer,
            Err(message) => return ApiError(StatusCode::BAD_REQUEST, message).into_response(),
        };
        let bucket = if request.uri().path().starts_with("/api/auth") {
            "auth"
        } else {
            "write"
        };
        if let Err(error) = app.auth.rate_limit(
            &format!("{bucket}:{peer}"),
            if bucket == "auth" { 30 } else { 120 },
            now(),
        ) {
            return ApiError(StatusCode::TOO_MANY_REQUESTS, error).into_response();
        }
    }
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        "no-store".parse().expect("static header"),
    );
    response.headers_mut().insert(
        "x-content-type-options",
        "nosniff".parse().expect("static header"),
    );
    response
}
async fn data(State(state): State<Shared>, Path(file): Path<String>) -> ApiResult {
    if file == "topics.json" {
        return locked(&state).db.catalog().map(|data| Json(data).into_response()).map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message));
    }
    let topic = file.strip_suffix(".json").ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "unknown content path".into()))?;
    if !locked(&state).db.has_release(topic)? {
        return Err(ApiError(StatusCode::NOT_FOUND, format!("unknown topic {topic}")));
    }
    locked(&state)
        .db
        .published(topic)
        .map(|data| Json(data).into_response())
        .map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message))
}
async fn me(State(state): State<Shared>, headers: HeaderMap) -> ApiResult {
    let mut app = locked(&state);
    let session = cookie(&headers, "zforum_session")
        .map(|token| app.db.session(&token, now()))
        .transpose()?
        .flatten();
    let mut result = json!({"authenticated":false,"auth_available":app.auth.available(),"auth_problem":if app.auth.available() {Value::Null} else {json!("Passkeys are not enabled: the server's WebAuthn verifier must be built.")}});
    result["auth_origin"] = json!(app.auth.origin);
    if let Some((id, _, csrf)) = session {
        app.auth.rate_limit(&format!("account-read:{id}"), 120, now())
            .map_err(|message| ApiError(StatusCode::TOO_MANY_REQUESTS, message))?;
        result["authenticated"] = json!(true);
        result["csrf"] = json!(csrf);
        result["personal"] = app.db.personal(&id)?;
    }
    drop(app);
    Ok(Json(result).into_response())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Visit {
    device: String,
}
async fn visit(
    State(state): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<Visit>,
) -> ApiResult {
    let mut app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    if body.device.len() != 32
        || !body
            .device
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err("device identifier must be 32 lowercase hex characters".into());
    }
    let cutoff = app.db.visit(&id, &body.device, now())?.map(|value| {
        chrono::DateTime::from_timestamp(value, 0)
            .expect("stored timestamp valid")
            .to_rfc3339()
    });
    Ok(Json(json!({"cutoff":cutoff})).into_response())
}
async fn reading(
    State(state): State<Shared>,
    headers: HeaderMap,
    Path((thread, post)): Path<(u64, u64)>,
    Json(body): Json<account_types::Reading>,
) -> ApiResult {
    let app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    let key = format!("{thread}/{post}");
    account_types::post_key(&key)?;
    if !app.db.visible(&key)? && (body.bookmarked == Some(true) || body.read.is_some()) {
        return Err("post is unavailable".into());
    }
    app.db.set_reading(&id, &key, body.bookmarked, body.read)?;
    Ok(Json(app.db.personal(&id)?).into_response())
}
async fn preferences(
    State(state): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> ApiResult {
    let app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    account_types::Preferences::validate(&body, &app.contract)?;
    app.db
        .connection
        .execute(
            "UPDATE accounts SET preferences=?1 WHERE id=?2",
            params![body.to_string(), id],
        )
        .map_err(sql)?;
    Ok(Json(json!({"ok":true})).into_response())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Appearance {
    appearance: String,
}
async fn appearance(
    State(state): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<Appearance>,
) -> ApiResult {
    let app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    if !database::PETS.contains(&body.appearance.as_str()) {
        return Err("unknown companion appearance".into());
    }
    app.db
        .connection
        .execute(
            "UPDATE accounts SET appearance=?1 WHERE id=?2",
            params![body.appearance, id],
        )
        .map_err(sql)?;
    Ok(Json(app.db.personal(&id)?).into_response())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Mood { score: Option<account_types::Reaction> }
async fn mood_set(State(state): State<Shared>, headers: HeaderMap, Path((thread,post)): Path<(u64,u64)>, Json(body): Json<Mood>) -> ApiResult {
    let mut app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    app.db.set_mood(&id, &format!("{thread}/{post}"), body.score.map(|value| value.0))?;
    Ok(Json(app.db.personal(&id)?).into_response())
}
async fn feedback_list(State(state): State<Shared>, headers: HeaderMap) -> ApiResult {
    let app = locked(&state);
    let id = account(&app.db, &headers, false, false)?;
    Ok(Json(json!({"mine":app.db.feedback(&id)?})).into_response())
}
async fn feedback_set(
    State(state): State<Shared>,
    headers: HeaderMap,
    Path((thread, post)): Path<(u64, u64)>,
    Json(body): Json<account_types::Feedback>,
) -> ApiResult {
    let mut app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    let key = format!("{thread}/{post}");
    if !app.db.visible(&key)? {
        return Err("post is unavailable".into());
    }
    app.db.set_feedback(
        &id,
        &key,
        &body.rendition,
        body.emotions.map(|v| v.0),
        body.head.map(|v| v.0),
    )?;
    Ok(
        Json(json!({"mine":app.db.feedback(&id)?.get(&key),"progress":app.db.progress(&id)?}))
            .into_response(),
    )
}
fn ratings_value(db: &Database, id: Option<&str>) -> Result<Value, String> {
    let mut posts = serde_json::Map::new();
    let mut mine = serde_json::Map::new();
    let mut query=db.connection.prepare("SELECT r.post,r.level,r.account FROM ratings r JOIN available_posts p ON p.post=r.post").map_err(|e|e.to_string())?;
    for row in query
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
    {
        let (post, level, owner) = row.map_err(|e| e.to_string())?;
        let entry = posts
            .entry(post.clone())
            .or_insert_with(|| json!({"dug-in":0,"no-change":0,"new-light":0,"changed-mind":0}));
        entry[&level] = json!(entry[&level].as_u64().expect("initialized count") + 1);
        if id == Some(&owner) {
            mine.insert(post, json!(level));
        }
    }
    Ok(json!({"posts":posts,"mine":mine}))
}
async fn ratings_list(State(state): State<Shared>, headers: HeaderMap) -> ApiResult {
    let app = locked(&state);
    let id = cookie(&headers, "zforum_session")
        .map(|token| app.db.session(&token, now()))
        .transpose()?
        .flatten()
        .map(|(id, _, _)| id);
    Ok(Json(ratings_value(&app.db, id.as_deref())?).into_response())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Rating {
    rating: Option<String>,
}
async fn ratings_set(
    State(state): State<Shared>,
    headers: HeaderMap,
    Path((thread, post)): Path<(u64, u64)>,
    Json(body): Json<Rating>,
) -> ApiResult {
    let app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    let key = format!("{thread}/{post}");
    if !app.db.visible(&key)? {
        return Err("post unavailable".into());
    }
    if let Some(level) = body.rating {
        if !["dug-in", "no-change", "new-light", "changed-mind"].contains(&level.as_str()) {
            return Err("unknown mind-change rating".into());
        }
        app.db.connection.execute("INSERT INTO ratings(account,post,level) VALUES(?1,?2,?3) ON CONFLICT(account,post) DO UPDATE SET level=excluded.level",params![id,key,level]).map_err(sql)?;
    } else {
        app.db
            .connection
            .execute(
                "DELETE FROM ratings WHERE account=?1 AND post=?2",
                params![id, key],
            )
            .map_err(sql)?;
    }
    let result = ratings_value(&app.db, Some(&id))?;
    Ok(Json(json!({"counts":result["posts"].get(&key).cloned().unwrap_or_else(||json!({"dug-in":0,"no-change":0,"new-light":0,"changed-mind":0})),"mine":result["mine"].get(&key)})).into_response())
}
pub(super) fn router(state: Shared, site: &FsPath) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/data/{file}", get(data))
        .route("/api/me", get(me))
        .route("/api/auth/start", post(start_auth))
        .route("/api/auth/finish", post(finish_auth))
        .route("/api/account/control", post(control))
        .route("/api/account/visit", post(visit))
        .route("/api/account/reading/{thread}/{post}", put(reading))
        .route("/api/account/preferences", put(preferences))
        .route("/api/account/appearance", put(appearance))
        .route("/api/account/mood/{thread}/{post}", put(mood_set))
        .route("/api/feedback", get(feedback_list))
        .route("/api/feedback/{thread}/{post}", put(feedback_set))
        .route("/api/ratings", get(ratings_list))
        .route("/api/ratings/{thread}/{post}", put(ratings_set))
        .layer(DefaultBodyLimit::max(65536))
        .layer(middleware::from_fn_with_state(state.clone(), protect))
        .with_state(state)
        .nest_service("/js", tower_http::services::ServeDir::new(site.join("js")))
        .route_service("/", tower_http::services::ServeFile::new(site.join("index.html")))
        .route_service("/index.html", tower_http::services::ServeFile::new(site.join("index.html")))
        .route_service("/style.css", tower_http::services::ServeFile::new(site.join("style.css")))
        .route_service("/prompt.md", tower_http::services::ServeFile::new(site.join("prompt.md")))
        .route_service("/topic-curation.json", tower_http::services::ServeFile::new(site.join("topic-curation.json")))
}
