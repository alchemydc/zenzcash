export function importTimestamp(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text.replace(/Z$/, text.includes(".") ? "Z" : ".000Z")) {
    throw new Error(`Expected an exact UTC timestamp YYYY-MM-DDTHH:mm:ssZ, received ${JSON.stringify(text)}`);
  }
  return new Date(text).toISOString();
}
