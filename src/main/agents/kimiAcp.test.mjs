// .mjs keeps the bun:test import out of `bun run typecheck`.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { completeRequest } from "../claude/askUserBridge.ts";
import { runKimiAcp } from "./kimiAcp.ts";

const dir = mkdtempSync(join(tmpdir(), "fake-kimi-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A stand-in for `kimi acp`: answers the handshake, then asks permission for one Bash call
// and reports in its reply which methods it saw, what the user chose and the prompt text.
const fakeKimi = join(dir, "kimi");
writeFileSync(
  fakeKimi,
  `#!${process.execPath}
const seen = [];
let promptRequest = null;
let promptText = "";
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
const update = (u) => send({ method: "session/update", params: { sessionId: "s", update: u } });
let buf = "";
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    handle(m);
  }
});
function handle(m) {
  if (m.method) seen.push(m.method);
  if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: 1 } });
  else if (m.method === "session/new") send({ id: m.id, result: { sessionId: "s-new" } });
  else if (m.method === "session/fork") send({ id: m.id, result: { sessionId: "s-fork" } });
  else if (m.method === "session/resume" || m.method === "session/set_config_option") send({ id: m.id, result: {} });
  else if (m.method === "session/prompt") {
    promptRequest = m.id;
    promptText = m.params.prompt[0].text;
    update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } });
    update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Bash", kind: "execute", status: "pending" });
    send({ id: 900, method: "session/request_permission", params: {
      sessionId: "s",
      toolCall: { toolCallId: "t1", title: "Bash", content: [{ type: "content", content: { type: "text", text: "Requesting approval to Running: ls" } }] },
      options: [
        { optionId: "approve_once", name: "Approve once", kind: "allow_once" },
        { optionId: "approve_always", name: "Approve for this session", kind: "allow_always" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ] } });
  } else if (m.id === 900) {
    const chosen = m.result.outcome.optionId ?? m.result.outcome.outcome;
    update({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: chosen === "reject" ? "failed" : "completed", rawOutput: "out" });
    update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify({ seen, chosen, promptText }) } });
    send({ id: promptRequest, result: { stopReason: "end_turn" } });
  }
}
`,
);
chmodSync(fakeKimi, 0o755);

function fakeClient() {
  const client = {
    sent: [],
    send(channel, payload) {
      client.sent.push({ channel, payload });
      setTimeout(() => completeRequest({ id: payload.id, cancelled: false, answers: { decision: client.decision } }), 0);
    },
    isGone: () => false,
    onGone: () => () => {},
    decision: "Allow once",
  };
  return client;
}

async function run(extra = {}, decision = "Allow once") {
  const client = fakeClient();
  client.decision = decision;
  const events = [];
  await runKimiAcp("do it", { cwd: dir, binPath: fakeKimi, client, nodeId: "n1", onEvent: (e) => events.push(e), ...extra });
  const reply = events.filter((e) => e.kind === "text_delta").map((e) => e.text).join("");
  return { events, client, reply: reply ? JSON.parse(reply) : undefined };
}

describe("runKimiAcp", () => {
  test("asks, runs the call once approved, and reports the session, tool call and a clean finish", async () => {
    const { events, client, reply } = await run();
    expect(client.sent[0].channel).toBe("askUser:request");
    expect(client.sent[0].payload.questions[0]).toMatchObject({ header: "Approval", question: "Allow Kimi to use Bash?" });
    expect(client.sent[0].payload.questions[0].options[0].preview).toBe("Running: ls");
    expect(reply.chosen).toBe("approve_once");
    expect(events.map((e) => e.kind)).toEqual(["session", "thinking_delta", "tool_use", "tool_result", "text_delta", "done"]);
    expect(events[0].session).toEqual({ provider: "kimi", id: "s-new" });
    expect(events.find((e) => e.kind === "tool_result")).toMatchObject({ toolUseId: "t1", isError: false });
    expect(events.at(-1)).toEqual({ kind: "done", isError: false });
  });

  test("Deny tells Kimi to reject and the tool call ends as an error", async () => {
    const { events, reply } = await run({}, "Deny");
    expect(reply.chosen).toBe("reject");
    expect(events.find((e) => e.kind === "tool_result").isError).toBe(true);
  });

  test("a new session carries the system prompt; a resumed one resumes without it", async () => {
    const fresh = await run({ systemPrompt: "be brief" });
    expect(fresh.reply.seen).toContain("session/new");
    expect(fresh.reply.promptText).toContain("[System]\nbe brief");

    const resumed = await run({ systemPrompt: "be brief", currentSession: { provider: "kimi", id: "s-old" } });
    expect(resumed.reply.seen).toContain("session/resume");
    expect(resumed.reply.seen).not.toContain("session/new");
    expect(resumed.reply.promptText).toBe("do it");
    expect(resumed.events[0].session.id).toBe("s-old");
  });

  test("the first reply on a branch forks the parent's session", async () => {
    const { reply, events } = await run({ parentSession: { provider: "kimi", id: "s-parent" } });
    expect(reply.seen.filter((m) => m.startsWith("session/")).slice(0, 2)).toEqual(["session/resume", "session/fork"]);
    expect(events[0].session.id).toBe("s-fork");
  });

  test("a chosen model is set on the session before the prompt", async () => {
    const { reply } = await run({ model: "kimi-code/k3" });
    expect(reply.seen.indexOf("session/set_config_option")).toBeLessThan(reply.seen.indexOf("session/prompt"));
  });

  test("a missing kimi binary is reported as an error and still ends the chat", async () => {
    const { events } = await run({ binPath: join(dir, "does-not-exist") });
    expect(events.some((e) => e.kind === "error")).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "done", isError: true });
  });

  test("images are refused like in print mode", async () => {
    const { events } = await run({ attachments: [{ mediaType: "image/png", base64: "x" }] });
    expect(events[0].message).toContain("not yet supported");
    expect(events.at(-1)).toEqual({ kind: "done", isError: true });
  });
});
