import { h } from "./dom.js";
import { selectionLinks, selectionMarkdown } from "./selection.js";

async function downloadSelection(view) {
  const selected = new Set(view.state.selected);
  const response = await fetch("prompt.md");
  if (!response.ok) throw new Error(`loading the summary prompt failed: HTTP ${response.status}`);
  const text = selectionMarkdown(view.state.data, selected, location.href, await response.text());
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zforum-selected-posts.md";
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function selectionBar(view) {
  const count = h("strong", { "aria-live": "polite" });
  const status = h("p", { class: "small", "aria-live": "polite" });
  const links = h("textarea", { "aria-label": "Selected post links" });
  links.readOnly = true;
  links.hidden = true;
  const download = h("button", { class: "chip", on: { click: async () => {
    download.disabled = true;
    status.textContent = "Preparing your file…";
    try {
      await downloadSelection(view);
      status.textContent = "Your file is ready. Attach zforum-selected-posts.md to your AI conversation.";
    } catch (error) {
      status.textContent = `Export failed: ${error.message}`;
    } finally {
      download.disabled = view.state.selected.size === 0;
    }
  } } }, "Download prompt + posts");
  const copy = h("button", { class: "chip", on: { click: async () => {
    links.value = selectionLinks(view.state.data.topic, view.state.selected, location.href);
    links.hidden = false;
    try {
      await navigator.clipboard.writeText(links.value);
      status.textContent = "Selected post links copied.";
    } catch (error) {
      status.textContent = `Clipboard unavailable (${error.message}). Copy the links from the box below.`;
      links.focus();
      links.select();
    }
  } } }, "Copy links");
  const clear = h("button", { class: "chip", on: { click: () => view.actions.clearSelection() } }, "Clear selection");
  view.syncSelection = () => {
    count.textContent = `${view.state.selected.size} selected`;
    download.disabled = copy.disabled = clear.disabled = view.state.selected.size === 0;
    links.hidden = true;
    status.textContent = "";
  };
  view.syncSelection();
  return h("section", { class: "selection-bar", "aria-label": "Summarize selected posts with your own AI" },
    h("div", { class: "selection-actions" },
      h("button", { class: "chip", "aria-pressed": String(view.state.selecting), on: { click: () => view.actions.setSelecting(!view.state.selecting) } }, view.state.selecting ? "Done selecting" : "Select posts"),
      count, download, copy, clear),
    h("p", { class: "muted small" }, "Select posts across thread tabs, then download one file to give your own AI. It contains the summary prompt, original text, usernames and source links—even in anonymous mode. Nothing is sent to an AI by zforum."),
    links, status);
}
