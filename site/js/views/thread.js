import { authorLine, chip, cite, citeList, forumTopicUrl, mentionedPosts, percent, provenanceLine, segmentsView, statusBadge, textWithCites, toneBadge } from "../components.js";
import { h, link } from "../dom.js";
import { calmDecision, chips, claimCards, coverage, excerpt, ownText, threadModel, volumeNudge } from "../lens.js";

// Only these tones get a badge on a post; "warm" is ordinary forum conversation.
const FLAGGED_TONES = new Set(["heated", "hostile"]);

const LENSES = [
  ["digest", "Claim digest", "One card per distinct claim, with its strongest statement and rebuttal."],
  ["calm", "Calm", "Folds contempt, contentless replies and runs. Never folds a new claim or a change of mind."],
  ["raw", "Raw", "Every post, untouched."],
];

function header(thread, index, lens, model) {
  const topic = thread.topic;
  const nudge = volumeNudge(thread, index.vocabulary);
  return h(
    "header",
    { class: "thread-header" },
    h("p", { class: "eyebrow" }, h("a", { href: "#/" }, "zforum"), " / ", topic.category),
    h("h1", {}, topic.title),
    h("p", { class: "meta" }, `${thread.posts.length} posts · started ${topic.created_at.slice(0, 10)} · `, link(forumTopicUrl(topic), "open on the forum ↗")),
    thread.scope.kind === "tail" ? h("p", { class: "notice" }, `This is a long-running thread: zforum fetched the ${thread.scope.description}.`) : null,
    nudge !== null ? h("p", { class: "notice nudge" }, `One voice is ${percent(nudge.share)} of this thread: ${nudge.author} wrote ${nudge.posts} posts. Volume is shown, never used to fold anything.`) : null,
    h(
      "nav",
      { class: "lens-tabs", role: "tablist" },
      LENSES.map(([id, label, description]) => {
        const unavailable = id === "digest" && !model.analyzed;
        return unavailable
          ? h("span", { class: "tab disabled", title: "Needs the claim analysis, which has not been run for this thread" }, label)
          : h("a", { class: `tab${lens === id ? " active" : ""}`, href: `#/t/${topic.id}/${id}`, title: description, role: "tab", "aria-pressed": lens === id ? "true" : "false" }, label);
      }),
      thread.quiz !== null ? h("a", { class: "tab quiz-tab", href: `#/t/${topic.id}/quiz` }, "Quiz yourself →") : null,
    ),
  );
}

// In the Calm lens the posts are the point, so positions and open questions fold away;
// in the digest they are part of the picture and stay open.
function summaryPanel(thread, lens) {
  const summary = thread.analysis.output.summary;
  const topicId = thread.topic.id;
  return h(
    "section",
    { class: "card summary" },
    h("div", { class: "summary-head" }, h("p", { class: "eyebrow" }, "Summary"), toneBadge(summary.temperature)),
    h("p", { class: "tldr" }, summary.tldr),
    h("details", { class: "overview" }, h("summary", {}, `How the argument went (${summary.overview.length} paragraph${summary.overview.length === 1 ? "" : "s"})`),
      summary.overview.map((paragraph) => {
        const unmentioned = paragraph.cites.filter((number) => !mentionedPosts(paragraph.text).has(number));
        return h("p", {}, textWithCites(paragraph.text, topicId), unmentioned.length > 0 ? [" ", h("span", { class: "cites" }, citeList(topicId, unmentioned))] : null);
      })),
    foldable(lens === "calm", `Positions (${summary.positions.length})${summary.open_questions.length > 0 ? ` and open questions (${summary.open_questions.length})` : ""}`, [
    h("h3", {}, "Positions"),
    h("div", { class: "positions" }, summary.positions.map((position) => h(
      "article",
      { class: "position" },
      h("h4", {}, position.label),
      h("p", {}, position.summary),
      h("p", { class: "meta" }, position.participants.join(", "), " · ", citeList(topicId, position.key_posts)),
    ))),
    summary.open_questions.length > 0 ? [h("h3", {}, "Still open"), h("ul", {}, summary.open_questions.map((question) => {
      const unmentioned = question.cites.filter((number) => !mentionedPosts(question.text).has(number));
      return h("li", {}, textWithCites(question.text, topicId), unmentioned.length > 0 ? [" ", h("span", { class: "cites" }, citeList(topicId, unmentioned))] : null);
    }))] : null,
    ]),
    provenanceLine(thread.analysis.provenance),
  );
}

