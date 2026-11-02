import { h, link } from "./dom.js";
import { migrateSettings } from "./logic.js";

export function accountOriginLink(configured, current) {
  const url = new URL(configured);
  if (url.origin !== configured || !(url.protocol === "https:" || url.protocol === "http:" && url.hostname === "localhost")) throw new Error("Invalid account origin from server");
  return configured === current ? null : `${configured}/`;
}

export const COMPANIONS = [
  ["cat","Cat","🐱"], ["bunny","Bunny","🐰"], ["fox","Fox","🦊"], ["panda","Panda","🐼"], ["otter","Otter","🦦"],
  ["frog","Frog","🐸"], ["owl","Owl","🦉"], ["penguin","Penguin","🐧"], ["axolotl","Axolotl","(◕‿◕)"], ["cloud","Cloud","☁️"],
];
export function parsePersonal(value) {
  if (!value || typeof value.label !== "string" || !COMPANIONS.some(([id]) => id === value.appearance) || !Number.isInteger(value.recovery_remaining) || value.recovery_remaining < 0 || value.recovery_remaining > 10 || !value.reading || typeof value.reading !== "object" || Array.isArray(value.reading)) throw new Error("invalid account state");
  for (const [key, entry] of Object.entries(value.reading)) if (!/^[1-9][0-9]*\/[1-9][0-9]*$/.test(key) || !entry || typeof entry.bookmarked !== "boolean" || typeof entry.read !== "boolean") throw new Error(`invalid saved reading state for ${key}`);
  for (const dimension of ["emotions", "head"]) if (!Number.isFinite(value.progress?.[dimension]) || Math.abs(value.progress[dimension]) > 1) throw new Error(`invalid companion ${dimension}`);
  if (!value.moods || typeof value.moods !== "object" || Array.isArray(value.moods)) throw new Error("invalid mood reactions");
  for (const [key, score] of Object.entries(value.moods)) if (!/^[1-9][0-9]*\/[1-9][0-9]*$/.test(key) || !Number.isInteger(score) || Math.abs(score) > 1) throw new Error(`invalid mood reaction for ${key}`);
  if (value.preferences !== null) value = { ...value, preferences: migrateSettings(value.preferences) };
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
  const [id,name] = COMPANIONS.find(([key]) => key === (personal?.appearance ?? "cat"));
  const progress = personal?.progress ?? { emotions: 0, head: 0 };
  const mood = progress.emotions > 0 ? "happy" : progress.emotions < 0 ? "sad" : "neutral";
  const stars = Math.ceil(Math.max(0, progress.head) * 5);
  return h("button", { class: `companion companion-${id} companion-${mood}`, "aria-label": `${name} Zamagotchi. Emotional benefit ${progress.emotions.toFixed(1)}; new perspectives ${progress.head.toFixed(1)}. Open account and Zamagotchi settings.`, on: { click: openAccount } },
    companionArt(id),
    h("span", { class: "companion-stars", "aria-hidden": "true" }, "★".repeat(stars), h("span", { class: "unlit-stars" }, "☆".repeat(5 - stars))),
    h("span", { class: "small" }, personal ? "Zamagotchi" : "Choose a pet"));
}
export function companionArt(id) {
  return h("span", { class: `companion-creature creature-${id}`, "aria-hidden": "true" },
    h("span", { class: "pet-ear pet-ear-left" }), h("span", { class: "pet-ear pet-ear-right" }),
    h("span", { class: "pet-body" }, h("span", { class: "pet-patch" }), h("span", { class: "pet-eye pet-eye-left" }), h("span", { class: "pet-eye pet-eye-right" }), h("span", { class: "pet-cheek pet-cheek-left" }), h("span", { class: "pet-cheek pet-cheek-right" }), h("span", { class: "pet-mouth" })),
    h("span", { class: "pet-foot pet-foot-left" }), h("span", { class: "pet-foot pet-foot-right" }));
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
    h("p", {}, "Browse freely. Sign in with a passkey to save posts, read/unread choices, filters and your Zamagotchi across devices. No email or password reset."),
    button("Create account with a passkey", () => actions.authenticate("register")), button("Sign in with a passkey", () => actions.authenticate("login")), recovery,
    unavailable ? h("p", { class: "notice" }, account.auth_problem ?? "This browser does not support passkeys.") : null);
  if (unavailable) for (const node of guest.querySelectorAll?.("button") ?? []) node.disabled = true;
  const members = personal ? h("div", {},
    h("p", {}, `${personal.label} · ${personal.recovery_remaining} recovery codes remaining`),
    h("p", { class: "small" }, "Your latest mood or Heart answer for each post shapes your Zamagotchi’s expression. Head feedback adds stars for broader perspectives. + means helped, 0 means no change, and − means made things worse. It never loses health because you were away."),
    h("div", { class: "companion-options", role: "group", "aria-label": "Choose your Zamagotchi" }, COMPANIONS.map(([id,name]) => h("button", { class: "chip companion-happy", "aria-pressed": String(personal.appearance === id), on: { click: run(() => actions.appearance(id)) } }, companionArt(id), name))),
    h("p", { class: "small" }, "Changing appearance keeps your progress. Your answers also help the team evaluate re-writes."),
    button("Verify again with passkey", () => actions.authenticate("login")), button("Add another passkey", () => actions.authenticate("add")),
    button("Sign out", () => actions.control("logout")), button("Sign out other devices", () => actions.control("revoke-others")),
    h("details", {}, h("summary", {}, "Recovery codes and account deletion"),
      h("p", {}, "Adding a passkey, replacing codes or deleting your account requires verification within five minutes. If all passkeys and codes are lost, you must create a new account."),
      button("Replace all remaining recovery codes", () => actions.control("replace-codes")),
      h("details", {}, h("summary", {}, "Delete this account permanently"), h("p", {}, "Deletes your credentials, recovery codes and personal reading/feedback data. This cannot be undone."), button("Permanently delete my account", () => actions.control("delete")))),
    button("Import this browser’s current filters into my account", () => actions.importSettings())) : null;
  const content = account.sign_in_url ? h("div", {},
    h("p", { class: "notice" }, "Accounts use a different website address. Open the link below to create an account or sign in."),
    link(account.sign_in_url, `Open ${account.sign_in_url}`)) : members ?? guest;
  return h("section", { id: "account-panel", class: "account-panel card" }, h("h1", {}, personal ? "Profile" : "Sign in"), content,
    account.recovery_codes ? h("div", { class: "recovery-codes" }, h("p", {}, "Save these ten codes now. They are shown only at creation; each can recover your account once. Treat them like passwords."), h("pre", {}, account.recovery_codes.join("\n")), button("Download recovery codes", actions.downloadCodes), button("I saved my codes · hide them", actions.hideCodes)) : null,
    account.problem ? h("p", { class: "notice" }, account.problem) : null, status);
}
