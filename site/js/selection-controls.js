import { h } from "./dom.js";
import { selectionLinks, selectionMarkdown } from "./selection.js";

const FILENAME = "zforum-selected-posts.md";

async function summaryPrompt() {
  const response = await fetch("prompt.md");
  if (!response.ok) throw new Error(`loading the summary prompt failed: HTTP ${response.status}`);
  const prompt = await response.text();
  if (!prompt.trim()) throw new Error("the summary prompt is empty");
  return prompt;
}

function downloadMarkdown(text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = FILENAME;
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
  const output = h("textarea", { "aria-label": "Export text to copy" });
  output.readOnly = true;
  output.hidden = true;
  let busy = false;
  let revision = 0;
  const buttons = [];
  const bundle = async (selected) => selectionMarkdown(view.state.data, selected, location.href, await summaryPrompt());
  const updateButtons = () => {
    for (const button of buttons) button.disabled = busy || view.state.selected.size === 0;
  };
  function exportButton(label, prepare, success, download = false) {
    const button = h("button", { class: "chip", on: { click: async () => {
      const selected = new Set(view.state.selected);
      const started = revision;
      busy = true;
      updateButtons();
      output.hidden = true;
      status.textContent = "Preparing your export…";
      try {
        const text = await prepare(selected);
        if (revision !== started) throw new Error("the selection changed while preparing the export; try again");
        if (download) downloadMarkdown(text);
        else {
          output.value = text;
          output.setAttribute("aria-label", label);
          output.hidden = false;
          try {
            await navigator.clipboard.writeText(text);
          } catch (error) {
            status.textContent = `Clipboard unavailable (${error.message}). Copy the text from the box below. ${success}`;
            output.focus();
            output.select();
            return;
          }
        }
        status.textContent = success;
      } catch (error) {
        status.textContent = `Export failed: ${error.message}`;
      } finally {
        busy = false;
        updateButtons();
      }
    } } }, label);
    buttons.push(button);
    return button;
  }
  const chat = h("div", { class: "selection-destination" },
    h("h4", {}, "Your chat AI"),
    h("p", {}, "Copy the prompt and original posts together, then paste into a new AI chat and send. The prompt asks for a concise, cited summary of the disagreements."),
    exportButton("Copy prompt + posts for chat AI", bundle, "Paste the prompt and posts into your AI chat and send."),
    h("p", { class: "small" }, "Prefer an attachment? Download the same bundle, attach it, and ask your AI to follow the summary instructions in the file."),
    exportButton("Download file for chat AI", bundle, `Attach ${FILENAME} to your AI chat and ask it to follow the summary instructions in the file.`, true));
  const notebook = h("div", { class: "selection-destination" },
    h("h4", {}, "NotebookLM"),
    h("p", {}, "1. Download the file and upload it as a source in a new notebook. It contains the prompt and original posts together."),
    exportButton("Download file for NotebookLM", bundle, `Upload ${FILENAME} as a NotebookLM source. Then copy the summary request below into its chat.`, true),
    h("p", {}, "2. Copy the summary request below, paste it into NotebookLM’s chat, and send. Uploading the file alone does not run this request."),
    exportButton("Copy summary request for NotebookLM", summaryPrompt, "Paste this summary request into NotebookLM’s chat after uploading the selected-posts file."));
  const workflows = h("div", { class: "selection-workflows", id: "selection-workflows" },
    h("p", { class: "selection-hint" }, "2. Choose where you’ll summarize your selection. Both options use the same prompt and original posts."),
    h("div", { class: "selection-destinations" }, chat, notebook),
    h("details", { class: "selection-links" }, h("summary", {}, "Only need links?"),
      h("p", { class: "small" }, "These are website links only, without the prompt or post text. An AI may not be able to open them; use the options above for a summary."),
      exportButton("Copy post links only", (selected) => selectionLinks(view.state.data.topic, selected, location.href), "These are post links only; no prompt or post text is included.")),
    h("p", { class: "muted small" }, "The bundle includes original text, usernames and source links—even in anonymous mode. zforum sends nothing to an AI; you choose what to paste or upload."),
    output, status);
  const clear = h("button", { class: "chip", on: { click: () => view.actions.clearSelection() } }, "Clear selection");
  buttons.push(clear);
  view.syncSelection = () => {
    revision++;
    count.textContent = `${view.state.selected.size} selected`;
    workflows.hidden = !view.state.selecting && view.state.selected.size === 0;
    updateButtons();
    output.hidden = true;
    status.textContent = "";
  };
  view.syncSelection();
  return h("section", { class: "selection-bar", "aria-label": "Summarize posts with your AI" },
    h("h3", {}, "Summarize posts with your AI"),
    h("p", {}, "Choose the posts you care about and take a ready-to-use summary prompt plus their full text to your chat AI or NotebookLM."),
    h("p", { class: "selection-hint" }, "1. Select posts, then check the boxes beside them. You can switch thread tabs and keep selecting."),
    h("div", { class: "selection-actions" },
      h("button", { class: "chip", "aria-pressed": String(view.state.selecting), "aria-controls": "selection-workflows", on: { click: () => view.actions.setSelecting(!view.state.selecting) } }, view.state.selecting ? "Done selecting" : "Select posts"),
      count, clear),
    workflows);
}
