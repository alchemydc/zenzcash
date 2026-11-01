import { h } from "./dom.js";
import { plainText } from "./markdown.js";
import { maturityBand } from "./vocab.js";

export function cites(keys, view) {
  return h("span", { class: "cites" }, keys.map((key) => {
    const post = view.posts.get(key);
    const thread = view.threadOf.get(key);
    const excerpt = plainText(post.clean ?? post.own_text).slice(0, 140);
    return h("button", {
      class: `cite band-${maturityBand(post.maturity)}`,
      title: `Thread ${view.letterOf.get(thread.id)}: ${thread.title} · #${post.number} · maturity ${post.maturity}/10\n${excerpt}…`,
      on: { click: () => view.actions.openPost(key) },
    }, `${view.letterOf.get(thread.id)}#${post.number}`);
  }));
}
