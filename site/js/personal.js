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
  return h("button", { class: `companion companion-${id} companion-${mood}`, title: personal ? "Open Zamagotchi settings" : "Sign in to choose a pet", "aria-label": personal ? `${name} Zamagotchi. Emotional benefit ${progress.emotions.toFixed(1)}; new perspectives ${progress.head.toFixed(1)}. Open account and Zamagotchi settings.` : "Sign in to choose a pet and save your Zamagotchi", on: { click: openAccount } },
    companionArt(id),
    h("span", { class: "companion-stars", "aria-hidden": "true" }, "★".repeat(stars), h("span", { class: "unlit-stars" }, "☆".repeat(5 - stars))),
    h("span", { class: "small" }, personal ? "Zamagotchi" : "Sign in to choose a pet"));
}
export function companionArt(id) {
  return h("span", { class: `companion-creature creature-${id}`, "aria-hidden": "true" },
    h("span", { class: "pet-ear pet-ear-left" }), h("span", { class: "pet-ear pet-ear-right" }),
    h("span", { class: "pet-body" }, h("span", { class: "pet-patch" }), h("span", { class: "pet-eye pet-eye-left" }), h("span", { class: "pet-eye pet-eye-right" }), h("span", { class: "pet-cheek pet-cheek-left" }), h("span", { class: "pet-cheek pet-cheek-right" }), h("span", { class: "pet-mouth" })),
    h("span", { class: "pet-foot pet-foot-left" }), h("span", { class: "pet-foot pet-foot-right" }));
}
export function accountPanel(account, actions, request = { phase: "idle", problem: null, message: "", canRecover: true }) {
  const busy = request.phase !== "idle";
  const personal = account.personal;
  const status = h("p", { class: "notice", "aria-live": "polite" });
  const run = (task) => async () => { status.textContent = "Working…"; try { await task(); status.textContent = "Saved."; } catch (error) { status.textContent = error.message; } };
  const button = (label, task) => h("button", { class: "chip", disabled: busy, on: { click: run(task) } }, label);
  const authenticate = (label, mode) => h("button", { class: "chip", disabled: busy || unavailable, on: { click: () => actions.authenticate(mode) } }, label);
  const unavailable = !account.auth_available || !globalThis.PublicKeyCredential;
  const code = h("input", { type: "password", "aria-label": "One recovery code" });
  const recovery = h("details", {}, h("summary", {}, "Recover with one of your codes"),
    h("p", {}, "This creates a new passkey, revokes old passkeys and signs out other sessions. Only the code you use is consumed; your other codes remain valid."), code,
    h("button", { class: "chip", disabled: !request.canRecover || unavailable, on: { click: () => actions.recover(code.value) } }, busy && request.canRecover ? "Cancel sign-in and recover" : "Recover and create a passkey"));
  const guest = h("div", {},
    account.sign_in_reason ? h("p", { class: "notice", role: "status" }, `Sign in to ${account.sign_in_reason}. This saves your choices to your account across devices. `, account.sign_in_return ? h("a", { href: account.sign_in_return }, "Back to reading") : null) : null,
    h("p", {}, "Browse freely. Sign in with a passkey to save posts, read/unread choices, filters and your Zamagotchi across devices. No email or password reset."),
    authenticate("Create account with a passkey", "register"), authenticate("Sign in with a passkey", "login"), recovery,
    unavailable ? h("p", { class: "notice" }, account.auth_problem ?? "This browser does not support passkeys.") : null);
  const members = personal ? h("div", {},
    h("p", {}, `${personal.label} · ${personal.recovery_remaining} recovery codes remaining`),
    h("p", { class: "small" }, "Your latest mood or Heart answer for each post shapes your Zamagotchi’s expression. Head feedback adds stars for broader perspectives. + means helped, 0 means no change, and − means made things worse. It never loses health because you were away."),
    h("div", { class: "companion-options", role: "group", "aria-label": "Choose your Zamagotchi" }, COMPANIONS.map(([id,name]) => h("button", { class: "chip companion-happy", disabled: busy, "aria-pressed": String(personal.appearance === id), on: { click: run(() => actions.appearance(id)) } }, companionArt(id), name))),
    h("p", { class: "small" }, "Changing appearance keeps your progress. Your answers also help the team evaluate re-writes."),
    authenticate("Verify again with passkey", "login"), authenticate("Add another passkey", "add"),
    button("Sign out", () => actions.control("logout")), button("Sign out other devices", () => actions.control("revoke-others")),
    h("details", {}, h("summary", {}, "Recovery codes and account deletion"),
      h("p", {}, "Adding a passkey, replacing codes or deleting your account requires verification within five minutes. If all passkeys and codes are lost, you must create a new account."),
      button("Replace all remaining recovery codes", () => actions.control("replace-codes")),
      h("details", {}, h("summary", {}, "Delete this account permanently"), h("p", {}, "Deletes your credentials, recovery codes and personal reading/feedback data. This cannot be undone."), button("Permanently delete my account", () => actions.control("delete")))),
    button("Import this browser’s current filters into my account", () => actions.importSettings())) : null;
  const content = account.sign_in_url ? h("div", {},
    h("p", { class: "notice" }, "Accounts use a different website address. Open the link below to create an account or sign in."),
    link(account.sign_in_url, `Open ${account.sign_in_url}`)) : members ?? guest;
  const codes = account.recovery_codes ? h("section", { class: "recovery-codes", "aria-label": "Save your recovery codes" },
    h("h2", {}, "Save your recovery codes now"),
    h("p", {}, "Keep these ten codes somewhere private, such as your password manager. Each can recover your account once. They are only shown on this page until you hide them or reload."),
    h("button", { class: "chip", on: { click: actions.downloadCodes } }, "Download recovery codes"),
    h("pre", {}, account.recovery_codes.join("\n")),
    h("button", { class: "chip", on: { click: actions.hideCodes } }, "I saved my codes · hide them")) : null;
  return h("section", { id: "account-panel", class: "account-panel card" }, h("h1", {}, personal ? "Profile" : "Sign in"),
    codes,
    h("div", { class: "passkey-status", role: "status", "aria-live": "polite" },
      request.message || request.problem ? h("p", { class: "notice" }, request.message || request.problem) : null,
      ["starting", "waiting"].includes(request.phase) ? h("button", { class: "chip", on: { click: actions.cancelAuthentication } }, "Cancel passkey request") : null),
    account.problem ? h("p", { class: "notice" }, account.problem) : null,
    account.auth_origin && new URL(account.auth_origin).hostname === "localhost" ? h("p", { class: "notice" }, "Local preview: passkeys created on zenzcash.com do not work here. Create a separate test account for localhost. Preview accounts and recovery codes do not carry over to the live site.") : null,
    status, content);
}
