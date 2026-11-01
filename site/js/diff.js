// Word-level LCS using Hirschberg splits instead of a full quadratic table.
// Whitespace is a token too:
// removing insertions reconstructs the original; removing deletions reconstructs the
// rendition, including punctuation and line breaks.
const tokens = (text) => text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

function lengths(a, b) {
  const row = new Uint32Array(b.length + 1);
  for (const word of a) {
    let diagonal = 0;
    for (let j = 0; j < b.length; j++) {
      const previous = row[j + 1];
      row[j + 1] = word === b[j] ? diagonal + 1 : Math.max(row[j], previous);
      diagonal = previous;
    }
  }
  return row;
}

function compare(a, b, emit) {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) emit("equal", a[prefix++]);
  a = a.slice(prefix);
  b = b.slice(prefix);
  let suffix = 0;
  while (suffix < a.length && suffix < b.length && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++;
  const tail = a.slice(a.length - suffix);
  a = a.slice(0, a.length - suffix);
  b = b.slice(0, b.length - suffix);
  if (a.length === 0) b.forEach((word) => emit("insert", word));
  else if (b.length === 0) a.forEach((word) => emit("delete", word));
  else if (a.length === 1) {
    const index = b.indexOf(a[0]);
    if (index === -1) {
      emit("delete", a[0]);
      b.forEach((word) => emit("insert", word));
    } else {
      b.slice(0, index).forEach((word) => emit("insert", word));
      emit("equal", a[0]);
      b.slice(index + 1).forEach((word) => emit("insert", word));
    }
  } else {
    const middle = Math.floor(a.length / 2);
    const left = a.slice(0, middle);
    const right = a.slice(middle);
    const before = lengths(left, b);
    const after = lengths([...right].reverse(), [...b].reverse());
    let split = 0;
    for (let j = 1; j <= b.length; j++) {
      if (before[j] + after[b.length - j] > before[split] + after[b.length - split]) split = j;
    }
    compare(left, b.slice(0, split), emit);
    compare(right, b.slice(split), emit);
  }
  tail.forEach((word) => emit("equal", word));
}

export function wordDiff(original, rendition) {
  const runs = [];
  compare(tokens(original), tokens(rendition), (kind, text) => {
    if (runs.at(-1)?.kind === kind) runs.at(-1).text += text;
    else runs.push({ kind, text });
  });
  return runs;
}
