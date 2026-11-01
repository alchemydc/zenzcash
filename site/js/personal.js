import { h } from "./dom.js";
import { parseSettings } from "./logic.js";

export const COMPANIONS = [
  ["cat","Cat","🐱"], ["bunny","Bunny","🐰"], ["fox","Fox","🦊"], ["panda","Panda","🐼"], ["otter","Otter","🦦"],
  ["frog","Frog","🐸"], ["owl","Owl","🦉"], ["penguin","Penguin","🐧"], ["axolotl","Axolotl","(◕‿◕)"], ["cloud","Cloud","☁️"],
];
export function parsePersonal(value) {
  if (!value || typeof value.label !== "string" || !COMPANIONS.some(([id]) => id === value.appearance) || !Number.isInteger(value.recovery_remaining) || value.recovery_remaining < 0 || value.recovery_remaining > 10 || !value.reading || typeof value.reading !== "object" || Array.isArray(value.reading)) throw new Error("invalid account state");
  for (const [key, entry] of Object.entries(value.reading)) if (!/^[1-9][0-9]*\/[1-9][0-9]*$/.test(key) || !entry || typeof entry.bookmarked !== "boolean" || typeof entry.read !== "boolean") throw new Error(`invalid saved reading state for ${key}`);
  for (const dimension of ["emotions", "head"]) if (!Number.isFinite(value.progress?.[dimension]) || Math.abs(value.progress[dimension]) > 10) throw new Error(`invalid companion ${dimension}`);
  if (value.preferences !== null) parseSettings(JSON.stringify(value.preferences));
  return value;
}
const decode = (text) => Uint8Array.from(atob(text.replace(/-/g,"+").replace(/_/g,"/")), (c) => c.charCodeAt(0));
const encode = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
export function credentialOptions(value, create) {
  const options = structuredClone(value);
  options.publicKey.challenge = decode(options.publicKey.challenge);
  if (create) options.publicKey.user.id = decode(options.publicKey.user.id);
  const list = create ? "excludeCredentials" : "allowCredentials";
  if (options.publicKey[list]) for (const item of options.publicKey[list]) item.id = decode(item.id);
  return options;
}
export function credentialJSON(credential) {
  const response = { clientDataJSON: encode(credential.response.clientDataJSON) };
  if ("attestationObject" in credential.response) { response.attestationObject = encode(credential.response.attestationObject); response.transports = credential.response.getTransports?.() ?? []; }
  else { response.authenticatorData = encode(credential.response.authenticatorData); response.signature = encode(credential.response.signature); response.userHandle = credential.response.userHandle === null ? null : encode(credential.response.userHandle); }
  return { id: credential.id, rawId: encode(credential.rawId), type: credential.type, response, extensions: credential.getClientExtensionResults() };
}
export function guestVisit(previous, timestamp) {
  if (previous !== null && (!Number.isFinite(previous.active) || !(previous.cutoff === null || typeof previous.cutoff === "string"))) throw new Error("invalid saved visit state");
  return previous !== null && timestamp - previous.active < 1800000 ? { ...previous, active: timestamp } : { active: timestamp, cutoff: previous === null ? null : new Date(previous.active).toISOString() };
}
export function companionView(personal, openAccount) {
  const [id,name,face] = COMPANIONS.find(([key]) => key === (personal?.appearance ?? "cat"));
  const progress = personal?.progress ?? { emotions: 0, head: 0 };
  const mood = progress.emotions > 2 ? "happy" : progress.emotions < -2 ? "quiet" : "neutral";
  const bulbs = Math.max(0, Math.min(5, Math.ceil((progress.head + 10) / 4)));
  return h("button", { class: `companion companion-${id} companion-${mood}`, "aria-label": `${name} companion. Emotional benefit ${progress.emotions.toFixed(1)}; new perspectives ${progress.head.toFixed(1)}. Open account and companion settings.`, on: { click: openAccount } },
    h("span", { class: "companion-face", "aria-hidden": "true" }, face),
    h("span", { class: "companion-bulbs", "aria-hidden": "true" }, "💡".repeat(bulbs)),
    h("span", { class: "small" }, personal ? "Your companion" : "Choose a friend"));
}
export function accountPanel(account, actions) {
  const personal = account.personal;
  const status = h("p", { class: "notice", "aria-live": "polite" });
  const run = (task) => async () => { status.textContent = "Working…"; try { await task(); status.textContent = "Saved."; } catch (error) { status.textContent = error.message; } };
  const button = (label, task) => h("button", { class: "chip", on: { click: run(task) } }, label);
  const unavailable = !account.auth_available || !globalThis.PublicKeyCredential;
  const code = h("input", { type: "password", "aria-label": "One recovery code" });
  const recovery = h("details", {}, h("summary", {}, "Recover with one of your codes"),
    h("p", {}, "This creates a new passkey, revokes old passkeys and signs out other sessions. Only the code you use is consumed; your other codes remain valid."), code,
    button("Recover and create a passkey", () => actions.authenticate("recover", code.value)));
  const guest = h("div", {},
    h("p", {}, "Browse freely. Sign in with a passkey to save posts, read/unread choices, filters and your companion across devices. No email or password reset."),
    button("Create account with a passkey", () => actions.authenticate("register")), button("Sign in with a passkey", () => actions.authenticate("login")), recovery,
    unavailable ? h("p", { class: "notice" }, account.auth_problem ?? "This browser does not support passkeys.") : null);
  if (unavailable) for (const node of guest.querySelectorAll?.("button") ?? []) node.disabled = true;
  const members = personal ? h("div", {},
    h("p", {}, `${personal.label} · ${personal.recovery_remaining} recovery codes remaining`),
    h("p", { class: "small" }, "Signed feedback: −10 means worse/narrower, 0 means no effect, +10 means helpful/new angles. Your companion reflects the latest answer for each post, independently for emotions and perspectives. It never loses health because you were away."),
    h("div", { class: "companion-options", role: "group", "aria-label": "Choose your companion" }, COMPANIONS.map(([id,name,face]) => h("button", { class: "chip", "aria-pressed": String(personal.appearance === id), on: { click: run(() => actions.appearance(id)) } }, `${face} ${name}`))),
    h("p", { class: "small" }, "Changing companions keeps your progress. Responses also help the team evaluate renditions; companion-linked feedback is not an unbiased quality benchmark."),
    button("Verify again with passkey", () => actions.authenticate("login")), button("Add another passkey", () => actions.authenticate("add")),
    button("Sign out", () => actions.control("logout")), button("Sign out other devices", () => actions.control("revoke-others")),
    h("details", {}, h("summary", {}, "Recovery codes and account deletion"),
      h("p", {}, "Adding a passkey, replacing codes or deleting your account requires verification within five minutes. If all passkeys and codes are lost, you must create a new account."),
      button("Replace all remaining recovery codes", () => actions.control("replace-codes")),
      h("details", {}, h("summary", {}, "Delete this account permanently"), h("p", {}, "Deletes your credentials, recovery codes and personal reading/feedback data. This cannot be undone."), button("Permanently delete my account", () => actions.control("delete")))),
    button("Import this browser’s current filters into my account", () => actions.importSettings())) : null;
  return h("details", { id: "account-panel", class: "account-panel card", open: account.open, on: { toggle: (event) => { if (event.target.id === "account-panel" && event.target.isConnected) account.open = event.target.open; } } }, h("summary", {}, personal ? "Your account, saved posts and companion" : "Save your reading · account & companion"), members ?? guest,
    account.recovery_codes ? h("div", { class: "recovery-codes" }, h("p", {}, "Save these ten codes now. They are shown only at creation; each can recover your account once. Treat them like passwords."), h("pre", {}, account.recovery_codes.join("\n")), button("Download recovery codes", actions.downloadCodes), button("I saved my codes · hide them", actions.hideCodes)) : null,
    account.problem ? h("p", { class: "notice" }, account.problem) : null, status);
}
