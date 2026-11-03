// Entry point: loads the site data, keeps the reader's state, talks to the ratings and
// feedback API, and routes between the home board (#/) and the topic page (#/topic/zcg).

import { replaceContent, h } from "./dom.js";
import { themeControl } from "./theme.js";
import { renderTopics } from "./home.js";
import { parseCuration } from "./topic-directory.js";
import { renderHome, renderHowToUse } from "./info-pages.js";
import { DEFAULT_SETTINGS, isUnanswered, migrateSettings, orderedPosts, noAnswers, parseAnswers, parseFeedbackList, parsePostRatings, parseRatingsList, POSTS_PER_LOAD, shownToReach } from "./logic.js";
import { postElementId } from "./post.js";
import { renderTopic, THREAD_TABS_ID } from "./topic.js";
import { postRoute } from "./selection.js";
import { parseCatalog, catalogRoute, catalogRevision } from "./catalog.js";
import { SpeechPlayer, postQueue, overviewQueue } from "./speech.js";
import { playerView } from "./player-view.js";
import { accountPanel, accountOriginLink, companionView, guestVisit, parsePersonal } from "./personal.js";
import { passkeyRequest } from "./passkey-request.js";

const SETTINGS_KEY = "zforum.design.settings.v7";
const LAST_VISIT_KEY = "zforum.visit.v2";
const DEVICE_KEY = "zforum.device.v1";

replaceContent(document.getElementById("theme-control"), themeControl(
  document.documentElement, window.matchMedia("(prefers-color-scheme: dark)"), storageGet, storageSet,
));

const main = document.getElementById("main");
// Hash navigation is rendered here, so browser history must not also restore scroll.
history.scrollRestoration = "manual";
let renderedHash = null;
let directoryPosition = { x: 0, y: 0, focusedId: "" };
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
    return { value: null, problem: `This browser won't let Zenzcash remember things (${error.message}).` };
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return null;
  } catch (error) {
    return `This browser won't let Zenzcash remember things (${error.message}).`;
  }
}

