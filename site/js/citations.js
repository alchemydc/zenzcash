import { h } from "./dom.js";
import { toneBand } from "./rubric.js";

export function cites(keys, view) {
  return h("span", { class: "cites" }, keys.map((key) => {
    const post = view.posts.get(key);
    const thread = view.threadOf.get(key);
    const score = post.analysis.dimensions.tone.score;
    return h("button", {
      class: `cite band-${toneBand(score)}`,
      title: `Thread ${view.letterOf.get(thread.id)}: ${thread.title} · #${post.number} · tone ${score === null ? "unassessed" : `${score}/3`} (not argument quality)\n${view.transform(post.analysis.summary)}`,
      on: { click: () => view.actions.openPost(key) },
    }, `${view.letterOf.get(thread.id)}#${post.number}`);
  }));
}
