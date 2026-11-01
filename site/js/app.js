// Entry point: loads the site data, keeps the reader's state, talks to the ratings and
// feedback API, and routes between the home board (#/) and the topic page (#/topic/zcg).

import { replaceContent, h } from "./dom.js";
import { renderHome } from "./home.js";
import { DEFAULT_SETTINGS, isUnanswered, noAnswers, parseAnswers, parseFeedbackList, parsePostRatings, parseRatingsList, parseSettings, POSTS_PER_LOAD, shownToReach } from "./logic.js";
import { postElementId } from "./post.js";
import { renderTopic, THREAD_TABS_ID } from "./topic.js";
import { topicRoute } from "./selection.js";
import { SITE_DATA_FORMAT } from "./vocab.js";
import { SpeechPlayer, postQueue, overviewQueue } from "./speech.js";
import { playerView } from "./player-view.js";
import { accountPanel, companionView, credentialOptions, credentialJSON, guestVisit, parsePersonal } from "./personal.js";

const SETTINGS_KEY = "zforum.design.settings.v4";
const LAST_VISIT_KEY = "zforum.visit.v2";
const DEVICE_KEY = "zforum.device.v1";

const main = document.getElementById("main");
const listening = document.createElement("aside");
document.body.append(listening);
const companion = document.createElement("aside");
document.body.append(companion);
let listeningVersion = "neutral";
const listeningIdentity = () => JSON.stringify([state.data.snapshot_at, state.data.feedback_version, state.settings.anonymous]);
const player = new SpeechPlayer({ engine: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance,
  save: (record) => { const problem = storageSet("zforum.listening.v1", JSON.stringify(record)); if (problem) throw new Error(problem); },
  changed: () => replaceContent(listening, playerView(player, listeningVersion, (value) => { listeningVersion = value; player.changed(); })),
});
window.speechSynthesis?.addEventListener("voiceschanged", () => player.changed());

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
  if (stored.value === null) {
    const previous = storageGet("zforum.design.settings.v3");
    return { settings: { ...DEFAULT_SETTINGS }, problem: previous.problem ?? (previous.value === null ? null : "Reading settings now use calendar months. Your earlier settings remain in browser storage; defaults are in use until you choose new settings.") };
  }
  try {
    return { settings: parseSettings(stored.value), problem: null };
  } catch (error) {
    return { settings: { ...DEFAULT_SETTINGS }, problem: `Your saved reading settings could not be read, so the defaults are in use (${error.message}).` };
  }
}

