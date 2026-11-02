import { h } from "./dom.js";

// Hover/focus previews the explanation; clicking pins it across page redraws.
export function filterInfo(key, label, text, view) {
  const id = `info-${key}`;
  const pinned = view.state.open.infos.has(key);
  let wrapper;
  const set = (open) => {
    view.actions.setOpen("infos", key, open);
    wrapper.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  const button = h("button", { id: `${id}-button`, type: "button", class: "info-button", "aria-label": `About ${label}`, "aria-controls": id, "aria-expanded": String(pinned), on: {
    click: () => { wrapper.classList.remove("is-dismissed"); set(!view.state.open.infos.has(key)); },
    keydown: (event) => { if (event.key === "Escape") { set(false); wrapper.classList.add("is-dismissed"); event.stopPropagation(); } },
  } }, "i");
  wrapper = h("span", { class: `filter-info${pinned ? " is-open" : ""}`, on: { mouseleave: () => wrapper.classList.remove("is-dismissed"), focusout: () => wrapper.classList.remove("is-dismissed") } }, button,
    h("span", { id, class: "info-text" }, text));
  return wrapper;
}
