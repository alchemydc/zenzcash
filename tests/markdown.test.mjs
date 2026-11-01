import assert from "node:assert/strict";
import test from "node:test";

import { parseBlocks, parseInlines, plainText, safeHref } from "../site/js/markdown.js";

test("blocks: paragraphs, headings, lists, quotes, code, rules", () => {
  const blocks = parseBlocks("# Title\n\nFirst line\nsecond line\n\n- a\n- b\n\n1. one\n\n> quoted\n\n```\ncode *not em*\n```\n\n---");
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "list", "list", "blockquote", "code", "rule"]);
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[3].ordered, true);
  assert.equal(blocks[5].text, "code *not em*");
  assert.deepEqual(blocks[1].inlines, [{ type: "text", text: "First line" }, { type: "break" }, { type: "text", text: "second line" }]);
});

test("inlines: emphasis, code, links, images, bare URLs, escapes", () => {
  assert.deepEqual(parseInlines("**bold** and *em* and `x*y`"), [
    { type: "strong", children: [{ type: "text", text: "bold" }] },
    { type: "text", text: " and " },
    { type: "em", children: [{ type: "text", text: "em" }] },
    { type: "text", text: " and " },
    { type: "code", text: "x*y" },
  ]);
  assert.deepEqual(parseInlines("[docs](https://z.cash/a) see https://example.org/x."), [
    { type: "link", href: "https://z.cash/a", children: [{ type: "text", text: "docs" }] },
    { type: "text", text: " see " },
    { type: "link", href: "https://example.org/x", children: [{ type: "text", text: "https://example.org/x" }] },
    { type: "text", text: "." },
  ]);
  assert.deepEqual(parseInlines("![chart](upload://abc.png)"), [{ type: "image", alt: "chart", href: "upload://abc.png" }]);
  assert.deepEqual(parseInlines("\\*not em\\* snake_case_name"), [{ type: "text", text: "*not em* snake_case_name" }]);
});

test("safeHref allows only http(s) and forum paths", () => {
  assert.equal(safeHref("https://z.cash/x"), "https://z.cash/x");
  assert.equal(safeHref("/t/foo/58515"), "https://forum.zcashcommunity.com/t/foo/58515");
  for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "upload://abc.png", "relative/path", "//evil.example/x", "vbscript:x"]) {
    assert.equal(safeHref(bad), null, bad);
  }
});

test("plainText strips markup for excerpts", () => {
  assert.equal(plainText("**TL;DR** End *ZCG*.\n\n![image|690x469](upload://x.png) [the ZIP](https://x.org)"), "TL;DR End ZCG. [image] the ZIP");
});

test("unknown markup degrades to text, never to markup", () => {
  const nodes = parseInlines("<script>alert(1)</script> [details=x]");
  assert.deepEqual(nodes, [{ type: "text", text: "<script>alert(1)</script> [details=x]" }]);
});

test("loose lists: blank lines between items continue the list and keep its start number", () => {
  const text = (item) => item.map((node) => node.text).join("");
  const loose = parseBlocks("1. one\n\n2. two\n\n\n3. three\n\nafter");
  assert.deepEqual(loose.map((block) => block.type), ["list", "paragraph"]);
  assert.equal(loose[0].start, 1);
  assert.deepEqual(loose[0].items.map(text), ["one", "two", "three"]);
  const fromThree = parseBlocks("3. three\n4. four");
  assert.equal(fromThree[0].start, 3);
  assert.deepEqual(fromThree[0].items.map(text), ["three", "four"]);
  const bullets = parseBlocks("- a\n\n- b\n\n1. one");
  assert.deepEqual(bullets.map((block) => [block.type, block.ordered, block.start, block.items.length]), [["list", false, null, 2], ["list", true, 1, 1]]);
  assert.deepEqual(parseBlocks("1. one\n\n> quote").map((block) => block.type), ["list", "blockquote"]);
});