function loadLastVisit() {
  try {
    const stored = storageGet(LAST_VISIT_KEY);
    if (stored.problem) throw new Error(stored.problem);
    const visit = guestVisit(stored.value === null ? null : JSON.parse(stored.value), Date.now());
    const problem = storageSet(LAST_VISIT_KEY, JSON.stringify(visit));
    if (problem) throw new Error(problem);
    return visit.cutoff;
  } catch (error) { state.settingsProblem = `Visit tracking unavailable: ${error.message}`; return null; }
}
function deviceId() {
  const stored = storageGet(DEVICE_KEY);
  if (stored.problem) throw new Error(stored.problem);
  if (stored.value !== null) {
    if (!/^[0-9a-f]{32}$/.test(stored.value)) throw new Error("Saved device identifier is invalid");
    return stored.value;
  }
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((value) => value.toString(16).padStart(2, "0")).join("");
  const problem = storageSet(DEVICE_KEY, id); if (problem) throw new Error(problem);
  return id;
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

async function putJson(path, body, action, method = "PUT") {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json", "X-Zforum-Request": "1", "X-CSRF-Token": state.account.csrf ?? "" }, body: JSON.stringify(body) });
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
  contentUnavailable: false,
  settings: settingsLoad.settings,
  settingsProblem: settingsLoad.problem,
  lastVisit: null,
  reader: { problem: null },
  account: { authenticated: false, personal: null, csrf: null, auth_available: false, auth_problem: null, open: false, recovery_codes: null, problem: null },
  revealed: new Set(),
  open: { settings: false, summary: false, flags: false, marks: new Set(), questions: new Set(), arguments: new Set() },
  thread: null,
  shown: new Map(),
  versions: new Map(),
  expanded: new Set(),
  selecting: false,
  selected: new Set(),
  flash: null,
  ratings: { status: "loading", posts: {}, mine: {}, problem: null },
  feedback: { status: "loading", mine: {}, problem: null },
};

const threadOfPost = (key) => state.data.topic.threads.find((thread) => thread.posts.some((post) => post.key === key));

const actions = {
  openAccount() { state.account.open = true; render({ keepScroll: true }); document.getElementById("account-panel").scrollIntoView({ block: "start" }); },
  listenSelected(selected) { if (!state.contentUnavailable) player.start(postQueue(state.data, selected, listeningVersion, state.settings.anonymous), listeningIdentity()); },
  listenPost(key) { actions.listenSelected(new Set([key])); },
  listenOverview() { if (!state.contentUnavailable) player.start(overviewQueue(state.data, state.settings.anonymous), listeningIdentity()); },
  selectScope(selected) { state.selected = selected; state.selecting = true; render({ keepScroll: true }); },
  setSettings(patch) {
    if (patch.anonymous !== undefined && patch.anonymous !== state.settings.anonymous) { player.pause(); player.queue = []; player.identity = null; player.notify(); }
    state.settings = { ...state.settings, ...patch };
    const problem = storageSet(SETTINGS_KEY, JSON.stringify(state.settings));
    if (problem !== null) state.settingsProblem = `${problem} Settings last for this page view only.`;
    if (state.account.authenticated) inOrder("preferences", () => putJson("api/account/preferences", state.settings, "saving filters")).catch((error) => { state.account.problem = error.message; render({ keepScroll: true }); });
    render({ keepScroll: true });
  },
  reveal(key) {
    state.revealed.add(key);
  },
  setOpen(kind, key, open) {
    if (kind === "settings" || kind === "summary" || kind === "flags") state.open[kind] = open;
    else if (open) state.open[kind].add(key);
    else state.open[kind].delete(key);
  },
  setVersion(key, version) {
    state.versions.set(key, version);
  },
  setExpanded(key, expanded) {
    if (expanded) state.expanded.add(key);
    else state.expanded.delete(key);
  },
  setSelecting(selecting) {
    state.selecting = selecting;
    render({ keepScroll: true });
  },
  collapseAll() {
    state.expanded.clear();
    render({ keepScroll: true });
    document.getElementById("collapse-all").focus();
  },
  selectPost(key, selected) {
    if (selected) state.selected.add(key);
    else state.selected.delete(key);
  },
  clearSelection() {
    state.selected.clear();
    render({ keepScroll: true });
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
    state.expanded.add(key);
    state.flash = key;
    render({ keepScroll: true });
    document.getElementById(postElementId(key)).scrollIntoView({ behavior: "smooth", block: "center" });
  },
  // Resolves once the rating is saved and the counts are updated. A failure switches the
  // ratings off with the reason shown.
  async rate(key, rating) {
    try {
      const result = parsePostRatings(await inOrder(`rating ${key}`, () => putJson(apiPath("ratings", key), { rating }, "saving your rating")));
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
    inOrder(`feedback ${key}`, () => putJson(apiPath("feedback", key), { rendition: threadOfPost(key).posts.find((post) => post.key === key).rendition_version, ...answers }, "saving your feedback"))
      .then((result) => {
        state.account.personal.progress = result.progress;
        updateCompanion();
        const stored = result.mine === null ? noAnswers() : parseAnswers(result.mine, "feedback.mine");
        if (JSON.stringify(stored) !== JSON.stringify(answers)) throw new Error(`the server stored ${JSON.stringify(stored)} for ${key}, but ${JSON.stringify(answers)} was sent`);
      })
      .catch((error) => {
        state.feedback = { ...state.feedback, status: "error", problem: error.message };
        render({ keepScroll: true });
      });
  },
};

async function loadAccount() {
  try {
    const account = await getJson("api/me", "loading your account");
    if (typeof account.authenticated !== "boolean" || typeof account.auth_available !== "boolean") throw new Error("Invalid account response");
    Object.assign(state.account, account, { csrf: account.authenticated ? account.csrf : null, personal: account.authenticated ? parsePersonal(account.personal) : null });
    if (state.account.personal?.preferences !== null && state.account.personal !== null) state.settings = parseSettings(JSON.stringify(state.account.personal.preferences));
  } catch (error) { Object.assign(state.account, { authenticated: false, csrf: null, personal: null, recovery_codes: null, problem: error.message }); }
}
async function recordVisit() {
  try {
    state.lastVisit = state.account.authenticated ? (await putJson("api/account/visit", { device: deviceId() }, "recording this visit", "POST")).cutoff : loadLastVisit();
  } catch (error) { state.account.problem = error.message; }
}
function updateCompanion() { replaceContent(companion, companionView(state.account.personal, () => { state.account.open = true; render({ keepScroll: true }); document.getElementById("account-panel").scrollIntoView({ block: "start" }); })); }
function savedPosts() {
  if (!state.account.personal) return null;
  const selected = Object.entries(state.account.personal.reading).filter(([,entry]) => entry.bookmarked);
  return h("details", { class: "saved-posts card" }, h("summary", {}, `Saved posts (${selected.length})`),
    selected.length ? h("ul", {}, selected.map(([key]) => {
      const post = state.data.topic.threads.flatMap((thread) => thread.posts).find((post) => post.key === key);
      return h("li", {}, post && !post.hidden ? h("button", { class: "linkish", on: { click: () => actions.openPost(key) } }, `${key} · ${post.analysis.summary}`) : `${key} · unavailable`,
        h("button", { class: "chip", on: { click: () => actions.setReading(key, { bookmarked: false }) } }, "Remove bookmark"));
    })) : h("p", {}, "Use Save post on any available post."));
}
function saveCodes() {
  const text = `zforum recovery codes for ${location.origin}\nEach code works once. Keep these private.\n\n${state.account.recovery_codes.join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "zforum-recovery-codes.txt"; document.body.append(link);
  try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
}
const personalActions = {
  async authenticate(mode, code = null) {
    if (!window.PublicKeyCredential) throw new Error("This browser does not support passkeys.");
    const options = await putJson("api/auth/start", { mode, code }, "starting passkey verification", "POST");
    const create = mode !== "login";
    const credential = await navigator.credentials[create ? "create" : "get"](credentialOptions(options, create));
    if (!credential) throw new Error("Passkey verification was cancelled");
    const result = await putJson("api/auth/finish", { credential: credentialJSON(credential) }, "verifying passkey", "POST");
    state.account.csrf = result.csrf; state.account.recovery_codes = result.recovery_codes; state.account.open = true; state.account.problem = null;
    await loadAccount(); await recordVisit(); await refreshAnswers(); render({ keepScroll: true });
  },
  async control(action) {
    const result = await putJson("api/account/control", { action }, "updating account", "POST");
    if (result.recovery_codes) state.account.recovery_codes = result.recovery_codes;
    if (["logout", "delete"].includes(action)) { state.account.recovery_codes = null; state.account.csrf = null; state.settings = loadSettings().settings; }
    await loadAccount(); await refreshAnswers(); render({ keepScroll: true });
  },
  async appearance(appearance) { state.account.personal = parsePersonal(await putJson("api/account/appearance", { appearance }, "saving Zamagotchi")); render({ keepScroll: true }); },
  async importSettings() { const settings = loadSettings().settings; await putJson("api/account/preferences", settings, "importing this browser’s filters"); state.settings = settings; await loadAccount(); render({ keepScroll: true }); },
  downloadCodes: saveCodes,
  hideCodes() { state.account.recovery_codes = null; render({ keepScroll: true }); },
};
actions.setReading = async (key, patch) => {
  try { state.account.personal = parsePersonal(await inOrder(`reading ${key}`, () => putJson(`api/account/reading/${key}`, patch, "saving post state"))); render({ keepScroll: true }); }
  catch (error) { state.account.problem = error.message; state.account.open = true; render({ keepScroll: true }); }
};
async function refreshAnswers() {
  const visible = state.data.topic.threads.flatMap((thread) => thread.posts).filter((post) => !post.hidden);
  await Promise.all([loadRatings(new Set(visible.map((post) => post.key))), loadFeedback(new Set(visible.filter((post) => post.analysis.neutral_rendition !== null).map((post) => post.key)))]);
}
async function checkContent() {
  try {
    const response = await fetch("data/zcg.json", { cache: "no-store" });
    if (response.status === 503) {
      state.contentUnavailable = true;
      player.pause(); player.queue = []; player.identity = null; player.notify(); state.selected.clear();
      replaceContent(main, h("p", { class: "notice" }, "Forum visibility changed. This topic is temporarily unavailable while a checked release is prepared. Refresh to retry."));
      return;
    }
    if (!response.ok) throw new Error(`checking content freshness: HTTP ${response.status}`);
    const data = await response.json();
    if (data.release_id !== state.data.release_id) { player.pause(); player.queue = []; player.identity = null; player.notify(); location.reload(); }
    else if (data.last_pulled_at !== state.data.last_pulled_at) {
      state.data.last_pulled_at = data.last_pulled_at;
      state.data.analysis_pending = data.analysis_pending;
      render({ keepScroll: true });
    }
  } catch (error) { state.settingsProblem = error.message; }
}

function notices() {
  return state.settingsProblem ? h("p", { class: "notice" }, state.settingsProblem) : null;
}

function render({ keepScroll }) {
  if (state.contentUnavailable) { replaceContent(main, h("p", { class: "notice" }, "Forum visibility changed. This topic is temporarily unavailable while a checked release is prepared. Refresh to retry.")); return; }
  const scroll = window.scrollY;
  const focusedId = keepScroll ? document.activeElement.id : "";
  const route = topicRoute(location.hash, state.data.topic);
  let page;
  if (route.kind === "home") page = renderHome(state.data, state.settings, actions);
  else if (route.kind === "topic") page = renderTopic(state.data, state, actions);
  else page = h("div", {}, h("h1", {}, "Not found"), h("p", {}, "There is no page at ", h("code", {}, location.hash), ". ", h("a", { href: "#/" }, "Back to all topics")));
  replaceContent(main, [notices(), accountPanel(state.account, personalActions), savedPosts(), page]);
  updateCompanion();
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  if (keepScroll) window.scrollTo(0, scroll);
  else window.scrollTo(0, 0);
}

function navigate() {
  if (state.contentUnavailable) { render({ keepScroll: false }); return; }
  const route = topicRoute(location.hash, state.data.topic);
  if (route.kind === "topic" && route.post !== null) actions.openPost(route.post);
  else render({ keepScroll: false });
}

async function loadRatings(visible) {
  try {
    const ratings = parseRatingsList(await getJson("api/ratings", "loading ratings"), visible);
    state.ratings = { status: "ready", posts: ratings.posts, mine: ratings.mine, problem: null };
  } catch (error) {
    state.ratings = { status: "error", posts: {}, mine: {}, problem: error.message };
  }
}

async function loadFeedback(restated) {
  if (!state.account.authenticated) { state.feedback = { status: "guest", mine: {}, problem: null }; return; }
  try {
    const feedback = parseFeedbackList(await getJson("api/feedback", "loading your feedback"), restated);
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
  await loadAccount();
  await recordVisit();
  const threads = state.data.topic.threads;
  try { const saved = storageGet("zforum.listening.v1"); if (saved.problem) throw new Error(saved.problem); if (saved.value) player.restore(JSON.parse(saved.value), listeningIdentity()); }
  catch (error) { player.problem = `Could not restore listening: ${error.message}`; }
  player.changed();
  state.thread = threads[0].id;
  for (const thread of threads) state.shown.set(thread.id, POSTS_PER_LOAD);
  window.addEventListener("hashchange", navigate);
  let lastActivity = Date.now();
  for (const event of ["pointerdown", "keydown"]) window.addEventListener(event, () => { if (Date.now() - lastActivity > 60000) { lastActivity = Date.now(); void recordVisit(); } }, { passive: true });
  setInterval(checkContent, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void checkContent(); });
  navigate();
  const visible = threads.flatMap((thread) => thread.posts).filter((post) => !post.hidden);
  await Promise.all([
    loadRatings(new Set(visible.map((post) => post.key))),
    loadFeedback(new Set(visible.filter((post) => post.analysis.neutral_rendition !== null).map((post) => post.key))),
  ]);
  render({ keepScroll: true });
}

start();
