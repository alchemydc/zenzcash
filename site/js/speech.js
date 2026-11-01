import { parseBlocks } from "./markdown.js";
import { selectedPosts } from "./selection.js";
import { maskMentions, participantNumbers, pseudonym } from "./logic.js";

export const SPEECH_RATES = [1, 1.25, 1.5, 2];
export const SPEECH_PASSAGE_LIMIT = 450;
const inlineText = (nodes) => nodes.map((node) => {
  switch (node.type) {
    case "text": case "code": return node.text;
    case "break": return " ";
    case "strong": case "em": case "link": return inlineText(node.children);
    case "image": return node.alt ? `Image: ${node.alt}.` : "Image.";
    default: throw new Error(`unknown spoken inline ${node.type}`);
  }
}).join("");
const blockText = (blocks) => blocks.map((block) => {
  switch (block.type) {
    case "paragraph": case "heading": return inlineText(block.inlines);
    case "code": return `Code quotation. ${block.text} End code.`;
    case "rule": return "";
    case "blockquote": return `Quotation. ${blockText(block.blocks)} End quotation.`;
    case "list": return block.items.map((item) => inlineText(item)).join(". ");
    default: throw new Error(`unknown spoken block ${block.type}`);
  }
}).join("\n");
export const spokenText = (text) => blockText(parseBlocks(text)).replace(/https?:\/\/[^\s]+/g, "linked resource").trim();

