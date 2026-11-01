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
    pub emotions: Option<SignedScore>,
    pub head: Option<SignedScore>,
}
#[derive(Clone, Copy)]
pub struct SignedScore(pub i64);
impl<'de> Deserialize<'de> for SignedScore {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = i64::deserialize(deserializer)?;
        if (-10..=10).contains(&value) {
            Ok(Self(value))
        } else {
            Err(de::Error::custom(
                "feedback must be an integer from -10 to 10",
            ))
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    pub anonymous: bool,
    #[serde(rename = "tonePreset")]
    pub tone_preset: String,
    #[serde(rename = "supportPreset")]
    pub support_preset: String,
    pub unassessed: String,
    #[serde(rename = "includedFunctions")]
    pub included_functions: Vec<String>,
    #[serde(rename = "minAccountMonths")]
    pub min_account_months: u16,
    #[serde(rename = "filteredFlags")]
    pub filtered_flags: Vec<String>,
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
    #[serde(rename = "none")]
    None,
    #[serde(rename = "last-visit")]
    Visit,
    #[serde(rename = "hours")]
    Hours { hours: u16 },
}
impl Preferences {
    pub fn validate(value: &Value, contract: &Value) -> Result<(), String> {
        let prefs: Self = serde_json::from_value(value.clone())
            .map_err(|e| format!("invalid preferences: {e}"))?;
        for (name, selected) in [
            ("tonePreset", &prefs.tone_preset),
            ("supportPreset", &prefs.support_preset),
            ("unassessed", &prefs.unassessed),
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
            ("includedFunctions", &prefs.included_functions),
            ("filteredFlags", &prefs.filtered_flags),
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
        if prefs.min_account_months > 1200 {
            return Err("minimum account age exceeds 100 years".into());
        }
        if let Since::Hours { hours } = prefs.since
            && !(1..=720).contains(&hours)
        {
            return Err("since hours must be 1 to 720".into());
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
