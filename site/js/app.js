import { loadIndex, loadReceipts, loadThread, readMutes, writeMutes } from "./data.js";
import { h, replaceContent } from "./dom.js";
import { activeMutes, withMute, withoutMute } from "./lens.js";
import { renderAbout } from "./views/about.js";
import { renderCheck } from "./views/check.js";
import { renderHome } from "./views/home.js";
import { renderQuiz } from "./views/quiz.js";
import { renderThread } from "./views/thread.js";

const main = document.getElementById("main");
const mutes = readMutes();
let mutesProblem = mutes.problem ?? null;

// Routes: #/  #/t/<id>[/<lens>][/<post>]  #/t/<id>/quiz  #/check  #/about[/prompts]
function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { view: "home" };
  if (parts[0] === "check") return { view: "check" };
  if (parts[0] === "about") return { view: "about", section: parts[1] ?? null };
  if (parts[0] === "t" && /^\d+$/.test(parts[1] ?? "")) {
    const topicId = Number(parts[1]);
    if (parts[2] === "quiz") return { view: "quiz", topicId };
    const lens = ["digest", "calm", "raw"].includes(parts[2]) ? parts[2] : null;
    const focusPost = /^\d+$/.test(parts[3] ?? "") ? Number(parts[3]) : null;
    return { view: "thread", topicId, lens, focusPost };
  }
  return { view: "missing", hash };
}

function setMutes(next) {
  mutes.stored = next;
  const saved = writeMutes(next);
  mutesProblem = saved.persistent ? null : saved.problem;
  route();
}

async function route() {
  const target = parseRoute(location.hash);
  try {
    const index = await loadIndex();
    let page;
    if (target.view === "home") page = renderHome(index);
    else if (target.view === "check") page = renderCheck({ index, receipts: await loadReceipts() });
    else if (target.view === "about") page = renderAbout({ index, receipts: await loadReceipts(), section: target.section });
    else if (target.view === "quiz" || target.view === "thread") {
      const entry = index.threads.find((thread) => thread.id === target.topicId);
      if (entry === undefined) {
        page = h("div", { class: "card" }, h("h1", {}, "Not in this snapshot"), h("p", {}, `Topic ${target.topicId} was not crawled. `, h("a", { href: "#/" }, "Back to the front page")));
      } else {
        const thread = await loadThread(target.topicId);
        if (target.view === "quiz") {
          page = thread.quiz === null ? h("div", { class: "card" }, h("p", {}, "No quiz for this thread yet.")) : renderQuiz({ thread });
        } else {
          const lens = target.lens ?? (thread.analysis !== null ? "digest" : "calm");
          page = renderThread({
            thread,
            index,
            lens,
            focusPost: target.focusPost,
            muted: activeMutes(mutes.stored, Date.now()),
            handlers: {
              onMute: (author) => setMutes(withMute(mutes.stored, author, Date.now())),
              onUnmute: (author) => setMutes(withoutMute(mutes.stored, author)),
              mutesProblem,
            },
          });
        }
      }
    } else page = h("div", { class: "card" }, h("h1", {}, "Page not found"), h("p", {}, h("a", { href: "#/" }, "Back to the front page")));
    replaceContent(main, [page]);
    document.title = target.view === "home" ? "zforum" : `${document.querySelector("h1")?.textContent ?? "zforum"} · zforum`;
    if (target.view === "thread" && target.focusPost !== null) {
      const focused = document.getElementById(`post-${target.focusPost}`);
      if (focused !== null) focused.scrollIntoView({ block: "start" });
      else main.prepend(h("p", { class: "notice" }, `Post #${target.focusPost} is not in this view (deleted on the forum, or outside the fetched range).`));
    } else if (target.view !== "about") {
      window.scrollTo(0, 0);
    }
  } catch (error) {
    replaceContent(main, [h("div", { class: "card error" }, h("h1", {}, "Something is broken"), h("pre", {}, String(error.stack ?? error)))]);
    throw error;
  }
}

window.addEventListener("hashchange", route);
route();
