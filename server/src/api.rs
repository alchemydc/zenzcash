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
    let reader = { locked(&state).db.reader() };
    if file == "topics.json" {
        return reader.run(|db| db.topic_list().map(|data| Json(data).into_response())).await.map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message));
    }
    let topic = file.strip_suffix(".json").ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "unknown content path".into()))?;
    let topic = topic.to_owned();
    reader.run(move |db| {
        if !db.has_release(&topic)? { return Ok(ApiError(StatusCode::NOT_FOUND, format!("unknown topic {topic}")).into_response()); }
        db.published(&topic).map(|data| Json(data).into_response())
    }).await.map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message))
}
async fn me(State(state): State<Shared>, headers: HeaderMap) -> ApiResult {
    let (mut result, reader, authenticated) = {
    let mut app = locked(&state);
    let session = cookie(&headers, "zforum_session")
        .map(|token| app.db.session(&token, now()))
        .transpose()?
        .flatten();
    let mut result = json!({"authenticated":false,"auth_available":app.auth.available(),"auth_problem":if app.auth.available() {Value::Null} else {json!("Passkeys are not enabled: the server's WebAuthn verifier must be built.")}});
    result["auth_origin"] = json!(app.auth.origin);
    let authenticated = if let Some((id, _, csrf)) = session {
        app.auth.rate_limit(&format!("account-read:{id}"), auth::ACCOUNT_READS_PER_MINUTE, now())
            .map_err(|message| ApiError(StatusCode::TOO_MANY_REQUESTS, message))?;
        result["authenticated"] = json!(true);
        result["csrf"] = json!(csrf);
        Some(id)
    } else { None };
    (result, app.db.reader(), authenticated)
    };
    if let Some(id) = authenticated {
        return reader.run(move |db| {
            if account(db, &headers, false, false)? != id { return Err("account session changed".into()); }
            result["personal"] = db.personal(&id)?;
            Ok(Json(result).into_response())
        }).await.map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message));
    }
    Ok(Json(result).into_response())
}
async fn account_read(reader: database::ReadDatabase, headers: HeaderMap, id: String,
    read: impl FnOnce(&Database, &str) -> Result<Value, String> + Send + 'static) -> ApiResult {
    reader.run(move |db| {
        if account(db, &headers, false, false)? != id { return Err("account session changed".into()); }
        read(db, &id).map(|value|Json(value).into_response())
    }).await.map_err(|message|ApiError(StatusCode::SERVICE_UNAVAILABLE,message))
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
    let entry = app.db.set_reading(&id, &key, body.bookmarked, body.read)?;
    drop(app);
    Ok(Json(json!({"key":key,"entry":entry})).into_response())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReadingQuery {
    #[serde(default)]
    after: String,
    topic: Option<String>,
    #[serde(default)]
    bookmarks: bool,
}
async fn reading_list(State(state): State<Shared>, headers: HeaderMap, Query(query): Query<ReadingQuery>) -> ApiResult {
    let (reader, id) = {
    let mut app = locked(&state);
    let id = account(&app.db, &headers, false, false)?;
    app.auth.rate_limit(&format!("account-read:{id}"), auth::ACCOUNT_READS_PER_MINUTE, now())
        .map_err(|message| ApiError(StatusCode::TOO_MANY_REQUESTS, message))?;
    (app.db.reader(), id)
    };
    reader.run(move |db| {
        if account(db, &headers, false, false)? != id { return Err("account session changed".into()); }
        db.reading_page(&id, &query.after, query.topic.as_deref(), query.bookmarks).map(|result| Json(result).into_response())
    }).await.map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message))
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
    let (reader,id) = {
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
    (app.db.reader(),id)
    };
    account_read(reader,headers,id,|db,id|db.personal(id)).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Mood { score: Option<account_types::Reaction> }
