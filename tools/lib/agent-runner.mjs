import { runProcess } from "./process.mjs";
import { existsSync, realpathSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { parseStrictJson } from "./strict-json.mjs";

function executable(name) {
  const found = process.env.PATH.split(delimiter).map((directory) => join(directory,name)).find((file) => existsSync(file));
  if (!found) throw new Error(`required executable ${name} is unavailable`);
  return realpathSync(found);
}
export function runnerArguments(agent, model, budget) {
  if (typeof model !== "string" || !model.trim() || model.startsWith("-")) throw new Error("choose an explicit model id");
  if (agent === "codex") return ["exec", "--model", model, "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--json", "-c", "features.shell_tool=false", "-c", "features.unified_exec=false", "-c", "web_search=\"disabled\"", "--output-last-message", "/workspace/answer.json", "-"];
  if (agent === "claude") return ["-p", "--model", model, "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "", "--permission-mode", "dontAsk", "--output-format", "json", "--max-budget-usd", String(budget)];
  throw new Error(`unsupported agent ${agent}`);
}
export function isolatedArguments(binary, workspace, home, authFile, args) {
  const mount = ["--unshare-all", "--share-net", "--new-session", "--die-with-parent", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", home, "--bind", workspace, "/workspace"];
  for (const path of ["/usr", "/bin", "/lib", "/lib64", "/etc/ssl", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/ld.so.cache"]) if (existsSync(path)) mount.push("--ro-bind", path, path);
  if (authFile !== null) mount.push("--dir",dirname(authFile),"--ro-bind",authFile,authFile);
  // Preserve installation-relative module lookup for CLI launchers under /usr.
  return [...mount, "--ro-bind", binary, binary, "--chdir", "/workspace", "--", binary, ...args];
}
export async function runAgent({ agent, model, prompt, timeoutSeconds, budget }) {
  const binary = executable(agent), bubblewrap = executable("bwrap");
  const home = process.env.HOME;
  if (typeof home !== "string" || !home.startsWith("/")) throw new Error("runner requires an absolute home directory");
  const authFile = agent === "codex" ? join(home,".codex","auth.json") : join(home,".claude",".credentials.json");
  const apiKey = agent === "codex" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const environment = { PATH: "/usr/bin:/bin", HOME: home, LANG: "C.UTF-8", TERM: "dumb" };
  if (process.env[apiKey]) environment[apiKey] = process.env[apiKey];
  if (!existsSync(authFile) && !environment[apiKey]) throw new Error(`${agent} needs operator authentication; no model request was made`);
  const cli = runnerArguments(agent,model,budget);
  const directory = join(tmpdir(),`zforum-analysis-${randomUUID()}`); mkdirSync(directory,{mode:0o700});
  const started=Date.now();
  try {
    writeFileSync(join(directory,"input.md"),prompt,{mode:0o600});
    const args = isolatedArguments(binary,directory,home,existsSync(authFile)?authFile:null,cli);
    const runtime = (await runProcess(bubblewrap, isolatedArguments(binary,directory,home,null,["--version"]), { cwd: directory, env: environment, timeoutSeconds: 10, maxStdout: 4096 })).stdout.trim();
    const result = await runProcess(bubblewrap,args,{cwd:directory,env:environment,input:prompt,timeoutSeconds});
    if(agent==="codex") {
      const events=result.stdout.trim().split("\n").filter(Boolean).map((line)=>parseStrictJson(line,"Codex event"));
      const completed=events.findLast((event)=>event.type==="turn.completed");
      return {output:parseStrictJson(readFileSync(join(directory,"answer.json"),"utf8"),"Codex output"),runtime,reported_model:null,usage:completed?.usage??null,cost_usd:null,elapsed_ms:Date.now()-started};
    }
    const resultJson=parseStrictJson(result.stdout,"Claude result");
    if(resultJson.is_error)throw new Error(`Claude job failed: ${resultJson.subtype}`);
    return {output:parseStrictJson(resultJson.result,"Claude output"),runtime,reported_model:resultJson.modelUsage?Object.keys(resultJson.modelUsage):null,usage:resultJson.usage??null,cost_usd:resultJson.total_cost_usd??null,elapsed_ms:Date.now()-started};
  } finally {rmSync(directory,{recursive:true,force:true});}
}
