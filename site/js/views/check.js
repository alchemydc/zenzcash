import { citeList, textWithCites } from "../components.js";
import { h, replaceContent } from "../dom.js";
import { inspectDraft, logPosition, verifyLog, verifyPost } from "../receipt.js";

// [field, singular, plural]
const COUNT_LABELS = [
  ["repetitions", "repeated claim", "repeated claims"],
  ["contradicted", "fact contradicted in the thread", "facts contradicted in the thread"],
  ["unsourced", "unsourced figure", "unsourced figures"],
  ["supported", "fact supported in the thread", "facts supported in the thread"],
  ["tone", "tone finding", "tone findings"],
  ["novel_claims", "new claim", "new claims"],
];

function findingsView(findings, topicId) {
  const section = (title, items, render) => (items.length === 0 ? null : [h("h4", {}, title), h("ul", {}, items.map(render))]);
  return h(
    "div",
    { class: "findings" },
    h("p", {}, textWithCites(findings.summary, topicId)),
    section("Repeats an existing claim", findings.repetitions, (item) => h("li", {}, h("q", {}, item.span), ` (${item.claim_id}) — `, textWithCites(item.note, topicId))),
    section("Facts, checked against the thread only", findings.factual, (item) => h("li", {}, h("span", { class: `status status-${item.assessment}` }, item.assessment), " ", h("q", {}, item.span), " — ", textWithCites(item.note, topicId), item.cites.length > 0 ? [" ", citeList(topicId, item.cites)] : null)),
    section("Tone", findings.tone, (item) => h("li", {}, h("span", { class: "chip chip-caution" }, item.signal), " ", h("q", {}, item.span), " — ", textWithCites(item.note, topicId))),
    section("New to this thread", findings.novel_claims, (item) => h("li", {}, h("q", {}, item.span), " — ", textWithCites(item.note, topicId))),
  );
}

async function verificationView(postText, receipts, index) {
  const verified = await verifyPost(postText, receipts.keyring);
  if (!verified.ok) return h("div", { class: "verdict invalid" }, h("h3", {}, "Not verified"), h("p", {}, verified.reason));
  const log = await verifyLog(receipts.log, receipts.keyring);
  if (!log.ok) return h("div", { class: "verdict invalid" }, h("h3", {}, "Signature valid, but the published log is broken"), h("p", {}, log.reason));
  const position = logPosition(log, verified);
  const payload = verified.payload;
  const thread = index.threads.find((entry) => entry.id === payload.topic_id);
  const findings = receipts.findings[payload.findings_sha256];
  return h(
    "div",
    { class: `verdict ${position.inLog ? "valid" : "invalid"}` },
    h("h3", {}, position.inLog ? "Verified" : "Signature valid, but not in the published log"),
    h("p", {}, "This exact text was checked by zforum on ", payload.issued_at.replace("T", " ").replace("Z", " UTC"), " against ", thread ? h("a", { href: `#/t/${payload.topic_id}` }, thread.title) : `t/${payload.topic_id}`, "."),
    h("ul", { class: "counts" }, COUNT_LABELS.map(([field, singular, plural]) => h("li", { class: payload.counts[field] > 0 ? "nonzero" : "" }, h("strong", {}, String(payload.counts[field])), ` ${payload.counts[field] === 1 ? singular : plural}`))),
    h("p", { class: "meta" }, `Checker: ${payload.checker.model} (${payload.checker.backend}), prompt ${payload.checker.prompt_sha256.slice(0, 12)} · log entry ${position.seq + 1} of ${position.total} · ${position.sameTopic} check${position.sameTopic === 1 ? "" : "s"} issued for this thread, ${position.sameDraft} for this exact draft · key ${payload.kid}`),
    findings !== undefined ? findingsView(findings.findings, payload.topic_id) : h("p", { class: "muted" }, "The detailed findings are not published; the counts above are signed."),
  );
}

