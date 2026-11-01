//! Per-reader answers about posts: each reader gives each post at most one value. The store
//! is a JSON file rewritten atomically on every change. Mind-change ratings (`ratings.rs`)
//! and restatement feedback (`feedback.rs`) both use it.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize, de};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

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

type Entries<V> = BTreeMap<PostKey, BTreeMap<ReaderId, V>>;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoreFile<V> {
    format: String,
    entries: Entries<V>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SetError {
    UnknownPost(PostKey),
    Save(String),
}

pub struct Store<V> {
    path: PathBuf,
    format: &'static str,
    accepted_posts: BTreeSet<PostKey>,
    entries: Entries<V>,
}

impl<V: Clone + Serialize + DeserializeOwned> Store<V> {
    /// Opens the store at `path`, or starts an empty one if the file does not exist yet.
    /// Entries for posts outside `accepted_posts` are an error: the site data changed under
    /// the store, and silently dropping or keeping them would both be wrong.
    pub fn open(path: &Path, format: &'static str, accepted_posts: BTreeSet<PostKey>) -> Result<Self, String> {
        let entries = match fs::read_to_string(path) {
            Ok(text) => {
                let file: StoreFile<V> = serde_json::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))?;
                if file.format != format {
                    return Err(format!("{}: format is {:?}, expected {format:?}", path.display(), file.format));
                }
                if let Some(unknown) = file.entries.keys().find(|key| !accepted_posts.contains(key)) {
                    return Err(format!("{}: has an entry for {unknown:?}, which is not a post this store accepts (did the site data change?)", path.display()));
                }
                file.entries
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(error) => return Err(format!("reading {}: {error}", path.display())),
        };
        Ok(Store { path: path.to_owned(), format, accepted_posts, entries })
    }

    /// Sets (or with `None`, clears) one reader's value for one post, and saves. If saving
    /// fails the change is undone, so memory and disk never disagree.
    pub fn set(&mut self, post: &PostKey, reader: ReaderId, value: Option<V>) -> Result<(), SetError> {
        if !self.accepted_posts.contains(post) {
            return Err(SetError::UnknownPost(post.clone()));
        }
        let before = self.entries.clone();
        let by_reader = self.entries.entry(post.clone()).or_default();
        match value {
            Some(value) => {
                by_reader.insert(reader, value);
            }
            None => {
                by_reader.remove(&reader);
            }
        }
        if by_reader.is_empty() {
            self.entries.remove(post);
        }
        if let Err(error) = self.save() {
            self.entries = before;
            return Err(SetError::Save(error));
        }
        Ok(())
    }

    pub fn get(&self, post: &PostKey, reader: &ReaderId) -> Option<V> {
        self.entries.get(post).and_then(|by_reader| by_reader.get(reader)).cloned()
    }

    /// Every reader's value for one post.
    pub fn values(&self, post: &PostKey) -> impl Iterator<Item = &V> {
        self.entries.get(post).into_iter().flat_map(|by_reader| by_reader.values())
    }

    /// The posts that have at least one value.
    pub fn posts(&self) -> impl Iterator<Item = &PostKey> {
        self.entries.keys()
    }

    pub fn mine(&self, reader: &ReaderId) -> BTreeMap<PostKey, V> {
        self.entries
            .iter()
            .filter_map(|(post, by_reader)| by_reader.get(reader).map(|value| (post.clone(), value.clone())))
            .collect()
    }

    /// Writes a temporary file beside the store, fsyncs it, and renames it over the store.
    fn save(&self) -> Result<(), String> {
        let file = StoreFile { format: self.format.to_owned(), entries: self.entries.clone() };
        let text = serde_json::to_string_pretty(&file).map_err(|error| format!("encoding {}: {error}", self.path.display()))?;
        let directory = self.path.parent().ok_or_else(|| format!("{} has no parent directory", self.path.display()))?;
        let name = self.path.file_name().ok_or_else(|| format!("{} has no file name", self.path.display()))?;
        let temporary = directory.join(format!(".{}.{}.tmp", name.to_string_lossy(), std::process::id()));
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
pub mod tests {
    use super::*;

    const FORMAT: &str = "zforum-test-1";

    pub fn reader(n: u8) -> ReaderId {
        ReaderId::parse(&format!("{:032x}", n)).unwrap()
    }

    pub fn key(text: &str) -> PostKey {
        PostKey::parse(text).unwrap()
    }

    /// A fresh, empty directory for one test.
    pub fn temp_dir(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!("zforum-store-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn accepted() -> BTreeSet<PostKey> {
        [key("58515/1"), key("58515/2")].into_iter().collect()
    }

    fn store(name: &str) -> Store<String> {
        Store::open(&temp_dir(name).join("store.json"), FORMAT, accepted()).unwrap()
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
    fn a_new_store_is_empty() {
        let store = store("empty");
        assert_eq!(store.values(&key("58515/1")).count(), 0);
        assert_eq!(store.posts().count(), 0);
        assert!(store.mine(&reader(1)).is_empty());
    }

    #[test]
    fn readers_set_replace_and_clear_only_their_own_value() {
        let mut store = store("set");
        let post = key("58515/1");
        store.set(&post, reader(1), Some("a".to_owned())).unwrap();
        store.set(&post, reader(2), Some("b".to_owned())).unwrap();
        store.set(&post, reader(1), Some("c".to_owned())).unwrap();
        assert_eq!(store.values(&post).cloned().collect::<Vec<_>>(), ["c", "b"]);
        assert_eq!(store.get(&post, &reader(1)), Some("c".to_owned()));
        store.set(&post, reader(1), None).unwrap();
        assert_eq!(store.get(&post, &reader(1)), None);
        assert_eq!(store.mine(&reader(2)), [(post.clone(), "b".to_owned())].into_iter().collect());
    }

    #[test]
    fn clearing_the_last_value_removes_the_post() {
        let mut store = store("clear");
        let post = key("58515/2");
        store.set(&post, reader(1), Some("a".to_owned())).unwrap();
        assert_eq!(store.posts().collect::<Vec<_>>(), [&post]);
        store.set(&post, reader(1), None).unwrap();
        assert_eq!(store.posts().count(), 0);
    }

    #[test]
    fn posts_outside_the_accepted_set_are_refused_and_change_nothing() {
        let mut store = store("unknown");
        assert_eq!(store.set(&key("58515/99"), reader(1), Some("a".to_owned())), Err(SetError::UnknownPost(key("58515/99"))));
        assert_eq!(store.posts().count(), 0);
    }

    #[test]
    fn values_survive_reopening_and_two_stores_can_share_a_directory() {
        let directory = temp_dir("reopen");
        let mut first = Store::open(&directory.join("a.json"), FORMAT, accepted()).unwrap();
        let mut other = Store::open(&directory.join("b.json"), FORMAT, accepted()).unwrap();
        first.set(&key("58515/1"), reader(1), Some("x".to_owned())).unwrap();
        other.set(&key("58515/2"), reader(2), Some("y".to_owned())).unwrap();
        first.set(&key("58515/2"), reader(2), Some("z".to_owned())).unwrap();
        let second: Store<String> = Store::open(&directory.join("a.json"), FORMAT, accepted()).unwrap();
        assert_eq!(second.mine(&reader(1)), first.mine(&reader(1)));
        assert_eq!(second.mine(&reader(2)), first.mine(&reader(2)));
        let other_again: Store<String> = Store::open(&directory.join("b.json"), FORMAT, accepted()).unwrap();
        assert_eq!(other_again.mine(&reader(2)), [(key("58515/2"), "y".to_owned())].into_iter().collect());
        let leftovers: Vec<_> = fs::read_dir(&directory).unwrap().map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).filter(|name| name.ends_with(".tmp")).collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    #[test]
    fn opening_rejects_bad_store_files_with_specifics() {
        let only_first: BTreeSet<PostKey> = [key("58515/1")].into_iter().collect();
        let cases = [
            (r#"{"format":"other","entries":{}}"#, "format is \"other\""),
            (r#"{"format":"zforum-test-1","entries":{"58515/7":{"00000000000000000000000000000001":"a"}}}"#, "not a post this store accepts"),
            (r#"{"format":"zforum-test-1","entries":{},"extra":1}"#, "unknown field `extra`"),
            (r#"{"format":"zforum-test-1","entries":{"58515/1":{"00000000000000000000000000000001":7}}}"#, "invalid type"),
            (r#"{"format":"zforum-test-1","entries":{"58515/1":{"short":"a"}}}"#, "reader id must be 32"),
            (r#"{"format":"zforum-test-1","entries""#, "EOF"),
        ];
        for (index, (text, expected)) in cases.iter().enumerate() {
            let path = temp_dir(&format!("bad{index}")).join("store.json");
            fs::write(&path, text).unwrap();
            let error = Store::<String>::open(&path, FORMAT, only_first.clone()).err().unwrap_or_else(|| panic!("case {index} should fail"));
            assert!(error.contains(expected), "case {index}: {error:?} should mention {expected:?}");
        }
    }

    #[test]
    fn a_failed_save_leaves_memory_unchanged() {
        let path = temp_dir("readonly").join("store.json");
        let mut store: Store<String> = Store::open(&path, FORMAT, accepted()).unwrap();
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
        let result = store.set(&key("58515/1"), reader(1), Some("a".to_owned()));
        assert!(matches!(result, Err(SetError::Save(ref message)) if message.starts_with("saving ")), "{result:?}");
        assert_eq!(store.posts().count(), 0);
    }
}