async fn mood_set(State(state): State<Shared>, headers: HeaderMap, Path((thread,post)): Path<(u64,u64)>, Json(body): Json<Mood>) -> ApiResult {
    let (reader,id) = {
    let mut app = locked(&state);
    let id = account(&app.db, &headers, true, false)?;
    app.db.set_mood(&id, &format!("{thread}/{post}"), body.score.map(|value| value.0))?;
    (app.db.reader(),id)
    };
    account_read(reader,headers,id,|db,id|db.personal(id)).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ContentScope { topic: Option<String> }
async fn feedback_list(State(state): State<Shared>, headers: HeaderMap, Query(scope): Query<ContentScope>) -> ApiResult {
    let (reader,id) = {
    let mut app = locked(&state);
    let id = account(&app.db, &headers, false, false)?;
    app.auth.rate_limit(&format!("account-read:{id}"), auth::ACCOUNT_READS_PER_MINUTE, now()).map_err(|message|ApiError(StatusCode::TOO_MANY_REQUESTS,message))?;
    (app.db.reader(),id)
    };
    account_read(reader,headers,id,move |db,id|Ok(json!({"mine":db.feedback_for_topic(id,scope.topic.as_deref())?}))).await
}
async fn feedback_set(
    State(state): State<Shared>,
    headers: HeaderMap,
    Path((thread, post)): Path<(u64, u64)>,
    Json(body): Json<account_types::Feedback>,
) -> ApiResult {
    let (reader,id,key) = {
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
    (app.db.reader(),id,key)
    };
    account_read(reader,headers,id,move |db,id|Ok(json!({"mine":db.feedback(id)?.get(&key),"progress":db.progress(id)?}))).await
}
fn ratings_value(db: &Database, id: Option<&str>, topic: Option<&str>) -> Result<Value, String> {
    let mut posts = serde_json::Map::new();
    let mut mine = serde_json::Map::new();
    let mut query=db.connection.prepare("SELECT r.post,r.level,r.account FROM ratings r JOIN available_posts p ON p.post=r.post WHERE (?1 IS NULL OR p.topic=?1)").map_err(|e|e.to_string())?;
    for row in query
        .query_map([topic], |r| {
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
async fn ratings_list(State(state): State<Shared>, headers: HeaderMap, Query(scope): Query<ContentScope>) -> ApiResult {
    let reader = { locked(&state).db.reader() };
    reader.run(move |db| {
    let id = cookie(&headers, "zforum_session")
        .map(|token| db.session(&token, now()))
        .transpose()?
        .flatten()
        .map(|(id, _, _)| id);
    Ok(Json(ratings_value(db, id.as_deref(), scope.topic.as_deref())?).into_response())
    }).await.map_err(|message|ApiError(StatusCode::SERVICE_UNAVAILABLE,message))
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
    let result = ratings_value(&app.db, Some(&id), None)?;
    Ok(Json(json!({"counts":result["posts"].get(&key).cloned().unwrap_or_else(||json!({"dug-in":0,"no-change":0,"new-light":0,"changed-mind":0})),"mine":result["mine"].get(&key)})).into_response())
}
async fn static_cache(request: Request, next: Next) -> Response {
    let versioned = request.uri().path().starts_with("/assets/");
    let mut response = next.run(request).await;
    let policy = if versioned && response.status().is_success() {
        "public, max-age=31536000, immutable"
    } else {
        "no-store"
    };
    response.headers_mut().insert(header::CACHE_CONTROL, policy.parse().expect("static cache policy"));
    response.headers_mut().insert("x-content-type-options", "nosniff".parse().expect("static header"));
    response
}

pub(super) fn router(state: Shared, site: &FsPath) -> Router {
    let assets = Router::new()
        .nest_service("/assets", tower_http::services::ServeDir::new(site.join("runtime/assets")))
        .route_service("/", tower_http::services::ServeFile::new(site.join("runtime/index.html")))
        .route_service("/index.html", tower_http::services::ServeFile::new(site.join("runtime/index.html")))
        .route_service("/prompt.md", tower_http::services::ServeFile::new(site.join("prompt.md")))
        .route_service("/topic-curation.json", tower_http::services::ServeFile::new(site.join("topic-curation.json")))
        .layer(middleware::from_fn(static_cache));
    Router::new()
        .route("/healthz", get(health))
        .route("/data/{file}", get(data))
        .route("/api/me", get(me))
        .route("/api/auth/start", post(start_auth))
        .route("/api/auth/finish", post(finish_auth))
        .route("/api/account/control", post(control))
        .route("/api/account/visit", post(visit))
        .route("/api/account/reading", get(reading_list))
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
        .merge(assets)
}
