import { h } from "./dom.js";
import { selectionLinks, selectionMarkdown, selectionDocuments, scopeSelection } from "./selection.js";

const FILENAME = "zforum-selected-posts.md";
async function summaryPrompt() {
  const response = await fetch("prompt.md");
  if (!response.ok) throw new Error(`loading the summary prompt failed: HTTP ${response.status}`);
  const prompt = await response.text();
  if (!prompt.trim()) throw new Error("the summary prompt is empty");
  return prompt;
}
function downloadMarkdown(text, filename = FILENAME) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
}
export function selectionBar(view) {
  const count = h("strong", { "aria-live": "polite" });
  const status = h("p", { class: "small", "aria-live": "polite" });
  const files = h("div", { class: "export-parts" });
  const output = h("textarea", { "aria-label": "Export text to copy" });
  output.readOnly = true;
  output.hidden = true;
  const buttons = [];
  let busy = false;
  const updateButtons = () => { for (const button of buttons) button.disabled = busy || view.state.selected.size === 0; };
  const bundle = async (selected, split = false) => {
    const data = view.state.data, base = location.href;
    return (split ? selectionDocuments : selectionMarkdown)(data, selected, base, await summaryPrompt());
  };
  function exportButton(label, prepare, success, download = false, primary = false) {
    const button = h("button", { class: primary ? "chip selection-primary" : "chip", on: { click: async () => {
      const selected = new Set(view.state.selected);
      busy = true; updateButtons(); output.hidden = true; files.replaceChildren(); status.textContent = "Preparing your export…";
      try {
        const text = await prepare(selected);
        if (download) {
          if (text.length === 1 && !text[0].oversized) downloadMarkdown(text[0].text);
          else {
            for (const file of text) files.append(h("button", { class: "chip", on: { click: () => downloadMarkdown(file.text, file.filename) } }, `Download ${file.filename} (${(file.bytes / 1024 / 1024).toFixed(2)} MiB)${file.oversized ? " · exceeds the 2 MiB target; whole posts preserved" : ""}`));
            status.textContent = `Large selection: download all ${text.length} numbered files below in order. Nothing was truncated. Attach all parts to your AI or upload each as a notebook source. Each part repeats its instructions and coverage.`;
            return;
          }
        }
        else {
          output.value = text; output.setAttribute("aria-label", label); output.hidden = false;
          try { await navigator.clipboard.writeText(text); }
          catch (error) { status.textContent = `Clipboard unavailable (${error.message}). Copy the text from the box below. ${success}`; output.focus(); output.select(); return; }
        }
        status.textContent = success;
      } catch (error) { status.textContent = `Export failed: ${error.message}`; }
      finally { busy = false; updateButtons(); }
    } } }, label);
    buttons.push(button);
    return button;
  }
  const listen = h("button", { class: "chip selection-primary", on: { click: () => view.actions.listenSelected(new Set(view.state.selected)) } }, "Listen to selected posts");
  buttons.push(listen);
  const instructions = h("details", { class: "selection-links" }, h("summary", {}, "How to use your export / copy instead"),
    h("p", {}, "One file contains your selected original posts, source links and a pre-written prompt. Attach it to Claude, ChatGPT or your preferred AI for questions and answers. Or upload the same file to NotebookLM to create a podcast exploring the debate. The prompt supports both uses."),
    exportButton("Copy prompt + selected posts", bundle, "Paste into your preferred AI, or save as a source for your notebook."),
    exportButton("Copy post links only", (selected) => selectionLinks(view.state.data.topic, selected, location.href), "Copied links only."));
  const workflows = h("div", { class: "selection-workflows", id: "selection-workflows" },
    h("div", { class: "selection-actions" }, listen,
      exportButton("Export selected posts", (selected) => bundle(selected, true), `Downloaded ${FILENAME}. Use the same file and prompt with your chat AI or NotebookLM.`, true, true)),
    h("p", { class: "small" }, "Export is a convenient way to take exactly your selection into another tool. Large selections offer numbered files; no posts are truncated."), instructions,
    h("p", { class: "muted small" }, "Exports include original text, usernames and source links—even in anonymous mode. Nothing is sent to an AI by zforum. Playback and exports capture your selection when you start."), output, status, files);
  const clear = h("button", { class: "chip", on: { click: () => view.actions.clearSelection() } }, "Clear selection");
  buttons.push(clear);
  const bulk = (label, thread) => h("button", { class: "chip", on: { click: () => view.actions.selectScope(scopeSelection(view.state.data.topic, view.state.selected, thread)) } }, label);
  view.syncSelection = () => { count.textContent = `${view.state.selected.size} selected`;  updateButtons(); if (!busy) { output.hidden = true; status.textContent = ""; } };
  view.syncSelection();
  return h("details", { class: "selection-bar", open: view.state.open.expert, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("selection-bar")) view.actions.setOpen("expert", null, event.target.open); } } },
    h("summary", {}, "Expert user tools · ", count),
    h("p", {}, "Select the posts you want to listen to or export with a pre-written prompt. Choose individual posts, all posts in a thread, or a time window such as the last 24 hours."),
    h("div", { class: "selection-actions" },
      h("button", { class: "chip", "aria-pressed": String(view.state.selecting), on: { click: () => view.actions.setSelecting(!view.state.selecting) } }, view.state.selecting ? "Done selecting" : "Select individual posts"), clear,
      h("button", { class: "chip", disabled: view.cutoff === null, on: { click: () => view.actions.selectScope(new Set([...view.state.selected, ...view.allPosts.filter((post) => !post.hidden && view.news.posts.has(post.key)).map((post) => post.key)])) } }, `Select posts in this time window (${view.allPosts.filter((post) => !post.hidden && view.news.posts.has(post.key)).length})`),
      bulk("Select all in this topic", null)),
    h("div", { class: "selection-actions" }, view.state.data.topic.threads.map((thread) => bulk(`Select thread ${view.letterOf.get(thread.id)} · ${thread.title}`, thread.id))),
    h("p", { class: "small muted" }, "Bulk selection includes collapsed and not-yet-loaded posts, but excludes forum-hidden posts. Changing filters or the time window does not alter your selection."), workflows);
}