function foldable(folded, label, children) {
  return folded ? h("details", { class: "overview" }, h("summary", {}, label), children) : children;
}

function quotedPost(post, topicId, role) {
  if (post === null) return h("div", { class: `claim-post ${role} none` }, h("p", { class: "label" }, "Strongest rebuttal"), h("p", { class: "muted" }, "No one has answered this claim."));
  return h(
    "div",
    { class: `claim-post ${role}` },
    h("p", { class: "label" }, role === "statement" ? "Strongest statement" : "Strongest rebuttal", " · ", post.author, " ", cite(topicId, post.number)),
    h("blockquote", {}, excerpt(ownText(post), 320)),
  );
}

function digestLens(model) {
  const topicId = model.thread.topic.id;
  const changes = [...model.mindChanges.values()];
  return h(
    "section",
    { class: "digest-lens" },
    changes.length > 0 ? h(
      "div",
      { class: "card mind-changes" },
      h("p", { class: "eyebrow" }, "Minds changed in this thread"),
      changes.map((change) => h("p", {}, h("q", {}, excerpt(change.span, 200)), " — ", model.posts.get(change.post_number).author, " ", cite(topicId, change.post_number), h("span", { class: "muted" }, " after "), citeList(topicId, change.changed_by))),
    ) : null,
    h("p", { class: "muted" }, `${model.claims.size} distinct claims, in the order they first appeared. Strongest statement and rebuttal are picks from existing posts, never written by zforum.`),
    claimCards(model).map(({ claim, participants, statement, rebuttal }) => h(
      "article",
      { class: `claim-card status-border-${claim.status}` },
      h("div", { class: "claim-head" }, h("span", { class: "claim-id" }, claim.claim_id), statusBadge(claim.status), h("span", { class: "kind" }, claim.kind)),
      h("h3", { class: "claim-text" }, claim.text),
      h("p", { class: "meta" }, `Asserted by ${participants.length} participant${participants.length === 1 ? "" : "s"} · ${claim.asserted_in.length} post${claim.asserted_in.length === 1 ? "" : "s"} · first `, cite(topicId, claim.first_post), claim.rebuttals.length > 0 ? [` · rebutted in `, citeList(topicId, claim.rebuttals)] : null),
      h("div", { class: "claim-posts" }, quotedPost(statement, topicId, "statement"), quotedPost(rebuttal, topicId, "rebuttal")),
      h("p", { class: "status-note" }, textWithCites(claim.status_note, topicId)),
    )),
  );
}

function coverageMeter(model, muted, onUnmute, mutesProblem) {
  if (!model.analyzed) return h("p", { class: "notice" }, "Muting needs the claim analysis, which guarantees you never miss a point nobody else made. It has not been run for this thread.");
  const report = coverage(model, muted);
  if (report.authors.length === 0) return mutesProblem ? h("p", { class: "notice" }, mutesProblem) : null;
  return h(
    "div",
    { class: "coverage", role: "status" },
    h("strong", {}, `You are muting ${report.authors.length} participant${report.authors.length === 1 ? "" : "s"} in this thread: ${percent(report.share)} of its posts.`),
    report.claimsOnlyByMuted > 0 ? ` ${report.claimsOnlyByMuted} claim${report.claimsOnlyByMuted === 1 ? " is" : "s are"} made only by them.` : " Everything they claim, someone else also claims.",
    report.keptByNovelty > 0 ? ` ${report.keptByNovelty} of their posts stay open because they are the first statement of a claim.` : "",
    h("span", { class: "muted" }, ` Mutes expire after 30 days and are private to this browser.`),
    h("div", { class: "muted-list" }, report.authors.map((author) => h("button", { class: "small", on: { click: () => onUnmute(author) } }, `unmute ${author}`))),
    mutesProblem ? h("p", { class: "notice" }, mutesProblem) : null,
  );
}

