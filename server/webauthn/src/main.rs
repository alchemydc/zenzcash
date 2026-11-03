//! Private, one-request verifier. State is returned only to the parent server, never a client.
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{Read, Write};
use webauthn_rs::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    rp_id: String,
    origin: String,
    operation: Operation,
}
#[derive(Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
enum Operation {
    Register {
        account: String,
        credentials: Vec<Passkey>,
    },
    FinishRegister {
        state: PasskeyRegistration,
        credential: RegisterPublicKeyCredential,
    },
    Authenticate,
    FinishAuthenticate {
        state: DiscoverableAuthentication,
        credential: PublicKeyCredential,
        passkey: Box<Passkey>,
        account: String,
    },
}
fn run(request: Request) -> Result<Value, Box<dyn std::error::Error>> {
    let origin = Url::parse(&request.origin)?;
    let webauthn = WebauthnBuilder::new(&request.rp_id, &origin)?
        .rp_name("Zenzcash")
        .build()?;
    match request.operation {
        Operation::Register {
            account,
            credentials,
        } => {
            let uid = Uuid::parse_str(&account)?;
            let name = format!("Reader {}", &account[..8]);
            let (options, state) = webauthn.start_passkey_registration(
                uid,
                &name,
                &name,
                Some(credentials.iter().map(|p| p.cred_id().clone()).collect()),
            )?;
            let mut public = serde_json::to_value(options)?;
            public["publicKey"]["authenticatorSelection"]["residentKey"] = json!("required");
            public["publicKey"]["authenticatorSelection"]["requireResidentKey"] = json!(true);
            Ok(json!({"public":public,"state":state}))
        }
        Operation::FinishRegister { state, credential } => {
            let passkey = webauthn.finish_passkey_registration(&credential, &state)?;
            Ok(json!({"credential":passkey,"id":passkey.cred_id()}))
        }
        Operation::Authenticate => {
            let (public, state) = webauthn.start_discoverable_authentication()?;
            Ok(json!({"public":public,"state":state}))
        }
        Operation::FinishAuthenticate {
            state,
            credential,
            mut passkey,
            account,
        } => {
            let (uid, _) = webauthn.identify_discoverable_authentication(&credential)?;
            if uid != Uuid::parse_str(&account)? {
                return Err("credential account does not match user handle".into());
            }
            let result = webauthn.finish_discoverable_authentication(
                &credential,
                state,
                &[DiscoverableKey::from((*passkey).clone())],
            )?;
            if passkey.update_credential(&result).is_none() {
                return Err("credential update mismatch".into());
            }
            Ok(json!({"credential":passkey,"id":passkey.cred_id(),"account":account}))
        }
    }
}
fn main() {
    let result = (|| -> Result<Value, Box<dyn std::error::Error>> {
        let mut text = String::new();
        std::io::stdin().take(131073).read_to_string(&mut text)?;
        if text.len() > 131072 {
            return Err("verifier request exceeds limit".into());
        }
        run(serde_json::from_str(&text)?)
    })();
    match result {
        Ok(value) => {
            std::io::stdout()
                .write_all(value.to_string().as_bytes())
                .expect("write verifier result");
        }
        Err(_) => {
            eprintln!("WebAuthn verification failed");
            std::process::exit(1);
        }
    }
}
