// Client-side verification of zforum check receipts (format zfr1, SPEC.md section 12).
// An independent implementation of zforum/attest/receipt.py, checked against the same
// test vectors (tests/vectors/receipt-v1.json). Uses only WebCrypto: Ed25519 and SHA-256.

export const RECEIPT_LINE_PREFIX = "zforum-receipt: ";
const SIGNING_DOMAIN = new TextEncoder().encode("zforum-receipt-v1\u0000");
const LOG_DOMAIN = new TextEncoder().encode("zforum-log-v1\u0000");
const GENESIS_PREVIOUS = "0".repeat(64);
const MAX_PAYLOAD_INTEGER = Number.MAX_SAFE_INTEGER;
const RECEIPT_PATTERN = /^zfr1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;
const COUNT_FIELDS = ["repetitions", "contradicted", "supported", "unsourced", "tone", "novel_claims"];

// Whitespace as the format defines it: exactly the characters Python's str.isspace()
// accepts. JavaScript's trim() differs (it strips U+FEFF and keeps U+001C-U+001F, U+0085).
const WHITESPACE = new Set([
  "\t", "\n", "\u000b", "\u000c", "\r", "\u001c", "\u001d", "\u001e", "\u001f", " ", "\u0085", " ",
  " ", " ", " ", " ", " ", " ", " ", " ", " ", " ",
  " ", " ", " ", " ", " ", " ", "　",
]);

class Rejected extends Error {}

function rejected(reason) {
  return new Rejected(reason);
}

export function stripWhitespace(text) {
  const characters = [...text];
  let start = 0;
  let end = characters.length;
  while (start < end && WHITESPACE.has(characters[start])) start += 1;
  while (end > start && WHITESPACE.has(characters[end - 1])) end -= 1;
  return characters.slice(start, end).join("");
}

function rstripWhitespace(text) {
  const characters = [...text];
  let end = characters.length;
  while (end > 0 && WHITESPACE.has(characters[end - 1])) end -= 1;
  return characters.slice(0, end).join("");
}

export function codePointLength(text) {
  return [...text].length;
}

export function normalizeDraft(text) {
  const withLf = text.replaceAll("\r\n", "\n");
  const carriageReturn = withLf.indexOf("\r");
  if (carriageReturn !== -1) {
    throw rejected(`draft contains a carriage return that is not part of CRLF (at index ${codePointLength(withLf.slice(0, carriageReturn))})`);
  }
  const normalized = stripWhitespace(withLf);
  if (normalized === "") throw rejected("draft is empty");
  normalized.split("\n").forEach((line, index) => {
    if (line.startsWith(RECEIPT_LINE_PREFIX)) throw rejected(`draft already contains a receipt line (line ${index + 1})`);
  });
  return normalized;
}

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function b64urlEncode(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const symbols = index + 2 < bytes.length ? 4 : index + 1 < bytes.length ? 3 : 2;
    for (let position = 0; position < symbols; position += 1) output += B64_ALPHABET[(chunk >> (18 - 6 * position)) & 63];
  }
  return output;
}

export function b64urlDecode(text, what) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw rejected(`${what} is not unpadded base64url`);
  const bytes = [];
  for (let index = 0; index < text.length; index += 4) {
    const group = text.slice(index, index + 4);
    const values = [...group].map((symbol) => B64_ALPHABET.indexOf(symbol));
    const chunk = values.reduce((accumulator, value, position) => accumulator | (value << (18 - 6 * position)), 0);
    bytes.push((chunk >> 16) & 255);
    if (group.length > 2) bytes.push((chunk >> 8) & 255);
    if (group.length > 3) bytes.push(chunk & 255);
  }
  const decoded = Uint8Array.from(bytes);
  if (b64urlEncode(decoded) !== text) throw rejected(`${what} is not in canonical base64url form`);
  return decoded;
}

