// A small markdown reader for forum posts. It produces a plain tree, never HTML: the tree is
// turned into DOM nodes by dom.js using text nodes only, so post content can never become
// markup. Unsupported syntax is shown as the text it is.

const FENCE = /^```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const QUOTE_LINE = /^>\s?(.*)$/;

export function parseBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
    } else if (FENCE.test(line)) {
      const body = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) body.push(lines[index++]);
      index += 1;
      blocks.push({ type: "code", text: body.join("\n") });
    } else if (HEADING.test(line)) {
      const [, hashes, text] = HEADING.exec(line);
      blocks.push({ type: "heading", level: hashes.length, inlines: parseInlines(text) });
      index += 1;
    } else if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
    } else if (QUOTE_LINE.test(line)) {
      const body = [];
      while (index < lines.length && QUOTE_LINE.test(lines[index])) body.push(QUOTE_LINE.exec(lines[index++])[1]);
      blocks.push({ type: "blockquote", blocks: parseBlocks(body.join("\n")) });
    } else if (LIST_ITEM.test(line)) {
      const ordered = LIST_ITEM.exec(line)[2] !== undefined;
      const items = [];
      while (index < lines.length && LIST_ITEM.test(lines[index])) {
        const match = LIST_ITEM.exec(lines[index++]);
        if ((match[2] !== undefined) !== ordered) {
          index -= 1;
          break;
        }
        items.push(parseInlines(match[3]));
      }
      blocks.push({ type: "list", ordered, items });
    } else {
      const body = [];
      while (index < lines.length && lines[index].trim() !== "" && !FENCE.test(lines[index]) && !HEADING.test(lines[index])
        && !QUOTE_LINE.test(lines[index]) && !LIST_ITEM.test(lines[index]) && !RULE.test(lines[index])) {
        body.push(lines[index++]);
      }
      blocks.push({ type: "paragraph", inlines: parseInlines(body.join("\n")) });
    }
  }
  return blocks;
}

const INLINE_RULES = [
  ["escape", /^\\([\\`*_{}[\]()#+\-.!>~|])/],
  ["code", /^`([^`\n]+)`/],
  ["image", /^!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/],
  ["link", /^\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/],
  ["strong", /^\*\*(?=\S)([\s\S]*?\S)\*\*/],
  ["strong", /^__(?=\S)([\s\S]*?\S)__(?!\w)/],
  ["em", /^\*(?=[^\s*])([\s\S]*?[^\s*])\*/],
  ["em", /^_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/],
  ["url", /^https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"*_]/],
  ["break", /^\n/],
];

function pushText(nodes, text) {
  const last = nodes[nodes.length - 1];
  if (last && last.type === "text") last.text += text;
  else nodes.push({ type: "text", text });
}

export function parseInlines(text) {
  const nodes = [];
  let rest = text;
  let previous = "";
  while (rest.length > 0) {
    let matched = false;
    for (const [type, pattern] of INLINE_RULES) {
      if ((type === "em" || type === "strong") && rest[0] === "_" && /\w/.test(previous)) continue;
      const match = pattern.exec(rest);
      if (!match) continue;
      if (type === "escape") pushText(nodes, match[1]);
      else if (type === "code") nodes.push({ type: "code", text: match[1] });
      else if (type === "image") nodes.push({ type: "image", alt: match[1], href: match[2] });
      else if (type === "link") nodes.push({ type: "link", href: match[2], children: parseInlines(match[1]) });
      else if (type === "url") nodes.push({ type: "link", href: match[0], children: [{ type: "text", text: match[0] }] });
      else if (type === "break") nodes.push({ type: "break" });
      else nodes.push({ type, children: parseInlines(match[1]) });
      previous = match[0][match[0].length - 1];
      rest = rest.slice(match[0].length);
      matched = true;
      break;
    }
    if (!matched) {
      pushText(nodes, rest[0]);
      previous = rest[0];
      rest = rest.slice(1);
    }
  }
  return nodes;
}

const FORUM_ORIGIN = "https://forum.zcashcommunity.com";

// The only way a URL from post content becomes a link target: http(s) URLs, and paths on
// the forum resolved against the forum's origin. Anything else (javascript:, data:, ...)
// is not a link and renders as text.
export function safeHref(href) {
  let url;
  try {
    url = new URL(href, FORUM_ORIGIN);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (/^https?:\/\//i.test(href)) return url.href;
  // A relative link must stay on the forum: "//host/x" is protocol-relative and leaves it.
  if (href.startsWith("/") && !href.startsWith("//") && url.origin === FORUM_ORIGIN) return url.href;
  return null;
}

function inlineText(nodes) {
  return nodes.map((node) => {
    switch (node.type) {
      case "text": return node.text;
      case "break": return " ";
      case "code": return node.text;
      case "image": return "[image]";
      case "strong": case "em": case "link": return inlineText(node.children);
      default: throw new Error(`inlineText: unknown inline node type ${JSON.stringify(node.type)}`);
    }
  }).join("");
}

function blockText(block) {
  switch (block.type) {
    case "paragraph": case "heading": return inlineText(block.inlines);
    case "code": return block.text;
    case "rule": return "";
    case "blockquote": return block.blocks.map(blockText).join(" ");
    case "list": return block.items.map(inlineText).join("; ");
    default: throw new Error(`blockText: unknown block type ${JSON.stringify(block.type)}`);
  }
}

// Markdown reduced to its readable text, for excerpts.
export function plainText(markdown) {
  return parseBlocks(markdown).map(blockText).filter((text) => text !== "").join(" ");
}
