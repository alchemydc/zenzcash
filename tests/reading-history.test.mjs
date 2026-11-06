import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadingHistory } from '../site/js/reading-history.js';
const saved = { bookmarked: true, read: false };

test('topic pages merge without replacing other saved state and writes win over delayed reads', async () => {
  const calls = [];
  let finish;
  const history = new ReadingHistory(async path => {
    calls.push(path);
    const query = new URL(path, 'http://localhost').searchParams;
    if (!query.get('after')) return { entries: { '7/1': saved }, next: '7/1' };
    return new Promise(resolve => { finish = resolve; });
  });
  history.record('8/1', saved);
  const loaded = history.loadTopic('topic');
  await new Promise(resolve => setImmediate(resolve));
  history.record('7/2', null);
  finish({ entries: { '7/2': saved }, next: null });
  await loaded;
  assert.deepEqual(history.entries, { '8/1': saved, '7/1': saved });
  await history.loadTopic('topic');
  assert.deepEqual(calls, ['api/account/reading?topic=topic&after=', 'api/account/reading?topic=topic&after=7%2F1']);
});

test('saved posts load one page on demand, preserving other topic state', async () => {
  const calls = [];
  const history = new ReadingHistory(async path => {
    calls.push(path);
    return calls.length === 1 ? { entries: { '7/1': saved }, next: '7/1' } : { entries: { '8/1': saved }, next: null };
  });
  history.record('9/1', { read: true, bookmarked: false });
  await history.loadBookmarks();
  assert.equal(calls.length, 1);
  assert.equal(history.bookmarksNext, '7/1');
  history.record('7/1', null);
  assert.equal(calls.length, 1);
  await history.loadBookmarks();
  await history.loadBookmarks();
  assert.equal(calls.length, 2);
  assert.deepEqual(history.entries, { '8/1': saved, '9/1': { read: true, bookmarked: false } });
});

test('malformed and nonadvancing pages are refused before applying their data', async () => {
  for (const page of [
    { entries: { '7/1': { read: false, bookmarked: false } }, next: null },
    { entries: { '7/1': saved }, next: '7/2' },
    { entries: [], next: null },
  ]) {
    const history = new ReadingHistory(async () => page);
    await assert.rejects(history.loadBookmarks());
    assert.deepEqual(history.entries, {});
  }
});
