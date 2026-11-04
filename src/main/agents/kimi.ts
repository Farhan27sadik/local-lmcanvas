import { spawn } from "node:child_process";
import { consumeJsonl } from "./jsonlReader";
import { runKimiAcp } from "./kimiAcp";
import { kimiLineEvents } from "./kimiStream";
import { shellEnv } from "../shellPath";
import { resolveCommandLine } from "../commandLine";
import {
  composePromptWithSystem,
  errorMessage,
  isAuthError,
  type RunAgentOpts,
  type RunnerEvent,
} from "./types";

/** Runs `kimi <args>` to completion and returns its stdout; rejects with stderr on a non-zero exit. */
async function kimiOnce(bin: string, args: string[], cwd: string, signal?: AbortSignal): Promise<string> {
  const env = await shellEnv();
  const line = resolveCommandLine(bin, args, env);
  return new Promise((resolve, reject) => {
    const proc = spawn(line.command, line.args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true,
      windowsVerbatimArguments: line.windowsVerbatimArguments,
      signal,
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c));
    proc.stderr.on("data", (c) => (err += c));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `kimi exited with code ${code}`))));
  });
}

/** A branch off a Kimi node continues a copy of the parent's session, so the parent stays untouched. */
async function forkSession(bin: string, parentId: string, cwd: string, signal?: AbortSignal): Promise<string> {
  const out = await kimiOnce(bin, ["fork", parentId, "--yes", "--cwd", cwd], cwd, signal);
  const id = /Forked to (\S+)/.exec(out)?.[1];
  if (!id) throw new Error(`Could not read the forked session from: ${out.trim()}`);
  return id;
}

export async function runKimi(prompt: string, opts: RunAgentOpts): Promise<void> {
  // Print mode runs every tool unattended; only ACP can stop and ask.
  if (opts.approval === "ask") return runKimiAcp(prompt, opts);
  if (opts.attachments && opts.attachments.length > 0) {
    opts.onEvent({ kind: "error", message: "Image attachments are not yet supported for the kimi provider." });
    opts.onEvent({ kind: "done", isError: true });
    return;
  }

  const bin = opts.binPath || "kimi";
  let doneEmitted = false;
  const emit = (ev: RunnerEvent): void => {
    if (ev.kind === "done") doneEmitted = true;
    if (ev.kind === "error" && !ev.code && isAuthError(ev.message)) {
      opts.onEvent({ ...ev, code: "auth_required" });
      return;
    }
    opts.onEvent(ev);
  };

  try {
    // Same node: resume. First reply on a branch of a Kimi node: resume a fork of the parent.
    const sessionId =
      opts.currentSession?.id ??
      (opts.parentSession ? await forkSession(bin, opts.parentSession.id, opts.cwd, opts.signal) : undefined);
    // The system prompt rides along only on a fresh session; a resumed one already has it.
    const text = sessionId ? prompt : composePromptWithSystem(prompt, opts.systemPrompt);
    const args = [
      "-p",
      text,
      "--output-format",
      "stream-json",
      ...(opts.model ? ["-m", opts.model] : []),
      ...(sessionId ? ["-S", sessionId] : []),
    ];

    const env = await shellEnv();
    const line = resolveCommandLine(bin, args, env);
    const proc = spawn(line.command, line.args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true,
      windowsVerbatimArguments: line.windowsVerbatimArguments,
    });
    if (opts.signal) {
      if (opts.signal.aborted) proc.kill("SIGTERM");
      else opts.signal.addEventListener("abort", () => proc.kill("SIGTERM"), { once: true });
    }
    proc.on("error", (err: NodeJS.ErrnoException) => {
      emit({
        kind: "error",
        message: err.code === "ENOENT" ? `kimi executable not found (tried "${bin}"). Install Kimi Code.` : errorMessage(err),
      });
    });

    let stderrBuf = "";
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => (stderrBuf += chunk));

    // A resumed run can't print a different ID, but the ID is only printed at the end, so
    // report the one we resumed right away in case the run is stopped before that.
    if (sessionId) emit({ kind: "session", session: { provider: "kimi", id: sessionId } });
    await consumeJsonl(proc.stdout, (obj) => kimiLineEvents(obj).forEach(emit));

    const code: number | null = await new Promise((resolve) => {
      if (proc.exitCode !== null) resolve(proc.exitCode);
      else proc.once("close", (c) => resolve(c));
    });
    if (code !== 0 && code !== null && !opts.signal?.aborted) {
      emit({ kind: "error", message: `kimi exited with code ${code}${stderrBuf ? `\n${stderrBuf.trim()}` : ""}` });
      emit({ kind: "done", isError: true });
    } else {
      emit({ kind: "done", isError: false });
    }
  } catch (err) {
    emit({ kind: "error", message: errorMessage(err) });
    if (!doneEmitted) emit({ kind: "done", isError: true });
  }
}