function requestPanel(index, snapshotName) {
  const analyzed = index.threads.filter((thread) => thread.analyzed);
  const select = h("select", { "aria-label": "Thread to reply in" }, analyzed.map((thread) => h("option", { value: String(thread.id) }, thread.title)));
  const draft = h("textarea", { rows: "8", placeholder: "Write your reply here…", spellcheck: "true", "aria-label": "Draft reply" });
  const status = h("div", { class: "request-status" });
  async function update() {
    const inspected = await inspectDraft(draft.value);
    if (!inspected.ok) {
      replaceContent(status, [h("p", { class: "muted" }, inspected.reason)]);
      return;
    }
    const subject = `t${select.value}-${inspected.sha256.slice(0, 16)}`;
    const job = `data/intel-jobs/check_draft/${subject}`;
    const download = document.createElement("a");
    download.textContent = "Download draft.md";
    download.className = "button";
    download.setAttribute("download", "draft.md");
    download.href = URL.createObjectURL(new Blob([inspected.draft], { type: "text/markdown" }));
    replaceContent(status, [
      h("p", { class: "meta" }, `${inspected.chars} characters · sha256 ${inspected.sha256.slice(0, 16)}… · this hash is what the receipt will sign`),
      download,
      h("p", {}, "This prototype has no live model connection, so the check runs where the zforum checker runs:"),
      h("pre", { class: "commands" }, [
        `.venv/bin/python -m zforum.intel prepare check_draft --snapshot data/crawls/${snapshotName} --topic ${select.value} --draft draft.md`,
        `# with an API key:`,
        `.venv/bin/python -m zforum.intel run-api ${job}`,
        `# or a Sonnet subagent writes ${job}/output.json, then:`,
        `.venv/bin/python -m zforum.intel accept ${job} --subagent-model claude-sonnet-5-5`,
        `.venv/bin/python -m zforum.attest issue ${job}`,
      ].join("\n")),
      h("p", { class: "muted" }, "The last command prints the receipt line. Paste it at the end of your post, after one blank line."),
    ]);
  }
  draft.addEventListener("input", update);
  select.addEventListener("change", update);
  return h("section", { class: "card" }, h("h2", {}, "Get your draft checked"), h("label", {}, "Replying in ", select), draft, status);
}

export function renderCheck({ index, receipts }) {
  const input = h("textarea", { rows: "10", placeholder: "Paste a forum post that ends with a zforum-receipt line…", "aria-label": "Post to verify", spellcheck: "false" });
  const output = h("div", { class: "verify-output" });
  async function verify() {
    replaceContent(output, [h("p", { class: "muted" }, "Checking…")]);
    replaceContent(output, [await verificationView(input.value, receipts, index)]);
  }
  return h(
    "div",
    { class: "check" },
    h("p", { class: "eyebrow" }, h("a", { href: "#/" }, "zforum"), " / check receipts"),
    h("h1", {}, "Show your post was checked"),
    h("p", { class: "lede" }, "Before you post, zforum can check your draft against the thread: is the claim already made and answered, does the thread contradict a figure, does the post attack people rather than ideas. The findings are signed into a receipt you attach to the post. Anyone can verify it here, in the browser, without trusting this page's server."),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Verify a post"),
      input,
      h("p", {}, h("button", { on: { click: verify } }, "Verify")),
      receipts.examples.length > 0 ? h("p", { class: "examples" }, "Examples: ", receipts.examples.map((example) => h("button", { class: "small ghost", title: example.description, on: { click: () => { input.value = example.post; verify(); } } }, example.title))) : null,
      output,
    ),
    requestPanel(index, index.snapshot.name),
    h(
      "section",
      { class: "card limits" },
      h("h2", {}, "What a receipt proves, and what it does not"),
      h("ul", {}, [
        "It proves that zforum's checker read exactly this text, in this thread, at this time, with this prompt and model, and found these things. Change one character of the post and verification fails.",
        "It is a findings receipt, not a permission slip: it is issued whatever the findings are, and nobody needs one to post.",
        "Facts are judged only against the thread, never on the model's own knowledge. \"Contradicted\" means a post in the thread says otherwise, and the receipt cites it.",
        "Every receipt is in a public, hash-chained log, so re-checking a draft until the findings look better leaves a visible trail. The log holds hashes and counts, never your text.",
        "It does not prove the findings are right. The checker is a model and can be wrong; the cited posts are there so you can judge.",
        "The trust anchor is zforum's signing key. A ZK proof could remove that trust later; this prototype does not need it.",
      ].map((text) => h("li", {}, text))),
    ),
  );
}
