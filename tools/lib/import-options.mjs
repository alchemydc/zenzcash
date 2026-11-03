import { importTimestamp } from "./import-store.mjs";

export function parseImportArgs(args) {
  const values = [...args];
  const stages = ["fetch","preview","analyze","publish"];
  const stage = stages.includes(values[0]) ? values.shift() : "fetch";
  let since;
  if (values[0] && !values[0].startsWith("--")) since = importTimestamp(values.shift());
  const flags = {};
  for (let i=0;i<values.length;i+=2) {
    const key=values[i],value=values[i+1];
    if (!["--db","--thread","--max-calls"].includes(key) || value === undefined || value.startsWith("--") || key in flags) throw new Error(`Invalid or repeated import option ${key}`);
    flags[key]=value;
  }
  if (stage !== "fetch" && (since !== undefined || flags["--thread"] !== undefined)) throw new Error(`${stage} uses the frozen run; timestamp and --thread apply only to fetch`);
  const positive = key => {
    const value=flags[key];
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${key} must be a positive integer, received ${JSON.stringify(value)}`);
    return Number(value);
  };
  if (stage === "analyze" && flags["--max-calls"] === undefined) throw new Error("analyze requires --max-calls N (global attempt limit, including retries)");
  if (stage !== "analyze" && flags["--max-calls"] !== undefined) throw new Error("--max-calls applies only to analyze");
  if (flags["--db"] === "") throw new Error("--db must name a database file");
  return {stage,since,db:flags["--db"],thread:flags["--thread"] === undefined ? undefined : positive("--thread"),
    maxCalls:stage === "analyze" ? positive("--max-calls") : 0};
}