function loadSettings() {
  let stored = storageGet(SETTINGS_KEY);
  if (stored.problem) return { settings: { ...DEFAULT_SETTINGS }, problem: stored.problem };
  for (const key of ["zforum.design.settings.v6", "zforum.design.settings.v5", "zforum.design.settings.v4"]) {
    if (stored.value !== null) break;
    stored = storageGet(key);
    if (stored.problem) return { settings: { ...DEFAULT_SETTINGS }, problem: stored.problem };
  }
  if (stored.value === null) return { settings: { ...DEFAULT_SETTINGS }, problem: null };
  try {
    return { settings: migrateSettings(JSON.parse(stored.value)), problem: null };
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
  const response = await fetch("data/topics.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`loading topic catalog failed: HTTP ${response.status}`);
  return parseCatalog(await response.json());
}

async function apiError(response, action) {
  return new Error(`${action} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
}

async function getJson(path, action) {
  const response = await fetch(path);
  if (!response.ok) throw await apiError(response, action);
  return response.json();
}

async function putJson(path, body, action, method = "PUT", signal) {
  const response = await fetch(path, { method, signal, headers: { "Content-Type": "application/json", "X-Zforum-Request": "1", "X-CSRF-Token": state.account.csrf ?? "" }, body: JSON.stringify(body) });
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
  catalog: { topics: [], unavailable: [] },
  curation: null,
  directory: { query: "", sort: "recent" },
  data: null,
  contentUnavailable: false,
  settings: settingsLoad.settings,
  settingsProblem: settingsLoad.problem,
  lastVisit: null,
  reader: { problem: null },
  account: { authenticated: false, personal: null, csrf: null, auth_available: false, auth_problem: null, sign_in_url: null, sign_in_reason: null, sign_in_return: null, open: false, recovery_codes: null, problem: null },
  revealed: new Set(),
  shownFiltered: new Set(),
  open: { settings: window.matchMedia("(min-width: 1051px)").matches, summary: false, expert: false, newPoints: false, infos: new Set(), flags: false, marks: new Set(), questions: new Set(), arguments: new Set() },
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
  openAccount(reason = "choose your Zamagotchi") {
    state.account.sign_in_reason = state.account.authenticated ? null : reason;
    if (location.hash !== "#/profile") state.account.sign_in_return = location.hash;
    location.hash = "#/profile";
  },
  setDirectory(patch) { state.directory = { ...state.directory, ...patch }; render({ keepScroll: true }); },
  listenSelected(selected) { if (!state.contentUnavailable) player.start(postQueue(state.data, selected, listeningVersion, state.settings.anonymous), listeningIdentity()); },
  listenPost(key) { actions.listenSelected(new Set([key])); },
  listenOverview() { if (!state.contentUnavailable) player.start(overviewQueue(state.data, state.settings.anonymous), listeningIdentity()); },
  selectScope(selected) { state.selected = selected; state.selecting = true; render({ keepScroll: true }); },
  setSettings(patch) {
    if (patch.anonymous !== undefined && patch.anonymous !== state.settings.anonymous) { player.pause(); player.queue = []; player.identity = null; player.notify(); }
    state.settings = { ...state.settings, ...patch };
    state.shownFiltered.clear();
    if (patch.preferredVersion !== undefined) state.versions.clear();
    const problem = storageSet(SETTINGS_KEY, JSON.stringify(state.settings));
    if (problem !== null) state.settingsProblem = `${problem} Settings last for this page view only.`;
    if (state.account.authenticated) inOrder("preferences", () => putJson("api/account/preferences", state.settings, "saving filters")).catch((error) => { state.account.problem = error.message; render({ keepScroll: true }); });
    render({ keepScroll: true });
  },
  reveal(key) {
    if (state.revealed.has(key)) state.revealed.delete(key); else state.revealed.add(key);
  },
  showFiltered(key) { state.shownFiltered.add(key); render({ keepScroll: true }); },
  setOpen(kind, key, open) {
    if (["settings", "summary", "flags", "expert", "newPoints"].includes(kind)) state.open[kind] = open;
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
  expandAll() {
    for (const post of orderedPosts(state.data.topic, state.settings, state.thread)) if (!post.hidden) state.expanded.add(post.key);
    render({ keepScroll: true });
    document.getElementById("expand-all").focus();
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
    actions.setSettings({ threadView: "thread" });
    const tabs = document.getElementById(THREAD_TABS_ID);
    if (tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: "start" });
  },
  showMore(threadId) {
    state.shown.set(threadId, (state.shown.get(threadId) ?? POSTS_PER_LOAD) + POSTS_PER_LOAD);
  },
  // Opens a cited post in its thread's tab with its original showing, scrolls to it, and
  // highlights it.
  openPost(key) {
    const thread = threadOfPost(key);
    state.thread = thread.id;
    const stream = state.settings.threadView === "all" ? "all" : thread.id;
    state.shown.set(stream, shownToReach(orderedPosts(state.data.topic, state.settings, thread.id).findIndex((post) => post.key === key), state.shown.get(stream) ?? POSTS_PER_LOAD));
    state.shownFiltered.add(key);
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
  async giveFeedback(key, patch) {
    const rendition = threadOfPost(key).posts.find((post) => post.key === key).rendition_version;
    try {
      await inOrder("personal-feedback", async () => {
        const before = state.feedback.mine[key] ?? noAnswers();
        const answers = { ...before, ...patch };
        const result = await putJson(apiPath("feedback", key), { rendition, ...answers }, "saving your feedback");
        const stored = result.mine === null ? noAnswers() : parseAnswers(result.mine, "feedback.mine");
        if (JSON.stringify(stored) !== JSON.stringify(answers)) throw new Error(`the server stored ${JSON.stringify(stored)} for ${key}, but ${JSON.stringify(answers)} was sent`);
        if (isUnanswered(stored)) delete state.feedback.mine[key]; else state.feedback.mine[key] = stored;
        state.account.personal.progress = result.progress;
        updateCompanion();
        if (Object.keys(answers).some((id) => answers[id] !== before[id] && answers[id] !== null && answers[id] !== 0)) animateCompanion();
      });
    } catch (error) {
      state.feedback = { ...state.feedback, status: "error", problem: error.message }; render({ keepScroll: true });
    }
  },
  async setMood(key, score) {
    try {
      const before = state.account.personal.moods[key] ?? null;
      state.account.personal = parsePersonal(await inOrder("personal-feedback", () => putJson(`api/account/mood/${key}`, { score }, "saving mood reaction")));
      updateCompanion();
      if (score !== before && score !== null && score !== 0) animateCompanion();
    } catch (error) { state.reader.problem = error.message; render({ keepScroll: true }); }
  },
};

async function loadAccount() {
  try {
    const account = await getJson("api/me", "loading your account");
    if (typeof account.authenticated !== "boolean" || typeof account.auth_available !== "boolean") throw new Error("Invalid account response");
    Object.assign(state.account, account, { sign_in_url: accountOriginLink(account.auth_origin, location.origin), csrf: account.authenticated ? account.csrf : null, personal: account.authenticated ? parsePersonal(account.personal) : null });
    if (state.account.personal?.preferences !== null && state.account.personal !== null) state.settings = state.account.personal.preferences;
  } catch (error) { Object.assign(state.account, { authenticated: false, csrf: null, personal: null, problem: error.message }); }
}
async function recordVisit() {
  try {
    state.lastVisit = state.account.authenticated ? (await putJson("api/account/visit", { device: deviceId() }, "recording this visit", "POST")).cutoff : loadLastVisit();
  } catch (error) { state.account.problem = error.message; }
}
function updateCompanion() { replaceContent(companion, companionView(state.account.personal, () => actions.openAccount())); }
function animateCompanion() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  companion.querySelector(".companion-creature")?.animate([{ rotate: "0deg", translate: "0 0" }, { rotate: "-12deg", translate: "0 -4px" }, { rotate: "12deg", translate: "0 -4px" }, { rotate: "-8deg", translate: "0 0" }, { rotate: "0deg", translate: "0 0" }], { duration: 650 });
}
function savedPosts() {
  if (!state.account.personal) return null;
  const selected = Object.entries(state.account.personal.reading).filter(([,entry]) => entry.bookmarked);
  return h("section", { class: "saved-posts card" }, h("h1", {}, `Saved posts (${selected.length})`),
    selected.length ? h("ul", {}, selected.map(([key]) => {
      const data = state.catalog.topics.find((data) => data.topic.threads.some((thread) => thread.posts.some((post) => post.key === key)));
      const post = data?.topic.threads.flatMap((thread) => thread.posts).find((post) => post.key === key);
      return h("li", {}, post && !post.hidden ? h("a", { href: postRoute(data.topic.id, key) }, `${key} · ${data.visibility_pending?"Original post":post.analysis.summary}`) : `${key} · unavailable`,
        h("button", { class: "chip", on: { click: () => actions.setReading(key, { bookmarked: false }) } }, "Remove bookmark"));
    })) : h("p", {}, "Use Save post on any available post."));
}
function saveCodes() {
  const text = `Zenzcash recovery codes for ${location.origin}\nEach code works once. Keep these private.\n\n${state.account.recovery_codes.join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "zenzcash-recovery-codes.txt"; document.body.append(link);
  try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
}
const passkeys = passkeyRequest({
  start: (mode, code, signal) => putJson("api/auth/start", { mode, code }, "starting passkey verification", "POST", signal),
  finish: (credential) => putJson("api/auth/finish", { credential }, "verifying passkey", "POST"),
  credentials: navigator.credentials,
  changed: () => render({ keepScroll: true }),
  async completed(result) {
    state.account.csrf = result.csrf;
    state.account.recovery_codes = result.recovery_codes;
    state.account.problem = null;
    location.hash = "#/profile";
    // Show one-time codes before any secondary account/feedback network requests.
    render({ keepScroll: false });
    await loadAccount();
    render({ keepScroll: false });
    await Promise.all([recordVisit(), refreshAnswers()]);
  },
});
const personalActions = {
  authenticate: (mode, code = null) => passkeys.run(mode, code),
  recover: (code) => passkeys.recover(code),
  cancelAuthentication: () => passkeys.cancel(),
  async control(action) {
    const result = await putJson("api/account/control", { action }, "updating account", "POST");
    if (result.recovery_codes) { state.account.recovery_codes = result.recovery_codes; render({ keepScroll: false }); }
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
  const visible = state.catalog.topics.flatMap((data) => data.topic.threads.flatMap((thread) => thread.posts)).filter((post) => !post.hidden);
  await Promise.all([loadRatings(new Set(visible.map((post) => post.key))), loadFeedback(new Set(visible.filter((post) => post.analysis!==null&&post.analysis.neutral_rendition !== null).map((post) => post.key)))]);
}
async function checkContent() {
  try {
    const catalog = await loadData();
    if (catalogRevision(catalog) !== catalogRevision(state.catalog)) {
      state.contentUnavailable = true;
      player.pause(); player.queue = []; player.identity = null; player.notify(); state.selected.clear();
      replaceContent(main, h("p", { class: "notice" }, "Content changed. Reloading the current topic…"));
      location.reload();
      return;
    }
    const previousId = state.data?.topic.id;
    state.catalog = catalog;
    state.data = catalog.topics.find((data) => data.topic.id === previousId) ?? null;
    render({ keepScroll: true });
  } catch (error) { state.settingsProblem = error.message; }
}

function notices() {
  return state.settingsProblem ? h("p", { class: "notice" }, state.settingsProblem) : null;
}

function render({ keepScroll }) {
  const samePage = renderedHash === location.hash;
  const preserve = keepScroll && samePage;
  const scroll = { x: window.scrollX, y: window.scrollY };
  const panelScroll = preserve ? document.querySelector(".settings-panel")?.scrollTop : undefined;
  const focused = document.activeElement;
  if (renderedHash === "#/topics" && !samePage) {
    directoryPosition = { ...scroll, focusedId: focused.closest(".topic-card")?.id ?? "" };
  }
  const returningToDirectory = !samePage && location.hash === "#/topics";
  const focusedId = preserve ? focused.id : returningToDirectory ? directoryPosition.focusedId : "";
  const selection = focusedId === "topic-search" ? [focused.selectionStart, focused.selectionEnd] : null;
  const route = catalogRoute(location.hash, state.catalog);
  let page;
  if (route.kind === "home") page = renderHome();
  else if (route.kind === "topics") page = renderTopics(state.catalog, state.settings, actions, state.curation, state.directory);
  else if (route.kind === "how-to-use") page = renderHowToUse();
  else if (route.kind === "profile") page = accountPanel(state.account, personalActions, passkeys.state);
  else if (route.kind === "saved") page = savedPosts() ?? accountPanel(state.account, personalActions, passkeys.state);
  else if (route.kind === "topic") page = renderTopic(state.data, state, actions);
  else if (route.kind === "unavailable") page = h("p", { class: "notice" }, "This topic is temporarily unavailable while forum visibility changes are reviewed. ", h("a", {href:"#/"}, "Back to all topics"));
  else page = h("div", {}, h("h1", {}, "Not found"), h("p", {}, "There is no page at ", h("code", {}, location.hash), ". ", h("a", { href: "#/" }, "Back to all topics")));
  replaceContent(main, [notices(), state.account.problem && route.kind !== "profile" ? h("p", { class: "notice" }, state.account.problem) : null, page]);
  const nav = [["#/", "Home"], ["#/topics", "Topics"], ["#/how-to-use", "How to use"], ...(state.account.authenticated ? [["#/profile", "Profile"], ["#/saved", "Saved Posts"]] : [["#/profile", "Sign in"]])];
  replaceContent(document.getElementById("site-nav"), [nav.map(([href, label]) => h("a", { href, class: location.hash === href ? "current" : "" }, label)), state.account.authenticated ? h("button", { id: "header-logout", class: "linkish", disabled: passkeys.state.phase !== "idle", on: { click: () => personalActions.control("logout").catch((error) => { state.account.problem = error.message; render({ keepScroll: true }); }) } }, "Log out") : null]);
  updateCompanion();
  if (panelScroll !== undefined) document.querySelector(".settings-panel").scrollTop = panelScroll;
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  if (selection) document.getElementById(focusedId)?.setSelectionRange(...selection);
  const position = preserve ? scroll : returningToDirectory ? directoryPosition : { x: 0, y: 0 };
  window.scrollTo(position.x, position.y);
  renderedHash = location.hash;
}

function navigate() {
  passkeys.cancel();
  const route = catalogRoute(location.hash, state.catalog);
  state.contentUnavailable = route.kind === "unavailable";
  if (route.kind === "topic" && state.data?.topic.id !== route.data.topic.id) {
    player.pause(); player.queue = []; player.identity = null; player.notify();
    state.data = route.data;
    state.thread = state.data.topic.threads[0].id;
    state.shown = new Map(state.data.topic.threads.map((thread) => [thread.id, POSTS_PER_LOAD]));
    state.shownFiltered.clear(); state.selected.clear(); state.selecting = false; state.expanded.clear(); state.revealed.clear(); state.versions.clear(); state.flash = null;
    state.open = { settings: window.matchMedia("(min-width: 1051px)").matches, summary: false, expert: false, newPoints: false, infos: new Set(), flags: false, marks: new Set(), questions: new Set(), arguments: new Set() };
  }
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
    const [catalog, curation] = await Promise.all([loadData(), getJson("topic-curation.json", "loading topic curation")]);
    state.catalog = catalog;
    state.curation = parseCuration(curation);
    const route = catalogRoute(location.hash, state.catalog);
    state.data = route.kind === "topic" ? route.data : state.catalog.topics[0] ?? null;
  } catch (error) {
    replaceContent(main, h("p", { class: "notice" }, `Zenzcash could not load its data: ${error.message}`));
    throw error;
  }
  await loadAccount();
  await recordVisit();
  const threads = state.data === null ? [] : state.data.topic.threads;
  try { const saved = storageGet("zforum.listening.v1"); if (saved.problem) throw new Error(saved.problem); if (saved.value && state.data !== null) player.restore(JSON.parse(saved.value), listeningIdentity()); }
  catch (error) { player.problem = `Could not restore listening: ${error.message}`; }
  player.changed();
  state.thread = threads.length ? threads[0].id : null;
  for (const thread of threads) state.shown.set(thread.id, POSTS_PER_LOAD);
  window.addEventListener("hashchange", navigate);
  let lastActivity = Date.now();
  for (const event of ["pointerdown", "keydown"]) window.addEventListener(event, () => { if (Date.now() - lastActivity > 60000) { lastActivity = Date.now(); void recordVisit(); } }, { passive: true });
  setInterval(checkContent, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void checkContent(); });
  navigate();
  await refreshAnswers();
  render({ keepScroll: true });
}

start();