// Canonical JSON: sorted keys, no insignificant whitespace, UTF-8. Matches Python's
// json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False) for the values a
// valid payload can contain (ASCII keys, safe integers, well-formed strings).
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isHex64(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isInteger(value, minimum) {
  return Number.isInteger(value) && value >= minimum && value <= MAX_PAYLOAD_INTEGER;
}

function exactKeys(object, keys) {
  return object !== null && typeof object === "object" && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key));
}

function checkPayload(payload) {
  const fields = ["v", "kid", "seq", "prev", "issued_at", "topic_id", "draft_sha256", "draft_chars", "corpus_sha256", "checker", "findings_sha256", "counts"];
  if (!exactKeys(payload, fields)) throw rejected("payload does not have exactly the zfr1 fields");
  const checks = [
    ["v", payload.v === 1],
    ["kid", typeof payload.kid === "string" && /^[0-9a-f]{16}$/.test(payload.kid)],
    ["seq", isInteger(payload.seq, 0)],
    ["prev", isHex64(payload.prev)],
    ["issued_at", typeof payload.issued_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.issued_at)],
    ["topic_id", isInteger(payload.topic_id, 1)],
    ["draft_sha256", isHex64(payload.draft_sha256)],
    ["draft_chars", isInteger(payload.draft_chars, 1)],
    ["corpus_sha256", isHex64(payload.corpus_sha256)],
    ["findings_sha256", isHex64(payload.findings_sha256)],
    ["checker", exactKeys(payload.checker, ["task", "prompt_sha256", "backend", "model"])
      && payload.checker.task === "check_draft" && isHex64(payload.checker.prompt_sha256)
      && ["subagent", "anthropic-api"].includes(payload.checker.backend)
      && typeof payload.checker.model === "string" && payload.checker.model.length >= 1 && codePointLength(payload.checker.model) <= 100],
    ["counts", exactKeys(payload.counts, COUNT_FIELDS) && COUNT_FIELDS.every((field) => isInteger(payload.counts[field], 0))],
  ];
  const failed = checks.find(([, ok]) => !ok);
  if (failed) throw rejected(`payload field ${failed[0]} is invalid`);
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concatBytes(first, second) {
  const joined = new Uint8Array(first.length + second.length);
  joined.set(first, 0);
  joined.set(second, first.length);
  return joined;
}

async function importKeyring(keyring) {
  const imported = new Map();
  for (const entry of keyring) {
    const raw = b64urlDecode(entry.public_key, `public key ${entry.kid}`);
    if (raw.length !== 32) throw new Error(`keyring key ${entry.kid} is ${raw.length} bytes; Ed25519 public keys are 32`);
    if ((await sha256Hex(raw)).slice(0, 16) !== entry.kid) throw new Error(`keyring kid ${entry.kid} does not match its public key`);
    imported.set(entry.kid, await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]));
  }
  return imported;
}

async function decodeReceipt(wire, keys) {
  const match = RECEIPT_PATTERN.exec(wire);
  if (!match) throw rejected("receipt does not have the form zfr1.<payload>.<signature>");
  const payloadBytes = b64urlDecode(match[1], "payload");
  const signature = b64urlDecode(match[2], "signature");
  if (signature.length !== 64) throw rejected(`signature is ${signature.length} bytes; Ed25519 signatures are 64`);
  let text;
  let parsed;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
    parsed = JSON.parse(text);
  } catch (error) {
    throw rejected(`receipt payload: not valid UTF-8 JSON (${error.message})`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.kid !== "string") {
    throw rejected("payload is not an object with a kid");
  }
  const key = keys.get(parsed.kid);
  if (!key) throw rejected(`receipt is signed by unknown key '${parsed.kid}'`);
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, key, signature, concatBytes(SIGNING_DOMAIN, payloadBytes));
  if (!valid) throw rejected("signature does not verify");
  checkPayload(parsed);
  if (canonicalJson(parsed) !== text) throw rejected("payload is not canonical JSON");
  return { payload: parsed, payloadBytes };
}

