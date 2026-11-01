// Entry point: loads the site data, keeps the reader's state, talks to the ratings API, and
// routes between the home board (#/) and the topic page (#/topic/zcg).

import { replaceContent, h } from "./dom.js";
import { renderHome } from "./home.js";
import { DEFAULT_SETTINGS, parseSettings } from "./logic.js";
import { postElementId, renderTopic } from "./topic.js";

const SITE_DATA_FORMAT = "zforum-design-1";
const SETTINGS_KEY = "zforum.design.settings.v1";
const READER_KEY = "zforum.design.reader.v1";
const LAST_VISIT_KEY = "zforum.design.lastvisit.v1";
const READER_ID = /^[0-9a-f]{32}$/;

const main = document.getElementById("main");

// Browser storage can be unavailable (private windows, blocked site data). Every use goes
// through these two, and a failure is reported on the page, never swallowed.
function storageGet(key) {
  try {
    return { value: localStorage.getItem(key) };
  } catch (error) {
    return { value: null, problem: `This browser won't let zforum remember things (${error.message}).` };
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return null;
  } catch (error) {
    return `This browser won't let zforum remember things (${error.message}).`;
  }
}

function loadSettings() {
  const stored = storageGet(SETTINGS_KEY);
  if (stored.problem) return { settings: { ...DEFAULT_SETTINGS }, problem: stored.problem };
  if (stored.value === null) return { settings: { ...DEFAULT_SETTINGS }, problem: null };
  try {
    return { settings: parseSettings(stored.value), problem: null };
  } catch (error) {
    return { settings: { ...DEFAULT_SETTINGS }, problem: `Your saved reading settings could not be read, so the defaults are in use (${error.message}).` };
  }
}

function loadReader() {
  const stored = storageGet(READER_KEY);
  if (stored.value !== null && READER_ID.test(stored.value)) return { id: stored.value, problem: null };
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const problem = stored.problem ?? (stored.value !== null ? null : storageSet(READER_KEY, id));
  if (stored.value !== null && !READER_ID.test(stored.value)) {
    const writeProblem = storageSet(READER_KEY, id);
    return { id, problem: writeProblem ?? "Your saved reader id was malformed, so a new one was made; earlier ratings from this browser are no longer linked to you." };
  }
  return { id, problem: problem === null ? null : `${problem} Your ratings will count, but this browser will not remember which ones were yours.` };
}

// The previous visit is read once per page load, then replaced with now.
function loadLastVisit() {
  const stored = storageGet(LAST_VISIT_KEY);
  const previous = stored.value !== null && !Number.isNaN(Date.parse(stored.value)) ? stored.value : null;
  storageSet(LAST_VISIT_KEY, new Date().toISOString());
  return previous;
}

async function loadData() {
  const response = await fetch("data/zcg.json");
  if (!response.ok) throw new Error(`loading data/zcg.json failed: HTTP ${response.status}`);
  const data = await response.json();
  if (data.format !== SITE_DATA_FORMAT) throw new Error(`data/zcg.json has format ${JSON.stringify(data.format)}, expected ${JSON.stringify(SITE_DATA_FORMAT)}`);
  return data;
}

async function apiError(response, action) {
  return new Error(`${action} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
}

async function fetchRatings(readerId) {
  const response = await fetch(`api/ratings?reader=${readerId}`);
  if (!response.ok) throw await apiError(response, "loading ratings");
  return response.json();
}

async function putRating(key, readerId, rating) {
  const [topicId, postNumber] = key.split("/");
  const response = await fetch(`api/ratings/${topicId}/${postNumber}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reader: readerId, rating }),
  });
  if (!response.ok) throw await apiError(response, "saving your rating");
  return response.json();
}

const settingsLoad = loadSettings();
const state = {
  data: null,
  settings: settingsLoad.settings,
  settingsProblem: settingsLoad.problem,
  lastVisit: loadLastVisit(),
  reader: loadReader(),
  revealed: new Set(),
  open: { why: false, originals: new Set(), marks: new Set() },
  flash: null,
  ratings: { status: "loading", posts: {}, mine: {}, problem: null },
};

const actions = {
  setSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    const problem = storageSet(SETTINGS_KEY, JSON.stringify(state.settings));
    if (problem !== null) state.settingsProblem = `${problem} Settings last for this page view only.`;
    render({ keepScroll: true });
  },
  reveal(key) {
    state.revealed.add(key);
    render({ keepScroll: true });
  },
  setOpen(kind, key, open) {
    if (kind === "why") state.open.why = open;
    else if (open) state.open[kind].add(key);
    else state.open[kind].delete(key);
  },
  // Opens a cited post with its original showing, scrolls to it, and highlights it briefly.
  openPost(key) {
    state.open.originals.add(key);
    state.flash = key;
    render({ keepScroll: true });
    document.getElementById(postElementId(key)).scrollIntoView({ behavior: "smooth", block: "center" });
  },
  async rate(key, rating) {
    try {
      const result = await putRating(key, state.reader.id, rating);
      state.ratings.posts[key] = result.counts;
      if (result.mine === null) delete state.ratings.mine[key];
      else state.ratings.mine[key] = result.mine;
    } catch (error) {
      state.ratings = { ...state.ratings, status: "error", problem: error.message };
    }
    render({ keepScroll: true });
  },
};

function notices() {
  return state.settingsProblem ? h("p", { class: "notice" }, state.settingsProblem) : null;
}

function render({ keepScroll }) {
  const scroll = window.scrollY;
  const route = location.hash.replace(/^#/, "") || "/";
  let page;
  if (route === "/") page = renderHome(state.data, state.settings, actions);
  else if (route === `/topic/${state.data.topic.id}`) page = renderTopic(state.data, state, actions);
  else page = h("div", {}, h("h1", {}, "Not found"), h("p", {}, "There is no page at ", h("code", {}, location.hash), ". ", h("a", { href: "#/" }, "Back to all topics")));
  replaceContent(main, [notices(), page]);
  if (keepScroll) window.scrollTo(0, scroll);
  else window.scrollTo(0, 0);
}

async function start() {
  try {
    state.data = await loadData();
  } catch (error) {
    replaceContent(main, h("p", { class: "notice" }, `zforum could not load its data: ${error.message}`));
    throw error;
  }
  window.addEventListener("hashchange", () => render({ keepScroll: false }));
  render({ keepScroll: false });
  try {
    const ratings = await fetchRatings(state.reader.id);
    state.ratings = { status: "ready", posts: ratings.posts, mine: ratings.mine, problem: null };
  } catch (error) {
    state.ratings = { status: "error", posts: {}, mine: {}, problem: error.message };
  }
  render({ keepScroll: true });
}

start();
