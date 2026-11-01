//! Mind-change ratings (SPEC §6): each reader gives each visible post at most one of four
//! ratings. Everyone sees the counts.

use crate::store::{PostKey, Store};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const FORMAT: &str = "zforum-ratings-2";

/// The four ratings. `site/js/vocab.js` (`RATINGS`) lists the same ids in the same order:
/// `LEVEL_IDS` in the tests below pins the serde names, and `tests/logic.test.mjs` checks
/// that list against vocab.js.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Level {
    #[serde(rename = "dug-in")]
    DugIn,
    #[serde(rename = "no-change")]
    NoChange,
    #[serde(rename = "new-light")]
    NewLight,
    #[serde(rename = "changed-mind")]
    ChangedMind,
}

impl Level {
    pub const ALL: [Level; 4] = [Level::DugIn, Level::NoChange, Level::NewLight, Level::ChangedMind];
}

/// How many readers gave each rating. Every level is present, zeros included.
pub type Counts = BTreeMap<Level, u64>;

pub fn counts(store: &Store<Level>, post: &PostKey) -> Counts {
    let mut counts: Counts = Level::ALL.iter().map(|level| (*level, 0)).collect();
    for level in store.values(post) {
        *counts.get_mut(level).expect("every level is initialised above") += 1;
    }
    counts
}

pub fn all_counts(store: &Store<Level>) -> BTreeMap<PostKey, Counts> {
    store.posts().map(|post| (post.clone(), counts(store, post))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::tests::{key, reader, temp_dir};

    const LEVEL_IDS: [&str; 4] = ["dug-in", "no-change", "new-light", "changed-mind"];

    fn levels(values: [u64; 4]) -> Counts {
        Level::ALL.iter().copied().zip(values).collect()
    }

    #[test]
    fn level_ids_match_their_serde_names() {
        let names: Vec<String> = Level::ALL.iter().map(|level| serde_json::to_value(level).unwrap().as_str().unwrap().to_owned()).collect();
        assert_eq!(names, LEVEL_IDS);
    }

    #[test]
    fn counts_cover_every_level_and_follow_changes() {
        let accepted = [key("58515/1"), key("58515/2")].into_iter().collect();
        let mut store = Store::open(&temp_dir("ratings").join("ratings.json"), FORMAT, accepted).unwrap();
        let post = key("58515/1");
        assert_eq!(counts(&store, &post), levels([0, 0, 0, 0]));
        store.set(&post, reader(1), Some(Level::NewLight)).unwrap();
        store.set(&post, reader(2), Some(Level::NewLight)).unwrap();
        store.set(&post, reader(3), Some(Level::DugIn)).unwrap();
        assert_eq!(counts(&store, &post), levels([1, 0, 2, 0]));
        store.set(&post, reader(1), Some(Level::ChangedMind)).unwrap();
        store.set(&post, reader(3), None).unwrap();
        assert_eq!(all_counts(&store), [(post.clone(), levels([0, 0, 1, 1]))].into_iter().collect());
    }

    #[test]
    fn unknown_rating_names_are_rejected() {
        assert!(serde_json::from_str::<Level>("\"loved-it\"").unwrap_err().to_string().contains("unknown variant `loved-it`"));
    }
}