function wordChunks(text, limit) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let chunk = "";
  for (const word of words) {
    if (chunk && chunk.length + word.length + 1 > limit) { chunks.push(chunk); chunk = ""; }
    if (word.length > limit) {
      if (chunk) { chunks.push(chunk); chunk = ""; }
      for (let offset = 0; offset < word.length; offset += limit) chunks.push(word.slice(offset, offset + limit));
    } else chunk += `${chunk ? " " : ""}${word}`;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
// Preserve sentence prosody; only an overlong sentence needs a word-boundary split.
export function speechChunks(text, limit = SPEECH_PASSAGE_LIMIT) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("speech passage limit must be positive");
  const normalized = text.trim().replace(/\s+/g, " ");
  const chunks = [];
  let chunk = "";
  for (const { segment } of new Intl.Segmenter("en", { granularity: "sentence" }).segment(normalized)) {
    const sentence = segment.trim();
    if (chunk && chunk.length + sentence.length + 1 > limit) { chunks.push(chunk); chunk = ""; }
    if (sentence.length > limit) { for (const part of wordChunks(sentence, limit)) chunks.push(part); }
    else chunk += `${chunk ? " " : ""}${sentence}`;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
export function postQueue(data, selected, version, anonymous) {
  if (!["neutral", "original"].includes(version)) throw new Error(`unknown listening version ${version}`);
  const numbers = participantNumbers(data.topic);
  const transform = (text) => anonymous ? maskMentions(text, numbers) : text;
  return selectedPosts(data.topic, selected).map(({ thread, post }) => {
    const actual = version === "neutral" && post.analysis.neutral_rendition !== null ? "neutral" : "original";
    const who = anonymous ? pseudonym(numbers.get(post.author)) : post.author;
    const quote = (segment) => `Quotation from ${segment.source === null ? "another author" : anonymous ? "another participant" : segment.source.username}. ${spokenText(transform(segment.text))} End quotation.`;
    const body = actual === "neutral" ? [spokenText(transform(post.analysis.neutral_rendition)), ...post.segments.filter((s) => s.kind === "quote").map(quote)].join("\n") : post.segments.map((s) => s.kind === "quote" ? quote(s) : spokenText(transform(s.text))).join("\n");
    const label = `${thread.title}, post ${post.number}, ${who}. ${actual === "neutral" ? "AI neutral rendition" : "Original"}${actual !== version ? "; no rendition available" : ""}.`;
    return { key: post.key, version: actual, label, chunks: speechChunks(`${label}\n${body}`) };
  });
}
export function overviewQueue(data, anonymous) {
  const numbers = participantNumbers(data.topic);
  const text = data.topic.overview.map((item) => anonymous ? maskMentions(item.text, numbers) : item.text).join("\n");
  return [{ key: `overview/${data.topic.id}`, version: "overview", label: "Topic overview · AI-generated", chunks: speechChunks(spokenText(text)) }];
}

// Generation tokens prevent cancelled utterances from advancing a replacement queue.
export class SpeechPlayer {
  constructor({ engine, Utterance, save, changed }) {
    this.engine = engine;
    this.Utterance = Utterance;
    this.save = save;
    this.changed = changed;
    this.queue = [];
    this.item = 0;
    this.chunk = 0;
    this.rate = 1;
    this.voice = "";
    this.status = "idle";
    this.problem = null;
    this.generation = 0;
    this.identity = null;
    this.timer = null;
  }
  available() { return Boolean(this.engine && this.Utterance); }
  voices() { return this.available() ? this.engine.getVoices().filter((voice) => voice.lang.startsWith("en")).sort((a, b) => Number(b.localService) - Number(a.localService)) : []; }
  notify() {
    try { this.save({ identity: this.identity, queue: this.queue, item: this.item, chunk: this.chunk, rate: this.rate, voice: this.voice }); }
    catch (error) { this.problem = `Listening position could not be saved: ${error.message}`; }
    this.changed();
  }
  restore(record, identity) {
    if (!record || record.identity !== identity) return;
    if (!Array.isArray(record.queue) || !record.queue.length || !record.queue.every((item) => typeof item.key === "string" && typeof item.version === "string" && typeof item.label === "string" && Array.isArray(item.chunks) && item.chunks.length && item.chunks.every((text) => typeof text === "string" && text.length <= SPEECH_PASSAGE_LIMIT)) || !Number.isInteger(record.item) || record.item < 0 || record.item >= record.queue.length || !Number.isInteger(record.chunk) || record.chunk < 0 || record.chunk >= record.queue[record.item].chunks.length || !SPEECH_RATES.includes(record.rate) || typeof record.voice !== "string") throw new Error("saved listening queue is malformed");
    Object.assign(this, record);
    this.status = "paused";
  }
  start(queue, identity) {
    if (!this.available()) { this.problem = "Speech is unavailable in this browser. No paid service is used."; this.changed(); return; }
    this.queue = structuredClone(queue);
    this.identity = identity;
    this.item = this.chunk = 0;
    this.problem = null;
    this.play();
  }
  cancel() { this.generation++; clearTimeout(this.timer); this.timer = null; this.current = null; this.engine?.cancel(); this.status = "paused"; }
  play() {
    if (!this.available()) return;
    this.cancel();
    if (!this.queue.length) { this.notify(); return; }
    this.problem = null;
    this.status = "playing";
    this.scheduleSpeech();
    this.notify();
  }
  scheduleSpeech() {
    const token = this.generation;
    const deadline = Date.now() + 1000;
    const ready = () => {
      this.timer = null;
      if (token !== this.generation || this.status !== "playing") return;
      // Some engines finish cancellation after cancel() returns. Never race the old queue.
      if (this.engine.speaking || this.engine.pending) {
        if (Date.now() < deadline) { this.timer = setTimeout(ready, 20); return; }
        this.status = "paused";
        this.problem = "The browser speech engine is still busy after stopping. Press Play to retry.";
        this.notify();
        return;
      }
      this.speak();
    };
    this.timer = setTimeout(ready, 0);
  }
  speak() {
    const token = this.generation;
    const current = this.queue[this.item];
    const utterance = new this.Utterance(current.chunks[this.chunk]);
    const voices = this.voices();
    const voice = this.voice === "" ? voices[0] ?? null : voices.find((voice) => voice.voiceURI === this.voice);
    if (this.voice !== "" && !voice) {
      this.status = "paused";
      this.problem = "The selected voice is no longer available. Choose another voice or Automatic.";
      this.notify();
      return;
    }
    utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en";
    utterance.rate = this.rate;
    utterance.onend = () => {
      if (token !== this.generation || this.current !== utterance) return;
      this.current = null;
      if (this.chunk + 1 < current.chunks.length) this.chunk++;
      else if (this.item + 1 < this.queue.length) { this.item++; this.chunk = 0; }
      else { this.status = "finished"; this.notify(); return; }
      this.scheduleSpeech();
    };
    utterance.onerror = (event) => {
      if (token !== this.generation || this.current !== utterance) return;
      this.cancel();
      this.problem = `Speech stopped: ${event.error}. Press Play to retry this passage.`;
      this.notify();
    };
    this.current = utterance;
    this.engine.speak(utterance);
    this.notify();
  }
  pause() { this.cancel(); this.notify(); }
  move(delta) { const playing = this.status === "playing"; this.item = Math.max(0, Math.min(this.queue.length - 1, this.item + delta)); this.chunk = 0; if (playing) this.play(); else this.notify(); }
  speed(rate) { if (!SPEECH_RATES.includes(rate)) throw new Error(`unsupported rate ${rate}`); this.rate = rate; if (this.status === "playing") this.play(); else this.notify(); }
  chooseVoice(uri) { this.voice = uri; this.speed(this.rate); }
}
