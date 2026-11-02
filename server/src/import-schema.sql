BEGIN IMMEDIATE;
CREATE TABLE import_runs(id TEXT PRIMARY KEY, since TEXT NOT NULL, until TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('running','failed','complete')), state TEXT NOT NULL);
CREATE UNIQUE INDEX one_active_import ON import_runs((1)) WHERE status != 'complete';
CREATE TABLE import_topics(topic TEXT PRIMARY KEY, snapshot TEXT, summary TEXT);
CREATE TABLE import_threads(thread INTEGER PRIMARY KEY CHECK(thread>0), topic TEXT NOT NULL REFERENCES import_topics(topic));
CREATE TABLE import_posts(id INTEGER PRIMARY KEY CHECK(id>0), thread INTEGER NOT NULL REFERENCES import_threads(thread), number INTEGER NOT NULL CHECK(number>0), hidden INTEGER NOT NULL CHECK(hidden IN (0,1)), fingerprint TEXT NOT NULL, UNIQUE(thread,number));
PRAGMA user_version=5;
COMMIT;
