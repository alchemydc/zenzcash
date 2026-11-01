//! Mind-change ratings (SPEC §6): each reader gives each post at most one of four ratings.
//! The store is a JSON file rewritten atomically on every change.

use serde::{Deserialize, Deserializer, Serialize, de};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// The four ratings. `site/js/vocab.js` (`RATINGS`) lists the same ids in the same order:
/// `LEVEL_IDS` in the tests below pins the serde names, and `tests/vocab-sync.test.mjs`
/// checks that list against vocab.js.
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

/// An anonymous reader: 32 lowercase hex characters the browser generated at random.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct ReaderId(String);

impl ReaderId {
    pub fn parse(text: &str) -> Result<Self, String> {
        if text.len() == 32 && text.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) {
            Ok(ReaderId(text.to_owned()))
        } else {
            Err(format!("reader id must be 32 lowercase hex characters, got {text:?}"))
        }
    }
}

impl<'de> Deserialize<'de> for ReaderId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        ReaderId::parse(&String::deserialize(deserializer)?).map_err(de::Error::custom)
    }
}

/// A post as `"<topic id>/<post number>"`, both positive decimals without leading zeros.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct PostKey(String);

fn positive_decimal(text: &str) -> bool {
    !text.is_empty() && text.len() <= 15 && text.bytes().all(|byte| byte.is_ascii_digit()) && !text.starts_with('0')
}

impl PostKey {
    pub fn parse(text: &str) -> Result<Self, String> {
        match text.split_once('/') {
            Some((topic, post)) if positive_decimal(topic) && positive_decimal(post) => Ok(PostKey(text.to_owned())),
            _ => Err(format!("post key must look like \"58515/12\", got {text:?}")),
        }
    }

    pub fn from_parts(topic: u64, post: u64) -> Result<Self, String> {
        PostKey::parse(&format!("{topic}/{post}"))
    }
}

impl<'de> Deserialize<'de> for PostKey {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        PostKey::parse(&String::deserialize(deserializer)?).map_err(de::Error::custom)
    }
}

/// How many readers gave each rating. Every level is present, zeros included.
pub type Counts = BTreeMap<Level, u64>;

