//! Restatement feedback (SPEC §7, `D-50`): two 0–10 answers per reader per restated post.
//! It is feedback for the zforum team only: the API gives each reader back their own
//! answers and nothing else; the team reads the store with `tools/feedback-report.mjs`.

use serde::{Deserialize, Deserializer, Serialize, de};

pub const FORMAT: &str = "zforum-feedback-1";

/// The highest score. `site/js/vocab.js` (`FEEDBACK_MAX`) must agree; `tests/logic.test.mjs`
/// checks it, and the field names against `FEEDBACK_IDS` below.
pub const SCORE_MAX: u8 = 10;

/// A slider position, 0 to `SCORE_MAX`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct Score(u8);

impl Score {
    pub fn new(value: u8) -> Result<Self, String> {
        if value <= SCORE_MAX { Ok(Score(value)) } else { Err(format!("a feedback score must be 0 to {SCORE_MAX}, got {value}")) }
    }
}

impl<'de> Deserialize<'de> for Score {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Score::new(u8::deserialize(deserializer)?).map_err(de::Error::custom)
    }
}

/// One reader's answers about one restatement. Either may be unanswered.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Answers {
    /// "This restatement helped me avoid negative feelings."
    pub emotions: Option<Score>,
    /// "I got something out of this that I wouldn't have had if it wasn't restated."
    pub head: Option<Score>,
}

impl Answers {
    pub fn is_empty(&self) -> bool {
        self.emotions.is_none() && self.head.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FEEDBACK_IDS: [&str; 2] = ["emotions", "head"];

    #[test]
    fn answer_field_names_match_feedback_ids() {
        let value = serde_json::to_value(Answers { emotions: Some(Score(1)), head: None }).unwrap();
        let names: Vec<&str> = value.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(names, FEEDBACK_IDS);
        assert_eq!(value, serde_json::json!({"emotions": 1, "head": null}));
    }

    #[test]
    fn scores_run_from_0_to_10() {
        assert_eq!(serde_json::from_str::<Score>("0").unwrap(), Score(0));
        assert_eq!(serde_json::from_str::<Score>("10").unwrap(), Score(10));
        assert!(serde_json::from_str::<Score>("11").unwrap_err().to_string().contains("must be 0 to 10, got 11"));
        for bad in ["-1", "2.5", "256", "\"5\"", "null", "true"] {
            assert!(serde_json::from_str::<Score>(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn answers_reject_unknown_fields_and_treat_missing_as_unanswered() {
        assert!(serde_json::from_str::<Answers>(r#"{"emotions":3,"head":4,"mood":1}"#).unwrap_err().to_string().contains("unknown field `mood`"));
        let partial: Answers = serde_json::from_str(r#"{"head":4}"#).unwrap();
        assert_eq!(partial, Answers { emotions: None, head: Some(Score(4)) });
        assert!(serde_json::from_str::<Answers>(r#"{"emotions":null,"head":null}"#).unwrap().is_empty());
    }
}
