// Entry point: loads the site data, keeps the reader's state, talks to the ratings and
// feedback API, and routes between the home board (#/) and the topic page (#/topic/zcg).

import { replaceContent, h } from "./dom.js";
import { renderHome } from "./home.js";
import { DEFAULT_SETTINGS, isUnanswered, noAnswers, parseAnswers, parseFeedbackList, parsePostRatings, parseRatingsList, parseSettings, POSTS_PER_LOAD, shownToReach } from "./logic.js";
import { postElementId } from "./post.js";
import { renderTopic, THREAD_TABS_ID } from "./topic.js";

const SITE_DATA_FORMAT = "zforum-design-1";
const SETTINGS_KEY = "zforum.design.settings.v2";
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
    return { id, problem: writeProblem ?? "Your saved reader id was malformed, so a new one was made; earlier ratings and feedback from this browser are no longer linked to you." };
  }
  return { id, problem: problem === null ? null : `${problem} Your ratings and feedback will count, but this browser will not remember which ones were yours.` };
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

async function getJson(path, action) {
  const response = await fetch(path);
  if (!response.ok) throw await apiError(response, action);
  return response.json();
}

async function putJson(path, body, action) {
  const response = await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw await apiError(response, action);
  return response.json();
}

// A post key "58515/12" is also its path under api/ratings/ and api/feedback/.
const apiPath = (kind, key) => `api/${kind}/${key}`;

// Changes to one post are sent one after another, so the server applies them in the order
// the reader made them. The caller gets each send's own promise and reports its failure;
// the queue only waits for it to settle.
const pendingSends = new Map();
function inOrder(id, send) {
  const next = (pendingSends.get(id) ?? Promise.resolve()).then(send);
  pendingSends.set(id, next.then(() => undefined, () => undefined));
  return next;
}

const settingsLoad = loadSettings();
const state = {
  data: null,
  settings: settingsLoad.settings,
  settingsProblem: settingsLoad.problem,
  lastVisit: loadLastVisit(),
  reader: loadReader(),
  revealed: new Set(),
  open: { why: false, settings: false, marks: new Set() },
  thread: null,
  shown: new Map(),
  versions: new Map(),
  flash: null,
  ratings: { status: "loading", posts: {}, mine: {}, problem: null },
  feedback: { status: "loading", mine: {}, problem: null },
};

const threadOfPost = (key) => state.data.topic.threads.find((thread) => thread.posts.some((post) => post.key === key));

const actions = {
  setSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    const problem = storageSet(SETTINGS_KEY, JSON.stringify(state.settings));
    if (problem !== null) state.settingsProblem = `${problem} Settings last for this page view only.`;
    render({ keepScroll: true });
  },
  reveal(key) {
    state.revealed.add(key);
  },
  setOpen(kind, key, open) {
    if (kind === "why" || kind === "settings") state.open[kind] = open;
    else if (open) state.open[kind].add(key);
    else state.open[kind].delete(key);
  },
  setVersion(key, version) {
    state.versions.set(key, version);
  },
  setThread(threadId) {
    state.thread = threadId;
    render({ keepScroll: true });
    const tabs = document.getElementById(THREAD_TABS_ID);
    if (tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: "start" });
  },
  showMore(threadId) {
    state.shown.set(threadId, state.shown.get(threadId) + POSTS_PER_LOAD);
  },
  // Opens a cited post in its thread's tab with its original showing, scrolls to it, and
  // highlights it.
  openPost(key) {
    const thread = threadOfPost(key);
    state.thread = thread.id;
    state.shown.set(thread.id, shownToReach(thread.posts.findIndex((post) => post.key === key), state.shown.get(thread.id)));
    state.versions.set(key, "original");
    state.flash = key;
    render({ keepScroll: true });
    document.getElementById(postElementId(key)).scrollIntoView({ behavior: "smooth", block: "center" });
  },
  // Resolves once the rating is saved and the counts are updated. A failure switches the
  // ratings off with the reason shown.
  async rate(key, rating) {
    try {
      const result = parsePostRatings(await inOrder(`rating ${key}`, () => putJson(apiPath("ratings", key), { reader: state.reader.id, rating }, "saving your rating")));
      state.ratings.posts[key] = result.counts;
      if (result.mine === null) delete state.ratings.mine[key];
      else state.ratings.mine[key] = result.mine;
    } catch (error) {
      state.ratings = { ...state.ratings, status: "error", problem: error.message };
      render({ keepScroll: true });
    }
  },
  // The slider shows the new answer at once; the server must then echo exactly what was
  // sent. A failure switches feedback off with the reason shown.
  giveFeedback(key, answers) {
    if (isUnanswered(answers)) delete state.feedback.mine[key];
    else state.feedback.mine[key] = answers;
    inOrder(`feedback ${key}`, () => putJson(apiPath("feedback", key), { reader: state.reader.id, ...answers }, "saving your feedback"))
      .then((result) => {
        const stored = result.mine === null ? noAnswers() : parseAnswers(result.mine, "feedback.mine");
        if (JSON.stringify(stored) !== JSON.stringify(answers)) throw new Error(`the server stored ${JSON.stringify(stored)} for ${key}, but ${JSON.stringify(answers)} was sent`);
      })
      .catch((error) => {
        state.feedback = { ...state.feedback, status: "error", problem: error.message };
        render({ keepScroll: true });
      });
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

async function loadRatings(visible) {
  try {
    const ratings = parseRatingsList(await getJson(`api/ratings?reader=${state.reader.id}`, "loading ratings"), visible);
    state.ratings = { status: "ready", posts: ratings.posts, mine: ratings.mine, problem: null };
  } catch (error) {
    state.ratings = { status: "error", posts: {}, mine: {}, problem: error.message };
  }
}

async function loadFeedback(restated) {
  try {
    const feedback = parseFeedbackList(await getJson(`api/feedback?reader=${state.reader.id}`, "loading your feedback"), restated);
    state.feedback = { status: "ready", mine: feedback.mine, problem: null };
  } catch (error) {
    state.feedback = { status: "error", mine: {}, problem: error.message };
  }
}

async function start() {
  try {
    state.data = await loadData();
  } catch (error) {
    replaceContent(main, h("p", { class: "notice" }, `zforum could not load its data: ${error.message}`));
    throw error;
  }
  const threads = state.data.topic.threads;
  state.thread = threads[0].id;
  for (const thread of threads) state.shown.set(thread.id, POSTS_PER_LOAD);
  window.addEventListener("hashchange", () => render({ keepScroll: false }));
  render({ keepScroll: false });
  const visible = threads.flatMap((thread) => thread.posts).filter((post) => !post.hidden);
  await Promise.all([
    loadRatings(new Set(visible.map((post) => post.key))),
    loadFeedback(new Set(visible.filter((post) => post.clean !== null).map((post) => post.key))),
  ]);
  render({ keepScroll: true });
}

start();
