import { h } from "./dom.js";
import { greyReasons } from "./logic.js";
import { TONE_BANDS, SUPPORT_BANDS, AGE_BANDS, POST_VERSIONS, READING_VERSIONS, toggleChoice } from "./reader-options.js";

export function readingControls(view) {
  const { settings } = view.state;
  const set = (patch) => view.actions.setSettings(patch);
  const visible = view.allPosts.filter((post) => !post.hidden);
  const matching = visible.filter((post) => greyReasons(post, settings, view.snapshotAt).length === 0).length;
  const choices = (label, key, options) => h("fieldset", {}, h("legend", {}, label),
    h("button", { class: "chip", id: `setting-${key}-any`, "aria-pressed": String(options.every(({ id }) => settings[key].includes(id))), on: { click: () => set({ [key]: options.map(({ id }) => id) }) } }, "Any"),
    options.map(({ id, label: text }) => h("label", { class: "toggle" }, h("input", { id: `setting-${key}-${id}`, type: "checkbox", checked: settings[key].includes(id), on: { change: () => set({ [key]: toggleChoice(settings[key], id) }) } }), text)));
  const toggle = (label, key) => h("label", { class: "toggle" }, h("input", { id: `setting-${key}`, type: "checkbox", checked: settings[key], on: { change: (event) => set({ [key]: event.target.checked }) } }), label);
  const range = (label, key) => h("label", {}, label, h("input", { id: `setting-age-${key}`, type: "number", min: 0, max: 1200, step: 1, value: settings.customAge[key] ?? "", "aria-label": label, on: { change: (event) => {
    const number = event.target.value === "" && key === "max" ? null : Number(event.target.value);
    const value = { ...settings.customAge, [key]: number };
    const valid = Number.isInteger(value.min) && value.min >= 0 && value.min <= 1200 && (value.max === null || (Number.isInteger(value.max) && value.max > value.min && value.max <= 1200));
    event.target.setCustomValidity(valid ? "" : "Use whole months from 0 to 1200, with the upper limit greater than the lower limit.");
    if (valid) set({ customAge: value }); else event.target.reportValidity();
  } } }));
  return h("details", { class: "settings-panel", open: view.state.open.settings, on: { toggle: (event) => { if (event.target.isConnected && event.target.classList.contains("settings-panel")) view.actions.setOpen("settings", null, event.target.open); } } },
    h("summary", {}, h("strong", {}, "Reading filters"), h("span", { class: "small" }, ` · ${matching} of ${visible.length} match`)),
    h("p", { class: "small", "aria-live": "polite" }, "Choose any combination. Other posts become compact rows with a Show button. Ratings describe the original text."),
    choices("Tone", "toneBands", TONE_BANDS), choices("Level of support for arguments", "supportBands", SUPPORT_BANDS),
    choices("Author’s account age", "ageBands", AGE_BANDS),
    h("label", { class: "toggle" }, h("input", { id: "setting-ageBands-custom", type: "checkbox", checked: settings.ageBands.includes("custom"), on: { change: () => set({ ageBands: toggleChoice(settings.ageBands, "custom") }) } }), "Custom age range"),
    settings.ageBands.includes("custom") ? h("div", { class: "age-range" }, range("At least (months)", "min"), range("Under (months; blank = no limit)", "max")) : null,
    h("p", { class: "small muted" }, "Unknown account ages are included."),
    choices("Posts", "postVersions", POST_VERSIONS),
    h("label", { class: "reading-choice" }, "Read Neutral Re-writes", h("select", { id: "setting-preferredVersion", on: { change: (event) => set({ preferredVersion: event.target.value }) } }, READING_VERSIONS.map(({ id, label }) => h("option", { value: id, selected: settings.preferredVersion === id }, label)))),
    h("details", {}, h("summary", {}, "Highlights and author identities"), toggle("Flag disputed assumptions", "flagAssumptions"), toggle("Show constructive reframing", "showReframing"), toggle("Highlight new points and posts", "highlightNew"), toggle("Hide author names — reveal one at a time", "anonymous"), toggle("Show mind-change ratings", "showRatings")),
    h("p", { class: "small muted" }, "There is deliberately no author filter. Hearing people we disagree with helps keep the conversation connected, rather than creating separate echo chambers."));
}
