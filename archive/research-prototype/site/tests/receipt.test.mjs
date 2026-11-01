import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { b64urlDecode, b64urlEncode, canonicalJson, codePointLength, logPosition, normalizeDraft, stripWhitespace, verifyLog, verifyPost } from "../js/receipt.js";

const vectors = JSON.parse(readFileSync(new URL("../../tests/vectors/receipt-v1.json", import.meta.url), "utf8"));
const keyring = [{ kid: vectors.kid, public_key: vectors.public_key_b64url }];

test("normalisation matches the vector", () => {
  assert.equal(normalizeDraft(vectors.draft_input), vectors.draft_normalized);
});

test("canonical JSON matches the vector byte for byte", () => {
  assert.equal(canonicalJson(vectors.payload), vectors.payload_canonical);
});

test("the vector post verifies", async () => {
  const result = await verifyPost(vectors.post, keyring);
  assert.equal(result.ok, true);
  assert.equal(result.draft, vectors.draft_normalized);
  assert.deepEqual(result.payload, vectors.payload);
});

test("the vector post verifies with CRLF and surrounding whitespace", async () => {
  const result = await verifyPost("\n " + vectors.post.replaceAll("\n", "\r\n") + "\n", keyring);
  assert.equal(result.ok, true);
});

for (const rejection of vectors.rejections) {
  test(`rejection vector: ${rejection.name}`, async () => {
    assert.deepEqual(await verifyPost(rejection.post, keyring), { ok: false, reason: rejection.reason });
  });
}

test("the log vector chain verifies and locates entries", async () => {
  const log = await verifyLog(vectors.log.entries, keyring);
  assert.equal(log.ok, true);
  assert.equal(log.head, vectors.log.head);
  const verified = await verifyPost(vectors.post, keyring);
  assert.deepEqual(logPosition(log, verified), { inLog: true, seq: 0, total: 2, sameTopic: 2, sameDraft: 2 });
});

test("a log with entries swapped is rejected", async () => {
  const log = await verifyLog([...vectors.log.entries].reverse(), keyring);
  assert.deepEqual(log, { ok: false, reason: "log entry 0 has seq 1" });
});

test("base64url round trips and rejects non-canonical forms", () => {
  for (let length = 0; length < 40; length += 1) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + length) & 255);
    assert.deepEqual(b64urlDecode(b64urlEncode(bytes), "x"), bytes);
  }
  assert.throws(() => b64urlDecode("YR", "field"), { message: "field is not in canonical base64url form" });
  assert.throws(() => b64urlDecode("Y", "field"), { message: "field is not unpadded base64url" });
  assert.throws(() => b64urlDecode("YQ=", "field"), { message: "field is not unpadded base64url" });
});

test("whitespace follows Python str.isspace, not String.prototype.trim", () => {
  assert.equal(stripWhitespace("\u001c x \u0085"), "x");
  assert.equal(stripWhitespace("﻿x"), "﻿x");
});

test("lengths count code points, as the Python reference does", () => {
  assert.equal(codePointLength("a😀b"), 3);
  assert.throws(() => normalizeDraft("😀\rx"), { message: "draft contains a carriage return that is not part of CRLF (at index 1)" });
});

test("inspectDraft reports the receipt hash or the reason", async () => {
  const { inspectDraft } = await import("../js/receipt.js");
  assert.deepEqual(await inspectDraft(vectors.draft_input), { ok: true, draft: vectors.draft_normalized, sha256: vectors.draft_sha256, chars: [...vectors.draft_normalized].length });
  assert.deepEqual(await inspectDraft("  \n "), { ok: false, reason: "draft is empty" });
});
