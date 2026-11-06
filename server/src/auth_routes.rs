use super::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct StartAuth {
    mode: String,
    code: Option<String>,
}
pub(super) async fn start_auth(
    State(state): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<StartAuth>,
) -> ApiResult {
    let (id, recovery, session, operation, verifier) = {
        let app = locked(&state);
        if !app.auth.available() {
            return Err(ApiError(
                StatusCode::SERVICE_UNAVAILABLE,
                "Passkeys unavailable: build the maintained WebAuthn verifier.".into(),
            ));
        }
        let (id, recovery, session) = match body.mode.as_str() {
            "register" => (Some(uuid::Uuid::new_v4().to_string()), None, None),
            "login" => (None, None, None),
            "add" => {
                let id = account(&app.db, &headers, true, true)?;
                (
                    Some(id),
                    None,
                    cookie(&headers, "zforum_session").map(|s| hash(&s)),
                )
            }
            "recover" => {
                let code = body.code.ok_or("enter a recovery code")?;
                let id = app
                    .db
                    .recovery_account(&code)?
                    .ok_or("recovery code invalid or already used")?;
                (Some(id), Some(hash(&code)), None)
            }
            _ => return Err("unknown authentication operation".into()),
        };
        let operation = if let Some(ref account) = id {
            json!({"kind":"Register","account":account,"credentials":if body.mode=="add" { app.db.credentials(account)? } else {vec![]}})
        } else {
            json!({"kind":"Authenticate"})
        };
        (id, recovery, session, operation, app.auth.verifier.clone())
    };
    let verified = verifier
        .call(operation)
        .await
        .map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message))?;
    let public = verified
        .get("public")
        .ok_or("verifier returned no public challenge")?
        .clone();
    let private = verified
        .get("state")
        .ok_or("verifier returned no state")?
        .clone();
    let mut app = locked(&state);
    if body.mode == "add" && Some(account(&app.db, &headers, true, true)?) != id {
        return Err("credential change session no longer matches".into());
    }
    let token = app.auth.challenge(Challenge {
        expires: now() + 300,
        account: id,
        operation: body.mode,
        state: private,
        recovery,
        session,
    });
    let mut reply = Json(public).into_response();
    reply.headers_mut().append(
        header::SET_COOKIE,
        app.auth.cookie("zforum_challenge", &token, 300),
    );
    Ok(reply)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct FinishAuth {
    credential: Value,
}
pub(super) async fn finish_auth(
    State(state): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<FinishAuth>,
) -> ApiResult {
    let (challenge, id, credential_before, operation, verifier) = {
        let mut app = locked(&state);
        let challenge = app.auth.take_challenge(&headers)?;
        if challenge.operation == "add" {
            let id = account(&app.db, &headers, true, true)?;
            if Some(id) != challenge.account
                || cookie(&headers, "zforum_session").map(|s| hash(&s)) != challenge.session
            {
                return Err("credential change session no longer matches".into());
            }
        }
        let (id, credential_before, operation) = if challenge.operation == "login" {
            let credential_id = body.credential["id"]
                .as_str()
                .ok_or("credential id missing")?;
            let (id, key) = app
                .db
                .credential(credential_id)?
                .ok_or("credential is not registered")?;
            let operation = json!({"kind":"FinishAuthenticate","state":challenge.state,"credential":body.credential,"passkey":key,"account":id});
            (id, Some((credential_id.to_owned(), key)), operation)
        } else {
            let operation = json!({"kind":"FinishRegister","state":challenge.state,"credential":body.credential});
            (
                challenge
                    .account
                    .clone()
                    .ok_or("registration account missing")?,
                None,
                operation,
            )
        };
        (
            challenge,
            id,
            credential_before,
            operation,
            app.auth.verifier.clone(),
        )
    };
    let result = verifier
        .call(operation)
        .await
        .map_err(|message| ApiError(StatusCode::SERVICE_UNAVAILABLE, message))?;
    let mut app = locked(&state);
    if challenge.expires <= now() {
        return Err("authentication challenge expired".into());
    }
    if challenge.operation == "add"
        && (account(&app.db, &headers, true, true)? != id
            || cookie(&headers, "zforum_session").map(|s| hash(&s)) != challenge.session)
    {
        return Err("credential change session no longer matches".into());
    }
    if let Some((credential_id, key)) = credential_before {
        if app.db.credential(&credential_id)? != Some((id.clone(), key)) {
            return Err("credential changed during verification; sign in again".into());
        }
        if result["account"] != id || result["id"] != credential_id {
            return Err("verified account or credential mismatch".into());
        }
    }
    let key_id = result["id"]
        .as_str()
        .ok_or("verifier credential id missing")?;
    let key = result
        .get("credential")
        .ok_or("verifier credential missing")?;
    let mut codes = Value::Null;
    if let Some(code) = challenge.recovery {
        app.db.complete_recovery(&code, &id, key_id, key)?;
    } else {
        if challenge.operation == "register" {
            app.db.create_account(&id)?;
        }
        if let Some((owner, _)) = app.db.credential(key_id)?
            && owner != id
        {
            return Err("credential already belongs to another account".into());
        }
        app.db.save_credential(key_id, &id, key)?;
        if challenge.operation == "register" {
            codes = json!(app.db.replace_codes(&id)?);
        }
    }
    // Rotate the initiating session after re-verification; other sessions remain until revoked.
    if let Some(token) = cookie(&headers, "zforum_session") {
        app.db
            .connection
            .execute("DELETE FROM sessions WHERE hash=?1", [hash(&token)])
            .map_err(sql)?;
    }
    let (token, csrf) = app.db.new_session(&id, now())?;
    Ok((
        app.auth.session_headers(&token),
        Json(json!({"csrf":csrf,"recovery_codes":codes})),
    )
        .into_response())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Control {
    action: String,
}
pub(super) async fn control(
    State(state): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<Control>,
) -> ApiResult {
    let mut app = locked(&state);
    let id = account(&app.db, &headers, true, body.action != "logout")?;
    let token = cookie(&headers, "zforum_session").ok_or("session missing")?;
    let mut response = json!({"ok":true});
    match body.action.as_str() {
        "logout" => {
            app.db
                .connection
                .execute("DELETE FROM sessions WHERE hash=?1", [hash(&token)])
                .map_err(sql)?;
        }
        "revoke-others" => {
            app.db
                .connection
                .execute(
                    "DELETE FROM sessions WHERE account=?1 AND hash<>?2",
                    params![id, hash(&token)],
                )
                .map_err(sql)?;
        }
        "replace-codes" => {
            response = json!({"recovery_codes":app.db.replace_codes(&id)?});
        }
        "delete" => {
            app.db
                .connection
                .execute("DELETE FROM accounts WHERE id=?1", [id])
                .map_err(sql)?;
        }
        _ => return Err("unknown account control".into()),
    }
    let mut reply = Json(response).into_response();
    if body.action == "logout" || body.action == "delete" {
        reply
            .headers_mut()
            .append(header::SET_COOKIE, app.auth.cookie("zforum_session", "", 0));
    }
    Ok(reply)
}
