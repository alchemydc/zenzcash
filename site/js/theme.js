import { h } from "./dom.js";

const THEME_KEY = "zforum.theme.v1";

export function themeControl(root, media, read, write) {
  const stored = read(THEME_KEY);
  let preference = stored.value;
  let problem = stored.problem ?? null;
  if (preference !== null && preference !== "light" && preference !== "dark") {
    problem = `Saved theme ${JSON.stringify(preference)} is invalid. Using the system theme.`;
    preference = null;
  }
  const icon = h("span", { "aria-hidden": "true" });
  const button = h("button", { id: "theme-toggle", type: "button", on: { click: () => {
    preference = current() === "dark" ? "light" : "dark";
    problem = write(THEME_KEY, preference);
    update();
  } } }, icon);
  const notice = h("span", { class: "theme-problem", role: "status" });
  const current = () => preference ?? (media.matches ? "dark" : "light");
  function update() {
    const theme = current();
    root.setAttribute("data-theme", theme);
    const action = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
    button.setAttribute("aria-label", action);
    button.setAttribute("title", action);
    icon.textContent = theme === "dark" ? "☀" : "☾";
    notice.textContent = problem ?? "";
    notice.hidden = problem === null;
  }
  media.addEventListener("change", update);
  update();
  return h("div", { class: "theme-control" }, button, notice);
}
