use serde::{Deserialize, Deserializer, de};
use serde_json::Value;

pub fn post_key(value: &str) -> Result<(), String> {
    let parts: Vec<_> = value.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|p| {
            p.is_empty()
                || p.len() > 15
                || p.starts_with('0')
                || !p.bytes().all(|b| b.is_ascii_digit())
        })
    {
        return Err(format!("invalid post key {value:?}"));
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reading {
    pub bookmarked: Option<bool>,
    pub read: Option<bool>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Feedback {
    pub rendition: String,
    pub emotions: Option<Reaction>,
    pub head: Option<Reaction>,
}
#[derive(Clone, Copy)]
pub struct Reaction(pub i64);
impl<'de> Deserialize<'de> for Reaction {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = i64::deserialize(deserializer)?;
        if (-1..=1).contains(&value) {
            Ok(Self(value))
        } else {
            Err(de::Error::custom(
                "reaction must be -1, 0 or 1",
            ))
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    pub version: u8,
    pub anonymous: bool,
    #[serde(rename = "toneBands")]
    pub tone_bands: Vec<String>,
    #[serde(rename = "supportBands")]
    pub support_bands: Vec<String>,
    #[serde(rename = "minAccountMonths")]
    pub min_account_months: u16,
    #[serde(rename = "postVersions")]
    pub post_versions: Vec<String>,
    #[serde(rename = "threadView")]
    pub thread_view: String,
    #[serde(rename = "postOrder")]
    pub post_order: String,
    #[serde(rename = "preferredVersion")]
    pub preferred_version: String,
    #[serde(rename = "flagAssumptions")]
    pub flag_assumptions: bool,
    #[serde(rename = "showReframing")]
    pub show_reframing: bool,
    #[serde(rename = "highlightNew")]
    pub highlight_new: bool,
    #[serde(rename = "showRatings")]
    pub show_ratings: bool,
    pub since: Since,
    pub interests: Vec<String>,
}
#[derive(Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Since {
    #[serde(rename = "pull-days")]
    PullDays { days: u8 },
}
impl Preferences {
    pub fn validate(value: &Value, contract: &Value) -> Result<(), String> {
        let prefs: Self = serde_json::from_value(value.clone())
            .map_err(|e| format!("invalid preferences: {e}"))?;
        for (name, selected) in [
            ("threadView", &prefs.thread_view),
            ("postOrder", &prefs.post_order),
            ("preferredVersion", &prefs.preferred_version),
        ] {
            if !contract[name]
                .as_array()
                .ok_or("preference contract missing choices")?
                .contains(&Value::String(selected.clone()))
            {
                return Err(format!("invalid {name}: {selected}"));
            }
        }
        for (name, selected) in [
            ("toneBands", &prefs.tone_bands),
            ("supportBands", &prefs.support_bands),
            ("postVersions", &prefs.post_versions),
            ("interests", &prefs.interests),
        ] {
            let allowed = contract[name]
                .as_array()
                .ok_or("preference contract missing list")?;
            let unique: std::collections::BTreeSet<_> = selected.iter().collect();
            if unique.len() != selected.len()
                || selected
                    .iter()
                    .any(|item| !allowed.contains(&Value::String(item.clone())))
            {
                return Err(format!("invalid {name} list"));
            }
        }
        if prefs.version != 6 || prefs.min_account_months > 1200 {
            return Err("preferences require version 6 and minimum account age 0 to 1200 months".into());
        }
        let Since::PullDays { days } = prefs.since;
        if ![1, 3, 7].contains(&days) {
            return Err("pull window must be 1, 3 or 7 days".into());
        }
        let _ = (
            prefs.anonymous,
            prefs.flag_assumptions,
            prefs.show_reframing,
            prefs.highlight_new,
            prefs.show_ratings,
        );
        Ok(())
    }
}
