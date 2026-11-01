import test from "node:test";
import assert from "node:assert/strict";
import { SpeechPlayer, speechChunks, spokenText, postQueue, overviewQueue } from "../site/js/speech.js";
import { scopeSelection, selectionCoverage } from "../site/js/selection.js";
const makePost = (key, hidden = false) => ({ key, number: Number(key.split('/')[1]), author: "alice", hidden, analysis: { neutral_rendition: null }, segments: [{ kind: "text", text: "# Claim\nSee [evidence](https://example.com)." }, { kind: "quote", source: { username: "bob" }, text: "Disagree." }] });
const data = { topic: { id: "t", overview: [{ text: "A debate." }], threads: [{ id: 7, title: "First", posts: [makePost("7/1"), makePost("7/2", true)] }, { id: 8, title: "Second", posts: [makePost("8/1"), makePost("8/2")] }] } };

test("scope selection derives from all data, excludes hidden posts and deduplicates", () => {
  const selected = scopeSelection(data.topic, new Set(["8/2"]), 7);
  assert.deepEqual([...selected], ["8/2", "7/1"]);
  assert.deepEqual([...scopeSelection(data.topic, selected)], ["8/2", "7/1", "8/1"]);
  assert.equal(selectionCoverage(data.topic, scopeSelection(data.topic, selected)), "All available posts in this topic snapshot");
  assert.equal(selectionCoverage(data.topic, new Set(["7/1"])), "All available posts in thread 7 in this snapshot");
  assert.equal(selectionCoverage(data.topic, selected), "Selected excerpts from this topic snapshot");
  assert.throws(() => scopeSelection(data.topic, selected, 99), { message: "unknown thread 99" });
});
test("speech labels versions, quotes and anonymous authors, retains deterministic order", () => {
  assert.equal(spokenText("# Heading\n\n**Bold** [source](https://example.com/long)"), "Heading\nBold source");
  const queue = postQueue(data, new Set(["8/2", "7/1"]), "neutral", true);
  assert.deepEqual(queue.map((item) => item.key), ["7/1", "8/2"]);
  assert.equal(queue[0].version, "original");
  assert.equal(queue[0].chunks.join(" "), "First, post 1, Participant 1. Original; no rendition available. Claim See evidence. Quotation from another participant. Disagree. End quotation.");
  const rendition = structuredClone(data);
  rendition.topic.threads[0].posts[0].analysis.neutral_rendition = "Rendition.";
  assert.equal(postQueue(rendition, new Set(["7/1"]), "neutral", false)[0].version, "neutral");
  assert.equal(overviewQueue(data, false)[0].chunks[0], "A debate.");
});
test("chunks remain bounded and preserve words for varying input lengths", () => {
  for (let count = 1; count < 1000; count += 11) {
    const text = Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
    const chunks = speechChunks(text);
    assert.equal(chunks.join(" "), text);
    assert.equal(chunks.every((chunk) => chunk.length <= 450), true);
  }
  assert.deepEqual(speechChunks("x".repeat(901)).map((chunk) => chunk.length), [450,450,1]);
});
test("passages break between sentences and only split sentences that exceed the limit", () => {
  const sentences = ["The first sentence ends here.", "The second sentence should remain whole.", "A third sentence follows."];
  assert.deepEqual(speechChunks(sentences.join(" "), 65), sentences);
  const long = "This sentence " + "continues ".repeat(80) + "until here.";
  const text = `An introduction. ${long} A conclusion.`;
  const chunks = speechChunks(text);
  assert.equal(chunks[0],"An introduction.");
  assert.equal(chunks.join(" "),text);
  assert.ok(chunks.every((chunk) => chunk.length <= 450));
  assert.throws(() => speechChunks("text",0),/must be positive/);
});
function player() {
  const utterances = [], saved = [];
  const engine = { cancellations: 0, cancel() { this.cancellations++; }, speak(u) { utterances.push(u); }, getVoices() { return [{ lang: "en", voiceURI: "remote", localService: false }, { lang: "en", voiceURI: "local", localService: true }]; } };
  const instance = new SpeechPlayer({ engine, Utterance: class { constructor(text) { this.text = text; } }, save: (record) => saved.push(structuredClone(record)), changed() {} });
  return { instance, utterances, saved, engine };
}
test("replacement, pause, restart, speed, errors and resume cannot overlap or autoplay", (t) => {
  t.mock.timers.enable({apis:["setTimeout","Date"]});
  const advance = () => t.mock.timers.tick(0);
  const { instance: p, utterances: u, saved } = player();
  const queue = [{ key: "7/1", version: "original", label: "One", chunks: ["first", "second"] }, { key: "8/1", version: "original", label: "Two", chunks: ["third"] }];
  p.start(queue, "snapshot"); advance();
  queue[0].chunks[0] = "changed";
  assert.equal(u[0].text, "first");
  assert.equal(u[0].voice.voiceURI, "local");
  u[0].onend(); advance(); assert.equal(p.chunk, 1);
  p.pause(); u[1].onend(); assert.equal(p.item, 0);
  p.play(); advance(); assert.equal(u.at(-1).text, "second");
  p.speed(1.5); advance(); assert.equal(u.at(-1).rate, 1.5);
  p.move(1); advance(); assert.equal(p.item, 1);
  p.move(0); advance(); assert.equal(p.chunk, 0);
  const stale = u.at(-1);
  p.start([{ key: "new", version: "original", label: "New", chunks: ["replacement"] }], "new"); advance();
  stale.onend(); assert.equal(p.item, 0); assert.equal(u.at(-1).text, "replacement");
  u.at(-1).onerror({ error: "network" });
  assert.equal(p.status, "paused");
  assert.equal(p.problem, "Speech stopped: network. Press Play to retry this passage.");
  const restored = player(); restored.instance.restore(saved.at(-1), "new");
  assert.equal(restored.instance.status, "paused"); assert.equal(restored.utterances.length, 0);
  const changed = player(); changed.instance.restore(saved.at(-1), "different"); assert.equal(changed.instance.queue.length, 0);
  assert.throws(() => p.speed(3), { message: "unsupported rate 3" });
});

test("voice changes wait for cancellation, stop silent fallback and ignore late utterance events", (t) => {
  t.mock.timers.enable({apis:["setTimeout","Date"]});
  const { instance:p, engine, utterances:u } = player();
  const queue = [{key:"1/1",version:"original",label:"One",chunks:["First.","Second."]}];
  engine.speaking = true;
  p.start(queue,"snapshot");
  t.mock.timers.tick(100);
  assert.equal(u.length,0);
  assert.equal(engine.cancellations,1);
  engine.speaking = false;
  t.mock.timers.tick(20);
  assert.equal(u.length,1);
  p.chooseVoice("remote");
  assert.equal(engine.cancellations,2);
  assert.equal(u.length,1);
  t.mock.timers.tick(0);
  assert.equal(u.at(-1).voice.voiceURI,"remote");
  const first = u.at(-1);
  first.onend(); t.mock.timers.tick(0);
  first.onerror({error:"interrupted"}); first.onend();
  assert.equal(p.status,"playing"); assert.equal(p.chunk,1); assert.equal(u.length,3);
  p.chooseVoice("disappeared"); t.mock.timers.tick(0);
  assert.equal(p.status,"paused"); assert.match(p.problem,/no longer available/);
  assert.equal(u.length,3);
  p.chooseVoice("local"); p.play(); p.pause(); t.mock.timers.tick(100);
  assert.equal(u.length,3);
  engine.pending = true;
  p.play(); t.mock.timers.tick(1100);
  assert.equal(p.status,"paused"); assert.match(p.problem,/still busy/);
});
