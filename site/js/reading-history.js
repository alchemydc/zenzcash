const validKey = key => typeof key === "string" && /^[1-9][0-9]*\/[1-9][0-9]*$/.test(key);
function validateEntry(key, entry) {
  if (!validKey(key) || !entry || Object.keys(entry).sort().join(',') !== 'bookmarked,read' || typeof entry.read !== 'boolean' || typeof entry.bookmarked !== 'boolean' || !(entry.read || entry.bookmarked)) throw new Error(`Invalid reading entry ${key}`);
}

export class ReadingHistory {
  constructor(fetchPage) {
    this.fetchPage = fetchPage;
    this.entries = {};
    this.revisions = new Map();
    this.revision = 0;
    this.topics = new Map();
    this.bookmarksNext = '';
    this.bookmarksLoaded = false;
    this.loadingBookmarks = null;
  }
  record(key, entry) {
    if (!validKey(key)) throw new Error(`Invalid reading key ${key}`);
    if (entry !== null) validateEntry(key, entry);
    this.revisions.set(key, ++this.revision);
    if (entry === null) delete this.entries[key]; else this.entries[key] = entry;
  }
  async page(parameters) {
    const revision = this.revision;
    const page = await this.fetchPage(`api/account/reading?${new URLSearchParams(parameters)}`);
    if (!page || Object.keys(page).sort().join(',') !== 'entries,next' || !page.entries || typeof page.entries !== 'object' || Array.isArray(page.entries) || !(page.next === null || validKey(page.next))) throw new Error('Invalid reading page');
    const entries = Object.entries(page.entries);
    for (const [key, entry] of entries) {
      validateEntry(key, entry);
      if (key <= (parameters.after ?? '')) throw new Error('Reading page did not advance');
    }
    if (page.next !== null && (entries.length === 0 || page.next !== entries.map(([key]) => key).sort().at(-1))) throw new Error('Invalid reading page cursor');
    for (const [key, entry] of entries) if ((this.revisions.get(key) ?? 0) <= revision) this.entries[key] = entry;
    return page.next;
  }
  loadTopic(topic) {
    if (!this.topics.has(topic)) {
      const loading = (async () => {
        let after = '';
        do { after = await this.page({ topic, after }); } while (after !== null);
      })();
      this.topics.set(topic, loading);
      loading.catch(() => this.topics.delete(topic));
    }
    return this.topics.get(topic);
  }
  loadBookmarks() {
    if (this.loadingBookmarks) return this.loadingBookmarks;
    if (this.bookmarksNext === null) return Promise.resolve();
    this.loadingBookmarks = (async () => {
      try {
        this.bookmarksNext = await this.page({ bookmarks: 'true', after: this.bookmarksNext });
        this.bookmarksLoaded = true;
      } finally { this.loadingBookmarks = null; }
    })();
    return this.loadingBookmarks;
  }
}
