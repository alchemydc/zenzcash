BEGIN IMMEDIATE;
CREATE INDEX feedback_account_post ON feedback(account,post,dimension,seq);
CREATE TABLE progress_cache(
  account TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  emotions REAL NOT NULL CHECK(emotions BETWEEN -1 AND 1),
  head REAL NOT NULL CHECK(head BETWEEN -1 AND 1)
);
CREATE TRIGGER feedback_progress_insert AFTER INSERT ON feedback BEGIN DELETE FROM progress_cache WHERE account=NEW.account; END;
CREATE TRIGGER feedback_progress_update AFTER UPDATE ON feedback BEGIN DELETE FROM progress_cache WHERE account IN (OLD.account,NEW.account); END;
CREATE TRIGGER feedback_progress_delete AFTER DELETE ON feedback BEGIN DELETE FROM progress_cache WHERE account=OLD.account; END;
CREATE TRIGGER clears_progress_insert AFTER INSERT ON feedback_clears BEGIN DELETE FROM progress_cache WHERE account=NEW.account; END;
CREATE TRIGGER clears_progress_update AFTER UPDATE ON feedback_clears BEGIN DELETE FROM progress_cache WHERE account IN (OLD.account,NEW.account); END;
CREATE TRIGGER clears_progress_delete AFTER DELETE ON feedback_clears BEGIN DELETE FROM progress_cache WHERE account=OLD.account; END;
CREATE TRIGGER moods_progress_insert AFTER INSERT ON moods BEGIN DELETE FROM progress_cache WHERE account=NEW.account; END;
CREATE TRIGGER moods_progress_update AFTER UPDATE ON moods BEGIN DELETE FROM progress_cache WHERE account IN (OLD.account,NEW.account); END;
CREATE TRIGGER moods_progress_delete AFTER DELETE ON moods BEGIN DELETE FROM progress_cache WHERE account=OLD.account; END;
PRAGMA user_version=8;
COMMIT;
