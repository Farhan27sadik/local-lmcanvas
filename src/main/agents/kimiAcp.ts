import { spawn } from "node:child_process";
import { requestAnswer } from "../claude/askUserBridge";
import { resolveCommandLine } from "../commandLine";
import { shellEnv } from "../shellPath";
import { createRpc } from "./acpRpc";
import { consumeJsonl } from "./jsonlReader";
import { acpUpdateEvents, permissionOutcome, permissionQuestion } from "./kimiAcpEvents";
import { composePromptWithSystem, errorMessage, isAuthError, type RunAgentOpts, type RunnerEvent } from "./types";

const CANCEL_GRACE_MS = 2000;

const sessionIdOf = (result: unknown): string => {
  const id = (result as { sessionId?: unknown } | undefined)?.sessionId;
  if (typeof id !== "string" || !id) throw new Error("Kimi did not return a session ID.");
  return id;
};

/**
 * Runs one Kimi turn over `kimi acp` (Agent Client Protocol on stdio), which, unlike print
 * mode, can stop and ask before a command or an edit. Sessions are shared with print mode,
 * so a node can switch between the two and keep its conversation.
 */
export async function runKimiAcp(prompt: string, opts: RunAgentOpts): Promise<void> {
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

  let proc: ReturnType<typeof spawn> | undefined;
  try {
    const env = await shellEnv();
    const line = resolveCommandLine(bin, ["acp"], env);
    const child = spawn(line.command, line.args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env,
      windowsHide: true,
      windowsVerbatimArguments: line.windowsVerbatimArguments,
    });
    proc = child;

    let stderrBuf = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderrBuf += chunk));
    child.stdin.on("error", () => undefined); // a dead agent is reported through `close` below

    let sessionId: string | undefined;
    const rpc = createRpc((text) => child.stdin.write(`${text}\n`), {
      onNotification: (method, params) => {
        const update = (params as { update?: unknown } | undefined)?.update;
        if (method === "session/update") acpUpdateEvents(update).forEach(emit);
      },
      onRequest: async (method, params) => {
        if (method !== "session/request_permission") throw new Error(`Unsupported request: ${method}`);
        const response = await requestAnswer([permissionQuestion(params)], opts.client, opts.nodeId, opts.signal).catch(
          () => ({ id: "", cancelled: true }) as const,
        );
        return { outcome: permissionOutcome(params, response) };
      },
    });

    child.on("error", (err: NodeJS.ErrnoException) =>
      rpc.failAll(new Error(err.code === "ENOENT" ? `kimi executable not found (tried "${bin}"). Install Kimi Code.` : errorMessage(err))),
    );
    child.on("close", (code) =>
      rpc.failAll(new Error(`kimi exited with code ${code}${stderrBuf ? `\n${stderrBuf.trim()}` : ""}`)),
    );
    void consumeJsonl(child.stdout, rpc.feed).catch(() => undefined);

    const onAbort = (): void => {
      if (sessionId) rpc.notify("session/cancel", { sessionId });
      setTimeout(() => child.kill("SIGTERM"), CANCEL_GRACE_MS).unref();
    };
    if (opts.signal?.aborted) onAbort();
    else opts.signal?.addEventListener("abort", onAbort, { once: true });

    await rpc.call("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });

    // Same node: resume. First reply on a branch of a Kimi node: fork the parent's session.
    const common = { cwd: opts.cwd, mcpServers: [] };
    let fresh = false;
    if (opts.currentSession) {
      sessionId = opts.currentSession.id;
      await rpc.call("session/resume", { sessionId, ...common });
    } else if (opts.parentSession) {
      await rpc.call("session/resume", { sessionId: opts.parentSession.id, ...common });
      sessionId = sessionIdOf(await rpc.call("session/fork", { sessionId: opts.parentSession.id, ...common }));
    } else {
      sessionId = sessionIdOf(await rpc.call("session/new", common));
      fresh = true;
    }
    emit({ kind: "session", session: { provider: "kimi", id: sessionId } });

    if (opts.model) await rpc.call("session/set_config_option", { sessionId, configId: "model", value: opts.model });

    // The system prompt rides along only on a fresh session; a resumed one already has it.
    const text = fresh ? composePromptWithSystem(prompt, opts.systemPrompt) : prompt;
    await rpc.call("session/prompt", { sessionId, prompt: [{ type: "text", text }] });
    emit({ kind: "done", isError: false });
  } catch (err) {
    if (opts.signal?.aborted) {
      if (!doneEmitted) emit({ kind: "done", isError: false });
    } else {
      emit({ kind: "error", message: errorMessage(err) });
      if (!doneEmitted) emit({ kind: "done", isError: true });
    }
  } finally {
    proc?.kill("SIGTERM");
  }
}
