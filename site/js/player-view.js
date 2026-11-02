import { h, replaceContent } from "./dom.js";
import { SPEECH_RATES } from "./speech.js";
export function playerView(player, version, setVersion) {
  if (player.queue.length === 0 && !player.problem) return null;
  const controls = h("div", { class: "player-controls" });
  const voices = player.voices();
  const voiceLabel = (voice) => `${voice.name || voice.voiceURI} (${voice.localService ? "local" : "remote"})`;
  const button = (label, action) => h("button", { class: "chip", on: { click: action } }, label);
  replaceContent(controls, [
    h("label", {}, "Read posts as ", h("select", { "aria-label": "Listening version", on: { change: (event) => setVersion(event.target.value) } }, [{ id: "neutral", label: "Re-writes" }, { id: "original", label: "Originals" }].map((item) => h("option", { value: item.id, selected: version === item.id }, item.label)))),
    h("label", {}, "Speed ", h("select", { "aria-label": "Listening speed", on: { change: (event) => player.speed(Number(event.target.value)) } }, SPEECH_RATES.map((rate) => h("option", { value: rate, selected: player.rate === rate }, `${rate}×`)))),
    h("label", {}, "Voice ", h("select", { "aria-label": "Listening voice", on: { change: (event) => player.chooseVoice(event.target.value) } }, h("option", { value: "", selected: player.voice === "" }, `Automatic · ${voices[0] ? voiceLabel(voices[0]) : "browser default"}`),
      player.voice !== "" && !voices.some((voice) => voice.voiceURI === player.voice) ? h("option", { value: player.voice, selected: true, disabled: true }, "Unavailable voice · choose another") : null,
      voices.map((voice) => h("option", { value: voice.voiceURI, selected: player.voice === voice.voiceURI }, voiceLabel(voice))))),
  ]);
  const item = player.queue[player.item];
  return h("details", { class: "speech-player", open: player.queue.length > 0 },
    h("summary", {}, "Listening", player.status === "playing" ? ` · ${player.item + 1}/${player.queue.length}` : ""),
    h("p", { class: "small", "aria-live": "polite" }, item ? `${player.status}: ${item.label} · passage ${player.chunk + 1}/${item.chunks.length}` : "Choose the overview, a post, or selected posts to begin."), controls,
    player.queue.length ? h("div", { class: "player-controls" }, button(player.status === "playing" ? "Pause" : "Play", () => player.status === "playing" ? player.pause() : player.play()), button("Previous post", () => player.move(-1)), button("Restart current post", () => player.move(0)), button("Next post", () => player.move(1))) : null,
    h("p", { class: "small" }, "Browser/device speech; some voices use remote services. Pause resumes from the current short passage. Background or screen-lock playback depends on your browser. Changing versions applies to your next queue."),
    !player.available() ? h("p", { class: "notice" }, "Speech is unavailable in this browser. No paid service is used.") : null,
    player.problem ? h("p", { class: "notice" }, player.problem) : null,
    player.queue.length ? h("details", {}, h("summary", {}, "Playback order"), h("ol", {}, player.queue.map((entry, index) => h("li", {}, `${index + 1}. ${entry.label}`)))) : null);
}