const STORE_FORMAT: &str = "zforum-ratings-1";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoreFile {
    format: String,
    ratings: BTreeMap<PostKey, BTreeMap<ReaderId, Level>>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SetError {
    UnknownPost(PostKey),
    Save(String),
}

pub struct Store {
    path: PathBuf,
    known_posts: BTreeSet<PostKey>,
    ratings: BTreeMap<PostKey, BTreeMap<ReaderId, Level>>,
}

impl Store {
    /// Opens the store at `path`, or starts an empty one if the file does not exist yet.
    /// Ratings for posts that are not in `known_posts` are an error: the site data changed
    /// under the store, and silently dropping or keeping them would both be wrong.
    pub fn open(path: &Path, known_posts: BTreeSet<PostKey>) -> Result<Store, String> {
        let ratings = match fs::read_to_string(path) {
            Ok(text) => {
                let file: StoreFile = serde_json::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))?;
                if file.format != STORE_FORMAT {
                    return Err(format!("{}: format is {:?}, expected {STORE_FORMAT:?}", path.display(), file.format));
                }
                if let Some(unknown) = file.ratings.keys().find(|key| !known_posts.contains(key)) {
                    return Err(format!("{}: has ratings for {unknown:?}, which is not a visible post in the site data", path.display()));
                }
                file.ratings
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(error) => return Err(format!("reading {}: {error}", path.display())),
        };
        Ok(Store { path: path.to_owned(), known_posts, ratings })
    }

    /// Sets (or with `None`, clears) one reader's rating of one post, and saves. If saving
    /// fails the change is undone, so memory and disk never disagree.
    pub fn set(&mut self, post: &PostKey, reader: ReaderId, level: Option<Level>) -> Result<(), SetError> {
        if !self.known_posts.contains(post) {
            return Err(SetError::UnknownPost(post.clone()));
        }
        let before = self.ratings.clone();
        let by_reader = self.ratings.entry(post.clone()).or_default();
        match level {
            Some(level) => {
                by_reader.insert(reader, level);
            }
            None => {
                by_reader.remove(&reader);
            }
        }
        if by_reader.is_empty() {
            self.ratings.remove(post);
        }
        if let Err(error) = self.save() {
            self.ratings = before;
            return Err(SetError::Save(error));
        }
        Ok(())
    }

    pub fn counts(&self, post: &PostKey) -> Counts {
        let mut counts: Counts = Level::ALL.iter().map(|level| (*level, 0)).collect();
        for level in self.ratings.get(post).into_iter().flat_map(|by_reader| by_reader.values()) {
            *counts.get_mut(level).expect("every level is initialised above") += 1;
        }
        counts
    }

    pub fn all_counts(&self) -> BTreeMap<PostKey, Counts> {
        self.ratings.keys().map(|post| (post.clone(), self.counts(post))).collect()
    }

    pub fn mine(&self, reader: &ReaderId) -> BTreeMap<PostKey, Level> {
        self.ratings
            .iter()
            .filter_map(|(post, by_reader)| by_reader.get(reader).map(|level| (post.clone(), *level)))
            .collect()
    }

    pub fn rating_of(&self, post: &PostKey, reader: &ReaderId) -> Option<Level> {
        self.ratings.get(post).and_then(|by_reader| by_reader.get(reader)).copied()
    }

    /// Writes a temporary file beside the store, fsyncs it, and renames it over the store.
    fn save(&self) -> Result<(), String> {
        let file = StoreFile { format: STORE_FORMAT.to_owned(), ratings: self.ratings.clone() };
        let text = serde_json::to_string_pretty(&file).map_err(|error| format!("encoding ratings: {error}"))?;
        let directory = self.path.parent().ok_or_else(|| format!("{} has no parent directory", self.path.display()))?;
        let temporary = directory.join(format!(".ratings.{}.tmp", std::process::id()));
        let write = || -> std::io::Result<()> {
            let mut handle = fs::File::create(&temporary)?;
            handle.write_all(text.as_bytes())?;
            handle.sync_all()?;
            fs::rename(&temporary, &self.path)
        };
        write().map_err(|error| format!("saving {}: {error}", self.path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEVEL_IDS: [&str; 4] = ["dug-in", "no-change", "new-light", "changed-mind"];

    fn reader(n: u8) -> ReaderId {
        ReaderId::parse(&format!("{:032x}", n)).unwrap()
    }

    fn key(text: &str) -> PostKey {
        PostKey::parse(text).unwrap()
    }

    fn temp_path(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!("zforum-ratings-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        directory.join("ratings.json")
    }

    fn store(name: &str) -> Store {
        Store::open(&temp_path(name), [key("58515/1"), key("58515/2")].into_iter().collect()).unwrap()
    }

    fn counts(values: [u64; 4]) -> Counts {
        Level::ALL.iter().copied().zip(values).collect()
    }

    #[test]
    fn level_ids_match_their_serde_names() {
        let names: Vec<String> = Level::ALL.iter().map(|level| serde_json::to_value(level).unwrap().as_str().unwrap().to_owned()).collect();
        assert_eq!(names, LEVEL_IDS);
    }

    #[test]
    fn reader_ids_must_be_32_lowercase_hex() {
        assert!(ReaderId::parse("0123456789abcdef0123456789abcdef").is_ok());
        assert_eq!(ReaderId::parse("0123456789ABCDEF0123456789abcdef"), Err("reader id must be 32 lowercase hex characters, got \"0123456789ABCDEF0123456789abcdef\"".to_owned()));
        assert!(ReaderId::parse("0123456789abcdef0123456789abcde").is_err());
        assert!(ReaderId::parse("0123456789abcdef0123456789abcdef0").is_err());
        assert!(ReaderId::parse("").is_err());
        assert!(ReaderId::parse("0123456789abcdef0123456789abcdeg").is_err());
    }

    #[test]
    fn post_keys_are_two_positive_decimals() {
        assert!(PostKey::parse("58515/12").is_ok());
        assert_eq!(PostKey::parse("58515/012"), Err("post key must look like \"58515/12\", got \"58515/012\"".to_owned()));
        for bad in ["58515", "58515/", "/12", "58515/0", "0/1", "58515/12/3", "58515/-1", "a/1", "58515/1x", "1234567890123456/1"] {
            assert!(PostKey::parse(bad).is_err(), "{bad} should be rejected");
        }
        assert_eq!(PostKey::from_parts(58515, 12), Ok(key("58515/12")));
        assert!(PostKey::from_parts(58515, 0).is_err());
    }

    #[test]
    fn a_new_store_has_zero_counts_for_every_level() {
        let store = store("empty");
        assert_eq!(store.counts(&key("58515/1")), counts([0, 0, 0, 0]));
        assert!(store.all_counts().is_empty());
        assert!(store.mine(&reader(1)).is_empty());
    }

    #[test]
    fn readers_set_replace_and_clear_their_own_rating() {
        let mut store = store("set");
        let post = key("58515/1");
        store.set(&post, reader(1), Some(Level::NewLight)).unwrap();
        store.set(&post, reader(2), Some(Level::NewLight)).unwrap();
        store.set(&post, reader(3), Some(Level::DugIn)).unwrap();
        assert_eq!(store.counts(&post), counts([1, 0, 2, 0]));
        store.set(&post, reader(1), Some(Level::ChangedMind)).unwrap();
        assert_eq!(store.counts(&post), counts([1, 0, 1, 1]));
        assert_eq!(store.rating_of(&post, &reader(1)), Some(Level::ChangedMind));
        store.set(&post, reader(3), None).unwrap();
        assert_eq!(store.counts(&post), counts([0, 0, 1, 1]));
        assert_eq!(store.rating_of(&post, &reader(3)), None);
        assert_eq!(store.mine(&reader(2)), [(post.clone(), Level::NewLight)].into_iter().collect());
    }

    #[test]
    fn clearing_the_last_rating_removes_the_post_from_all_counts() {
        let mut store = store("clear");
        let post = key("58515/2");
        store.set(&post, reader(1), Some(Level::NoChange)).unwrap();
        assert_eq!(store.all_counts(), [(post.clone(), counts([0, 1, 0, 0]))].into_iter().collect());
        store.set(&post, reader(1), None).unwrap();
        assert!(store.all_counts().is_empty());
    }

    #[test]
    fn unknown_posts_are_refused_and_change_nothing() {
        let mut store = store("unknown");
        assert_eq!(store.set(&key("58515/99"), reader(1), Some(Level::NewLight)), Err(SetError::UnknownPost(key("58515/99"))));
        assert!(store.all_counts().is_empty());
    }

    #[test]
    fn ratings_survive_reopening() {
        let path = temp_path("reopen");
        let known: BTreeSet<PostKey> = [key("58515/1"), key("58515/2")].into_iter().collect();
        let mut first = Store::open(&path, known.clone()).unwrap();
        first.set(&key("58515/1"), reader(1), Some(Level::ChangedMind)).unwrap();
        first.set(&key("58515/2"), reader(2), Some(Level::DugIn)).unwrap();
        let second = Store::open(&path, known).unwrap();
        assert_eq!(second.all_counts(), first.all_counts());
        assert_eq!(second.mine(&reader(1)), first.mine(&reader(1)));
    }

    #[test]
    fn opening_rejects_bad_store_files_with_specifics() {
        let known: BTreeSet<PostKey> = [key("58515/1")].into_iter().collect();
        let cases = [
            (r#"{"format":"other","ratings":{}}"#, "format is \"other\""),
            (r#"{"format":"zforum-ratings-1","ratings":{"58515/7":{"00000000000000000000000000000001":"new-light"}}}"#, "not a visible post"),
            (r#"{"format":"zforum-ratings-1","ratings":{},"extra":1}"#, "unknown field `extra`"),
            (r#"{"format":"zforum-ratings-1","ratings":{"58515/1":{"00000000000000000000000000000001":"loved-it"}}}"#, "unknown variant `loved-it`"),
            (r#"{"format":"zforum-ratings-1","ratings":{"58515/1":{"short":"new-light"}}}"#, "reader id must be 32"),
            (r#"{"format":"zforum-ratings-1","ratings""#, "EOF"),
        ];
        for (index, (text, expected)) in cases.iter().enumerate() {
            let path = temp_path(&format!("bad{index}"));
            fs::write(&path, text).unwrap();
            let error = Store::open(&path, known.clone()).err().unwrap_or_else(|| panic!("case {index} should fail"));
            assert!(error.contains(expected), "case {index}: {error:?} should mention {expected:?}");
        }
    }

    #[test]
    fn a_failed_save_leaves_memory_unchanged() {
        let path = temp_path("readonly");
        let mut store = Store::open(&path, [key("58515/1")].into_iter().collect()).unwrap();
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
        let result = store.set(&key("58515/1"), reader(1), Some(Level::NewLight));
        assert!(matches!(result, Err(SetError::Save(ref message)) if message.starts_with("saving ")), "{result:?}");
        assert!(store.all_counts().is_empty());
    }
}
