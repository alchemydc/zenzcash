import { spawn } from "node:child_process";

// Every subprocess is bounded, uses argv directly, and drains both pipes to avoid deadlock.
export function runProcess(binary, args, { cwd, env = process.env, input = null, timeoutSeconds = 30, maxStdout = 10 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: true });
    let stdout = "", stderr = "", failure = null;
    const stop = (message) => {
      failure = message;
      if (child.pid) try { process.kill(-child.pid, "SIGKILL"); }
      catch (error) { if (error.code !== "ESRCH") failure += `; stopping process: ${error.message}`; }
    };
    const timer = setTimeout(() => stop(`process exceeded ${timeoutSeconds} seconds`), timeoutSeconds * 1000);
    child.stdout.on("data", (part) => { stdout += part; if (stdout.length > maxStdout) stop("process output exceeds limit"); });
    child.stderr.on("data", (part) => { stderr += part; if (stderr.length > 65536) stop("process diagnostics exceed 64 KiB"); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(new Error(failure));
      else if (code !== 0) reject(new Error(`process exited ${code}: ${stderr.slice(0, 1000)}`));
      else resolve({ stdout, stderr });
    });
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") stop(`process input: ${error.message}`); });
    child.stdin.end(input);
  });
}
