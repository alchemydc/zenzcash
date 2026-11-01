export function checker() {
  const problems = [];
  const report = (where, message) => problems.push(`${where}: ${message}`);
  const exactKeys = (value, keys, where) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      report(where, `expected an object, got ${JSON.stringify(value)?.slice(0, 60)}`);
      return false;
    }
    const actual = Object.keys(value);
    const missing = keys.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !keys.includes(key));
    if (missing.length > 0) report(where, `missing key(s) ${missing.join(", ")}`);
    if (extra.length > 0) report(where, `unexpected key(s) ${extra.join(", ")}`);
    return missing.length === 0;
  };
  const text = (value, max, where) => {
    if (typeof value !== "string" || value.trim() === "") report(where, "must be a non-empty string");
    else if (value.length > max) report(where, `is ${value.length} characters; at most ${max}`);
  };
  const list = (value, min, max, where) => {
    if (!Array.isArray(value)) {
      report(where, "must be an array");
      return [];
    }
    if (value.length < min || value.length > max) report(where, `has ${value.length} entries; expected ${min} to ${max}`);
    return value;
  };
  return { problems, report, exactKeys, text, list };
}
