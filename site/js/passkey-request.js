import { credentialOptions, credentialJSON } from "./personal.js";

export const PASSKEY_STATUS = {
  idle: "",
  starting: "Starting passkey verification…",
  waiting: "Waiting for your browser’s passkey prompt. Check your browser, password manager or device dialog; it may be behind this window. You can cancel below and try again.",
  verifying: "Verifying your passkey with Zenzcash…",
};

function problemMessage(error) {
  if (error.name === "NotAllowedError") return "No passkey was received. The prompt may have been dismissed, timed out, or found no matching passkey. Try again using the browser or password manager where you saved it, or recover with a code.";
  if (error.name === "InvalidStateError") return "A matching passkey already exists, or your browser still has a passkey request open. Close that prompt, then sign in or try again.";
  return `Passkey verification failed: ${error.message}`;
}

// Owns the ceremony across page rerenders. Cancellation stops the browser prompt,
// but cannot interrupt the final server commit and lose newly issued recovery codes.
export function passkeyRequest({ start, finish, credentials, changed, completed }) {
  let phase = "idle", problem = null, controller = null;
  const change = (next) => { phase = next; changed(); };
  return {
    get state() { return { phase, problem, message: PASSKEY_STATUS[phase] }; },
    cancel() {
      if (phase === "starting" || phase === "waiting") controller.abort(new DOMException("Passkey request cancelled. You can try again.", "AbortError"));
    },
    async run(mode, code = null) {
      if (phase !== "idle") return;
      controller = new AbortController();
      const { signal } = controller;
      problem = null;
      change("starting");
      const timer = setTimeout(() => controller.abort(new DOMException("Passkey request timed out. You can try again.", "TimeoutError")), 120000);
      try {
        const options = await start(mode, code, signal);
        signal.throwIfAborted();
        const create = mode !== "login";
        change("waiting");
        const credential = await credentials[create ? "create" : "get"]({ ...credentialOptions(options, create), signal });
        signal.throwIfAborted();
        if (!credential) throw new DOMException("No passkey received", "NotAllowedError");
        clearTimeout(timer);
        change("verifying");
        const result = await finish(credentialJSON(credential));
        await completed(result);
      } catch (error) {
        problem = signal.aborted ? signal.reason.message : problemMessage(error);
      } finally {
        clearTimeout(timer);
        controller = null;
        change("idle");
      }
    },
  };
}