// Returns {ok: true, draft, payload, payloadBytes} or {ok: false, reason}. Never throws for
// a bad post: every failure is a result the caller must look at.
export async function verifyPost(postText, keyring) {
  const keys = await importKeyring(keyring);
  try {
    const text = stripWhitespace(postText.replaceAll("\r\n", "\n"));
    const lastBreak = text.lastIndexOf("\n");
    const before = lastBreak === -1 ? "" : text.slice(0, lastBreak);
    const lastLine = text.slice(lastBreak + 1);
    if (!lastLine.startsWith(RECEIPT_LINE_PREFIX)) throw rejected("the post's last line is not a zforum-receipt line");
    const body = before.endsWith("\n") ? before.slice(0, -1) : before;
    if (body === before || body === "" || body !== rstripWhitespace(body)) {
      throw rejected("the receipt line must follow the post body after exactly one blank line");
    }
    let draft;
    try {
      draft = normalizeDraft(body);
    } catch (error) {
      if (error instanceof Rejected) throw rejected(`the post body is not a valid draft: ${error.message}`);
      throw error;
    }
    if (draft !== body) throw rejected("the post body is not a valid draft: DraftText must already be normalised; construct it with DraftText.parse");
    const { payload, payloadBytes } = await decodeReceipt(lastLine.slice(RECEIPT_LINE_PREFIX.length), keys);
    if (payload.draft_sha256 !== (await sha256Hex(new TextEncoder().encode(draft)))) {
      throw rejected("the post body differs from the draft the receipt covers");
    }
    if (payload.draft_chars !== codePointLength(draft)) throw rejected("the receipt's draft_chars does not match the post body");
    return { ok: true, draft, payload, payloadBytes };
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, reason: error.message };
    throw error;
  }
}

export async function logEntryHash(payloadBytes) {
  return sha256Hex(concatBytes(LOG_DOMAIN, payloadBytes));
}

// Verifies the whole log chain and locates a receipt in it.
// Returns {ok: true, entries: [{payload, payloadBytes}], head} or {ok: false, reason}.
export async function verifyLog(wires, keyring) {
  const keys = await importKeyring(keyring);
  const entries = [];
  let previous = GENESIS_PREVIOUS;
  try {
    for (const [index, wire] of wires.entries()) {
      const entry = await decodeReceipt(wire, keys);
      if (entry.payload.seq !== index) throw rejected(`log entry ${index} has seq ${entry.payload.seq}`);
      if (entry.payload.prev !== previous) throw rejected(`log entry ${index} has prev ${entry.payload.prev}, expected ${previous}`);
      previous = await logEntryHash(entry.payloadBytes);
      entries.push(entry);
    }
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, reason: error.message };
    throw error;
  }
  return { ok: true, entries, head: previous };
}

export function bytesEqual(first, second) {
  return first.length === second.length && first.every((byte, index) => byte === second[index]);
}

// Where a verified receipt sits in a verified log, and how many other checks were issued
// for the same topic and the same draft: the log is what makes re-checking visible.
export function logPosition(verifiedLog, verified) {
  const { seq, topic_id: topicId, draft_sha256: draftSha } = verified.payload;
  const entry = verifiedLog.entries[seq];
  const inLog = entry !== undefined && bytesEqual(entry.payloadBytes, verified.payloadBytes);
  const sameTopic = verifiedLog.entries.filter((candidate) => candidate.payload.topic_id === topicId).length;
  const sameDraft = verifiedLog.entries.filter((candidate) => candidate.payload.draft_sha256 === draftSha).length;
  return { inLog, seq, total: verifiedLog.entries.length, sameTopic, sameDraft };
}

// For the compose form: the draft as a receipt would hash it, or why it cannot be checked.
export async function inspectDraft(text) {
  try {
    const draft = normalizeDraft(text);
    return { ok: true, draft, sha256: await sha256Hex(new TextEncoder().encode(draft)), chars: codePointLength(draft) };
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, reason: error.message };
    throw error;
  }
}
