// JSON as RFC 8259 defines it, with one extra rule: an object may not repeat a key.
// JSON.parse keeps the last duplicate silently, which would let a model output say two
// things at once. Used at every boundary where a file we did not write is read.

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const WHITESPACE = /[ \t\n\r]*/y;

export function parseStrictJson(text, sourceName) {
  let position = 0;
  const fail = (message) => {
    throw new Error(`${sourceName}: invalid JSON at offset ${position}: ${message}`);
  };
  const skipWhitespace = () => {
    WHITESPACE.lastIndex = position;
    WHITESPACE.exec(text);
    position = WHITESPACE.lastIndex;
  };
  const expectLiteral = (literal, value) => {
    if (text.startsWith(literal, position)) {
      position += literal.length;
      return value;
    }
    return fail(`expected ${literal}`);
  };
  const parseString = () => {
    const start = position;
    position += 1;
    while (position < text.length) {
      const character = text[position];
      if (character === '"') {
        position += 1;
        try {
          return JSON.parse(text.slice(start, position));
        } catch (error) {
          return fail(`bad string escape (${error.message})`);
        }
      }
      if (character === "\\") position += 2;
      else if (character < " ") fail("control character in string");
      else position += 1;
    }
    return fail("unterminated string");
  };
  const parseValue = () => {
    skipWhitespace();
    const character = text[position];
    if (character === "{") return parseObject();
    if (character === "[") return parseArray();
    if (character === '"') return parseString();
    if (character === "t") return expectLiteral("true", true);
    if (character === "f") return expectLiteral("false", false);
    if (character === "n") return expectLiteral("null", null);
    NUMBER.lastIndex = position;
    const match = NUMBER.exec(text);
    if (match === null) return fail(`unexpected ${character === undefined ? "end of input" : JSON.stringify(character)}`);
    position = NUMBER.lastIndex;
    return Number(match[0]);
  };
  const parseArray = () => {
    position += 1;
    const items = [];
    skipWhitespace();
    if (text[position] === "]") {
      position += 1;
      return items;
    }
    for (;;) {
      items.push(parseValue());
      skipWhitespace();
      if (text[position] === ",") position += 1;
      else if (text[position] === "]") {
        position += 1;
        return items;
      } else fail("expected , or ] in array");
    }
  };
  const parseObject = () => {
    position += 1;
    const object = {};
    const keys = new Set();
    skipWhitespace();
    if (text[position] === "}") {
      position += 1;
      return object;
    }
    for (;;) {
      skipWhitespace();
      if (text[position] !== '"') fail("expected a string key");
      const keyStart = position;
      const key = parseString();
      if (keys.has(key)) {
        position = keyStart;
        fail(`duplicate key ${JSON.stringify(key)}`);
      }
      keys.add(key);
      skipWhitespace();
      if (text[position] !== ":") fail("expected :");
      position += 1;
      Object.defineProperty(object, key, { value: parseValue(), enumerable: true, writable: true, configurable: true });
      skipWhitespace();
      if (text[position] === ",") position += 1;
      else if (text[position] === "}") {
        position += 1;
        return object;
      } else fail("expected , or } in object");
    }
  };
  const value = parseValue();
  skipWhitespace();
  if (position !== text.length) fail("trailing content after the JSON value");
  return value;
}
