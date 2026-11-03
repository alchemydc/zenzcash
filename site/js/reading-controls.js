import { h } from "./dom.js";
import { greyReasons } from "./logic.js";
import { TONE_BANDS, SUPPORT_BANDS, POST_VERSIONS, READING_VERSIONS, toggleChoice } from "./reader-options.js";
import { filterInfo } from "./filter-info.js";

export function readingControls(view) {
  const { settings } = view.state;
  const set = (patch) => view.actions.setSettings(patch);
  const info = (key, label, text) => filterInfo(key, label, text, view);
  const visible = view.allPosts.filter((post) => !post.hidden);
  const matching = visible.filter((post) => greyReasons(post, settings, view.snapshotAt).length === 0).length;
  const choices = (label, key, options, explanation) => h("fieldset", {}, h("legend", {}, label, info(key, label, explanation)),
    h("button", { class: "chip", id: `setting-${key}-any`, "aria-pressed": String(options.every(({ id }) => settings[key].includes(id))), on: { click: () => set({ [key]: options.map(({ id }) => id) }) } }, "Any"),
    options.map(({ id, label: text }) => h("label", { class: "toggle" }, h("input", { id: `setting-${key}-${id}`, type: "checkbox", checked: settings[key].includes(id), on: { change: () => set({ [key]: toggleChoice(settings[key], id) }) } }), text)));
  const toggle = (label, key, explanation) => h("div", { class: "filter-toggle" }, h("label", { class: "toggle" }, h("input", { id: `setting-${key}`, type: "checkbox", checked: settings[key], on: { change: (event) => set({ [key]: event.target.checked }) } }), label), info(key, label, explanation));
  const ageChanged = (event) => {
    const months = Number(event.target.value);
    const valid = event.target.value !== "" && Number.isInteger(months) && months >= 0 && months <= 1200;
    event.target.setCustomValidity(valid ? "" : "Use whole months from 0 to 1200.");
    if (valid) set({ minAccountMonths: months }); else event.target.reportValidity();
  };
  return h("details", { class: "settings-panel", open: view.state.open.settings, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("settings-panel")) view.actions.setOpen("settings", null, event.target.open); } } },
    h("summary", {}, h("strong", {}, "Reading filters"), h("span", { class: "small" }, ` · ${matching} of ${visible.length} match`)),
    h("p", { class: "small", "aria-live": "polite" }, "Choose any combination. Other posts become compact rows with a Show button. Ratings describe the original text."),
    choices("Tone", "toneBands", TONE_BANDS, "Choose the tone levels you want to read. Bad includes hostile or dismissive language; Moderate is pointed; Good is restrained. A material harsh passage can lower the rating. This describes the original wording, not whether its ideas are right."),
    choices("Level of support for arguments", "supportBands", SUPPORT_BANDS, "Low, Medium and High describe how much reasoning or evidence the author supplies. This is not a fact-check. Posts without an applicable rating remain included. Select several levels, or Any."),
    h("fieldset", { class: "account-age-filter" }, h("legend", {}, "Author’s account age", info("accountAge", "account age", "Set a minimum age in whole calendar months, measured at the displayed content snapshot. Zero includes any known age. Profiles with hidden or unavailable ages are excluded unless you check Include profiles with hidden age. Excluded posts become compact rows with a Show button.")),
      toggle("Include profiles with hidden age", "includeHiddenAge", "Include accounts whose profile age is hidden or unavailable. When unchecked, these accounts are excluded even at Any account age. Other selected filters still apply."),
      h("label", { for: "setting-minAccountMonths" }, settings.minAccountMonths === 0 ? "Any account age" : `At least ${settings.minAccountMonths} months`),
      h("input", { id: "setting-minAccountMonths", type: "range", min: 0, max: Math.max(120, settings.minAccountMonths), step: 1, value: settings.minAccountMonths, on: { input: (event) => { event.target.previousElementSibling.textContent = Number(event.target.value) === 0 ? "Any account age" : `At least ${event.target.value} months`; }, change: ageChanged } }),
      h("label", { class: "small" }, "Exact months ", h("input", { id: "setting-age-months", type: "number", min: 0, max: 1200, step: 1, value: settings.minAccountMonths, "aria-label": "Minimum account age in months", on: { change: ageChanged } }))),
    choices("Posts", "postVersions", POST_VERSIONS, "Choose posts with re-writes, posts without them, or both. A re-write is offered when the analysis identifies wording worth neutralizing. It is not a measure of the post’s value."),
    h("div", { class: "reading-choice" }, h("label", { for: "setting-preferredVersion" }, "Read Neutral Re-writes"), info("preferredVersion", "Read Neutral Re-writes", "Choose which text opens first when you expand a post. You can still switch between Original, Re-write and Changes on each post. Posts without a re-write show the original."), h("select", { id: "setting-preferredVersion", on: { change: (event) => set({ preferredVersion: event.target.value }) } }, READING_VERSIONS.map(({ id, label }) => h("option", { value: id, selected: settings.preferredVersion === id }, label)))),
    h("fieldset", { class: "highlight-settings" }, h("legend", {}, "Highlights and author identities"),
      toggle("Flag disputed assumptions", "flagAssumptions", "Shows notes on assumptions the AI identified as disputed but presented as settled. Expand a post to inspect the passage. This does not hide posts or verify claims."),
      toggle("Show constructive reframing", "showReframing", "Shows notes where the AI identified a useful way to reframe the discussion. These appear inside expanded posts; this does not filter the stream."),
      toggle("Highlight new points and posts", "highlightNew", "Highlights posts and summary points in the selected 1, 3 or 7 days ending at the last forum pull. What’s new counts remain visible when highlighting is off."),
      toggle("Hide author names — reveal one at a time", "anonymous", "Replaces names and mentions with participant numbers to help you focus on ideas. Reveal or hide each post’s author individually. Source links and exports retain attribution."),
      toggle("Show mind-change ratings", "showRatings", "Shows the reader voting controls and aggregate ratings for how a post changed people’s minds. This is separate from AI tone and argument-support ratings.")),
    h("p", { class: "small muted" }, "There is deliberately no author filter. Hearing people we disagree with helps keep the conversation connected, rather than creating separate echo chambers."));
}
