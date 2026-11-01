// The single place that creates DOM nodes. Strings always become text nodes; there is no
// innerHTML anywhere in the site. Link targets from content pass through safeHref.

import { safeHref } from "./markdown.js";

const ALLOWED_ATTRIBUTES = new Set(["class", "id", "title", "type", "value", "rows", "placeholder", "aria-label", "aria-pressed", "aria-expanded", "aria-hidden", "role", "for", "name", "checked", "disabled", "spellcheck", "data-n"]);

// h("div", {class: "x", on: {click: fn}, href: "#/t/1"}, "text", childNode, [more])
// `href` here is for internal navigation only and must start with "#/"; external links go
// through link().
export function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "on") {
      for (const [event, handler] of Object.entries(value)) element.addEventListener(event, handler);
    } else if (name === "href") {
      if (typeof value !== "string" || !value.startsWith("#/")) throw new Error(`h(): internal href must start with "#/", got ${JSON.stringify(value)}`);
      element.setAttribute("href", value);
    } else if (ALLOWED_ATTRIBUTES.has(name)) {
      element.setAttribute(name, value === true ? "" : String(value));
    } else {
      throw new Error(`h(): attribute ${JSON.stringify(name)} is not allowed`);
    }
  }
  append(element, children);
  return element;
}

export function append(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

// Replaces an element's content with the same rules as append(): arrays flatten, strings
// become text, null/undefined/false are skipped. Use this, never raw replaceChildren.
export function replaceContent(element, children) {
  element.replaceChildren();
  return append(element, children);
}

// An external link, or plain text when the target is not a safe http(s) URL.
export function link(href, ...children) {
  const target = safeHref(href);
  if (target === null) return h("span", {}, ...children);
  const anchor = document.createElement("a");
  anchor.setAttribute("href", target);
  anchor.setAttribute("rel", "noopener noreferrer nofollow");
  anchor.setAttribute("target", "_blank");
  return append(anchor, children);
}

export function renderInlines(nodes) {
  return nodes.map((node) => {
    switch (node.type) {
      case "text": return document.createTextNode(node.text);
      case "break": return document.createElement("br");
      case "code": return h("code", {}, node.text);
      case "strong": return h("strong", {}, renderInlines(node.children));
      case "em": return h("em", {}, renderInlines(node.children));
      case "link": return link(node.href, renderInlines(node.children));
      case "image": return link(node.href, `[image${node.alt ? `: ${node.alt}` : ""}]`);
      default: throw new Error(`renderInlines: unknown inline node type ${JSON.stringify(node.type)}`);
    }
  });
}

export function renderBlocks(blocks) {
  return blocks.map((block) => {
    switch (block.type) {
      case "paragraph": return h("p", {}, renderInlines(block.inlines));
      case "heading": return h("p", { class: "md-heading" }, h("strong", {}, renderInlines(block.inlines)));
      case "code": return h("pre", {}, h("code", {}, block.text));
      case "rule": return h("hr");
      case "blockquote": return h("blockquote", { class: "md-quote" }, renderBlocks(block.blocks));
      case "list": return h(block.ordered ? "ol" : "ul", {}, block.items.map((item) => h("li", {}, renderInlines(item))));
      default: throw new Error(`renderBlocks: unknown block type ${JSON.stringify(block.type)}`);
    }
  });
}
