// Discourse quote blocks in raw markdown: `[quote="alice, post:12, topic:58515"] ... [/quote]`.
// Ported from archive/research-prototype/zforum/quotes.py, keeping its rules: an opening tag
// counts only if a closing tag matches it (an unmatched tag is literal text, as the forum
// shows it), tags are case-insensitive and may nest, and only outermost blocks are split out.

const TAG = /\[quote(?:=("[^"\]\n]*"|[^\]\n]*))?\]|(\[\/quote\])/gi;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;

// `"alice, post:12, topic:58515"`, or unquoted, or with `username:` naming the account when
// the first field is a display name. Without a complete post/topic reference the source
// still has a name, just no link.
export function parseQuoteParam(param) {
  const value = param.length >= 2 && param.startsWith('"') && param.endsWith('"') ? param.slice(1, -1) : param;
  const [name, ...rest] = value.split(",").map((part) => part.trim());
  const fields = new Map();
  for (const part of rest) {
    const colon = part.indexOf(":");
    if (colon !== -1) fields.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  const username = fields.get("username") ?? name;
  const post = fields.get("post") ?? "";
  const topic = fields.get("topic") ?? "";
  if (POSITIVE_DECIMAL.test(post) && POSITIVE_DECIMAL.test(topic)) return { name, username, post: Number(post), topic: Number(topic) };
  return { name, username, post: null, topic: null };
}

function orderedSegments(markdown) {
  const openers = [];
  const pairs = [];
  for (const match of markdown.matchAll(TAG)) {
    if (match[2] === undefined) openers.push(match);
    else if (openers.length > 0) pairs.push([openers.pop(), match]);
  }
  const end = (match) => match.index + match[0].length;
  const outermost = pairs
    .filter(([opener, closer]) => !pairs.some(([otherOpen, otherClose]) => otherOpen.index < opener.index && end(closer) < end(otherClose)))
    .sort((a, b) => a[0].index - b[0].index);
  const ordered = [];
  let cursor = 0;
  for (const [opener, closer] of outermost) {
    ordered.push({ text: markdown.slice(cursor, opener.index), quote: null });
    const param = opener[1];
    const source = param !== undefined && param.trim() !== "" ? parseQuoteParam(param) : null;
    ordered.push({ text: "", quote: { source, text: markdown.slice(end(opener), closer.index).replace(/^\n+|\n+$/g, "") } });
    cursor = end(closer);
  }
  ordered.push({ text: markdown.slice(cursor), quote: null });
  return ordered;
}

// The author's own words, with every outermost quote block removed.
export function ownText(markdown) {
  return orderedSegments(markdown)
    .filter((piece) => piece.quote === null)
    .map((piece) => piece.text)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The post in reading order: own-text pieces (outer blank lines trimmed, blank pieces
// dropped) interleaved with the quote blocks they answer.
export function segments(markdown) {
  const result = [];
  for (const piece of orderedSegments(markdown)) {
    if (piece.quote !== null) result.push({ kind: "quote", source: piece.quote.source, text: piece.quote.text });
    else if (piece.text.trim() !== "") result.push({ kind: "text", text: piece.text.replace(/^\n+|\n+$/g, "") });
  }
  return result;
}