function chipRow(model, number) {
  const shown = chips(model, number);
  if (shown.caution.length + shown.positive.length + shown.disclosure.length === 0) return null;
  return h(
    "div",
    { class: "chips" },
    shown.positive.map((signal) => chip(signal)),
    shown.caution.map((signal) => chip(signal)),
    shown.hiddenCaution > 0 ? h("span", { class: "chip chip-more" }, `+${shown.hiddenCaution} more`) : null,
    shown.disclosure.map((signal) => chip(signal)),
  );
}

function fullPost(model, post, { decision, lens, muted, onMute, focus }) {
  const topicId = model.thread.topic.id;
  const analysisEntry = model.postAnalysis.get(post.number);
  const isChange = model.mindChanges.has(post.number);
  const canMute = lens === "calm" && model.analyzed;
  return h(
    "article",
    { class: `post${isChange ? " mind-change" : ""}${focus ? " focus" : ""}`, id: `post-${post.number}`, "data-n": post.number },
    authorLine(post, topicId, [
      lens === "calm" && analysisEntry !== undefined && FLAGGED_TONES.has(analysisEntry.tone) ? toneBadge(analysisEntry.tone) : null,
      canMute && !muted.has(post.author) ? h("button", { class: "link-button", title: `Fold ${post.author}'s restatements for 30 days`, on: { click: () => onMute(post.author) } }, "mute") : null,
    ]),
    lens === "calm" ? chipRow(model, post.number) : null,
    decision !== null && decision.keptBecause.length > 0 ? h("p", { class: "kept" }, `Shown although ${decision.reasons.map((reason) => reason.name).join(", ")}: it is ${decision.keptBecause.join("; ")}.`) : null,
    h("div", { class: "post-body" }, segmentsView(post, topicId)),
  );
}

function foldedPost(model, post, decision, focus) {
  const analysisEntry = model.postAnalysis.get(post.number);
  const annotation = analysisEntry !== undefined ? analysisEntry.annotation : null;
  const details = h("details", { class: `post folded${focus ? " focus" : ""}`, id: `post-${post.number}`, "data-n": post.number });
  if (focus) details.setAttribute("open", "");
  const summary = h(
    "summary",
    {},
    h("span", { class: "post-number" }, `#${post.number}`),
    h("span", { class: "author" }, post.author),
    h("span", { class: "fold-reasons" }, "folded: ", decision.reasons.map((reason) => chip({ ...reason, polarity: "caution" }, "chip-small"))),
    annotation !== null ? h("span", { class: "annotation" }, annotation) : null,
    analysisEntry !== undefined && FLAGGED_TONES.has(analysisEntry.tone) ? toneBadge(analysisEntry.tone) : null,
    h("span", { class: "show" }, "show post"),
  );
  details.append(summary, h("div", { class: "post-body" }, segmentsView(post, model.thread.topic.id)));
  return details;
}

function postsLens(model, lens, muted, handlers, focusPost) {
  return h(
    "section",
    { class: `posts lens-${lens}` },
    lens === "calm" ? coverageMeter(model, muted, handlers.onUnmute, handlers.mutesProblem) : null,
    model.thread.posts.map((post) => {
      const focus = post.number === focusPost;
      if (post.hidden) return h("article", { class: "post hidden-post", id: `post-${post.number}`, "data-n": post.number }, h("p", { class: "muted" }, `#${post.number} · ${post.author} · hidden by the community. zforum does not hold its text.`));
      if (lens === "raw") return fullPost(model, post, { decision: null, lens, muted, onMute: handlers.onMute, focus });
      const decision = calmDecision(model, post.number, muted);
      return decision.mode === "folded" ? foldedPost(model, post, decision, focus) : fullPost(model, post, { decision, lens, muted, onMute: handlers.onMute, focus });
    }),
  );
}

export function renderThread({ thread, index, lens, focusPost, muted, handlers }) {
  const model = threadModel(thread, index.vocabulary);
  const effectiveLens = lens === "digest" && !model.analyzed ? "calm" : lens;
  return h(
    "div",
    { class: "thread" },
    header(thread, index, effectiveLens, model),
    model.analyzed && effectiveLens !== "raw" ? summaryPanel(thread, effectiveLens) : null,
    effectiveLens === "digest" ? digestLens(model) : postsLens(model, effectiveLens, muted, handlers, focusPost),
  );
}
