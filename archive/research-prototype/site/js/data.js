// Loading site data and the reader's local state.

const cache = new Map();

// The site's data files are produced by zforum.site; each carries a format tag that must
// match exactly, so a stale or foreign file fails loudly instead of rendering wrongly.
export async function loadJson(path, expectedFormat) {
  if (!cache.has(path)) {
    cache.set(path, (async () => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`loading ${path} failed: HTTP ${response.status}`);
      const document = await response.json();
      if (document.format !== expectedFormat) throw new Error(`${path} has format ${JSON.stringify(document.format)}, expected ${JSON.stringify(expectedFormat)}`);
      return document;
    })());
  }
  return cache.get(path);
}

export const loadIndex = () => loadJson("data/index.json", "zforum-site-index-1");
export const loadThread = (topicId) => loadJson(`data/t/${topicId}.json`, "zforum-site-thread-1");
export const loadReceipts = () => loadJson("data/receipts.json", "zforum-site-receipts-1");

const MUTES_KEY = "zforum.mutes.v1";

// Mutes live only in this browser. Storage can be unavailable (private windows, blocked
// site data): that is reported to the reader, and mutes then last for this page view only.
export function readMutes() {
  try {
    const raw = localStorage.getItem(MUTES_KEY);
    return { stored: raw === null ? {} : JSON.parse(raw), persistent: true };
  } catch (error) {
    return { stored: {}, persistent: false, problem: `mutes cannot be saved in this browser (${error.message})` };
  }
}

export function writeMutes(stored) {
  try {
    localStorage.setItem(MUTES_KEY, JSON.stringify(stored));
    return { persistent: true };
  } catch (error) {
    return { persistent: false, problem: `mutes cannot be saved in this browser (${error.message})` };
  }
}

const STANCES_KEY = "zforum.stances.v1";

// {snapshot, answers: {issueId: stanceId | "unsure"}}, kept only in this browser.
export function readStances() {
  try {
    const raw = localStorage.getItem(STANCES_KEY);
    return { stored: raw === null ? null : JSON.parse(raw), persistent: true };
  } catch (error) {
    return { stored: null, persistent: false, problem: `your answers cannot be saved in this browser (${error.message})` };
  }
}

export function writeStances(stored) {
  try {
    localStorage.setItem(STANCES_KEY, JSON.stringify(stored));
    return { persistent: true };
  } catch (error) {
    return { persistent: false, problem: `your answers cannot be saved in this browser (${error.message})` };
  }
}
