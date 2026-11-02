import { h } from "./dom.js";
export function renderHome() {
  return h("div", { class: "info-page" },
    h("section", { class: "hero" }, h("p", { class: "eyebrow" }, "The Zcash forum, calmly"), h("h1", {}, "Follow the ideas. Find room to think."),
      h("p", { class: "lede" }, "zforum helps you catch up on busy forum discussions, understand different perspectives, and read difficult exchanges with a little more distance."),
      h("a", { class: "chip primary-link", href: "#/topics" }, "Explore topics →")),
    h("section", { class: "card" }, h("h2", {}, "Why we built this"),
      h("p", {}, "People want to participate in important conversations. But on hot topics, the number of posts quickly becomes impossible to follow. Arguments repeat, the temperature rises, and communication between groups deteriorates as people lose track of what others are saying."),
      h("p", {}, "We built zforum to make those conversations easier to enter and follow. Topic summaries offer a starting point. Neutral re-writes aim to remove inflammatory tone while preserving the author’s meaning. Original posts and source links remain available so you can judge for yourself."),
      h("p", {}, "The aim is understanding, not manufactured agreement. We deliberately avoid author-blocking filters: a shared conversation works better when people can encounter ideas they might otherwise miss."),
      h("p", {}, "The original idea came out of workshops held at Zcon 7 in Cancun in October 2026. We identified a shared problem: people wanted to participate in the forum but found it overwhelming in both volume and temperature.")),
    h("section", {}, h("h2", {}, "Read your way"), h("p", {}, "Catch up with a summary, read individual posts, listen, or export a selection to explore in your own AI. Sign in with a passkey to save posts, remember your filters, and choose a Zamagotchi."), h("a", { href: "#/how-to-use" }, "See how to use zforum →")));
}
export function renderHowToUse() {
  const item = (title, body) => h("section", { class: "card" }, h("h2", {}, title), h("p", {}, body));
  return h("div", { class: "info-page" }, h("h1", {}, "How to use zforum"),
    item("Too much to catch up on?", "Choose a topic and start with What’s new or the Topic summary. Each topic lists the forum threads it includes. Explore a question for more detail, or go straight to individual posts. They start collapsed with a short summary; Expand post opens the text."),
    item("Find inflammatory posts hard to read?", "In Read Neutral Re-writes, choose Show me the re-write first. Where a re-write is available, it aims to strip out negative tone while keeping the substance. Original and Changes let you inspect it. AI can miss nuance; check the original when it matters."),
    item("Want a different view of the discussion?", "Choose multiple tone or argument-support levels, or set a minimum account age in whole months in Reading filters. Nonmatching posts become compact rows with a Show button. Switch between all threads together and individual threads, and between newest and oldest first. Hide author names to focus on ideas; reveal and hide each author as you choose."),
    item("Want to remember a post?", "Sign in and use the bookmark icon to save it. Saved Posts in the header brings you back to your bookmarks. Mark read dims posts you’ve finished; Mark unread reverses that. Opening a post does not mark it read. Your filters are saved to your account."),
    item("Prefer listening?", "Choose Listen to the overview, the speaker on a post, or Listen to selected posts in Expert user tools. The player lets you choose originals or re-writes and change playback speed. Speech uses your browser or device; available voices and background playback vary."),
    h("section", { class: "card" }, h("h2", {}, "Take selected posts into your own AI"),
      h("p", {}, "zforum provides a convenient way to export exactly the posts you select, together with a pre-written prompt. For example, select posts from the 1 day ending at the last forum pull, all posts in a forum thread, or individual posts across threads."),
      h("ol", {}, h("li", {}, "Open Expert user tools on the topic. Choose a time window in What’s new and click Select posts in this time window, select a whole thread, or check individual posts. The count tells you how many are selected, including collapsed posts."),
        h("li", {}, "Click Export selected posts. You get the original posts, source links, context information, and a shared prompt. Large selections are split into numbered files without cutting posts."),
        h("li", {}, "Attach the file to your preferred AI, such as Claude or ChatGPT, to ask questions, compare positions, or explore evidence. Or upload the same file to NotebookLM and use its audio features to create an entertaining podcast exploring the debate. The shared prompt includes guidance for a balanced discussion.")),
      h("p", {}, "You decide where to upload it. zforum does not send the posts to an AI service. Exports include the original authors even if you are reading anonymously. Changing a time window does not change your selection until you click the selection button.")),
    item("How did a post affect you?", "The three mood faces mean made me happy, no impact on mood, and made me sad. Heart and Head feedback on re-writes use + for helped, 0 for no change, and − for made things worse. Click a selected reaction again to clear it. Your Zamagotchi responds to your latest answers, with facial expressions for mood and stars for broader perspective. It never deteriorates because you were away."),
    item("How do I keep access to my account?", "Use a passkey and save your ten recovery codes somewhere private. Each code works once. You can add another passkey in Profile. If you lose all passkeys and all codes, the account cannot be recovered; we do not collect an email address for password resets."));
}
