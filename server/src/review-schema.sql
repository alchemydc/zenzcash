BEGIN IMMEDIATE;
CREATE TABLE import_review_history(
  sequence INTEGER PRIMARY KEY,
  thread INTEGER NOT NULL CHECK(thread>0),
  recorded_at TEXT NOT NULL,
  operator TEXT NOT NULL,
  prior TEXT,
  replacement TEXT NOT NULL,
  reason TEXT NOT NULL
);
PRAGMA user_version=11;
COMMIT;
