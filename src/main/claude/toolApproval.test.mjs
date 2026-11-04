// .mjs keeps the bun:test import out of `bun run typecheck`.
import { beforeEach, describe, expect, test } from "bun:test";
import { approvalQuestion, createToolApprover, needsApproval, previewToolCall, resetNodeApprovals } from "./toolApproval.ts";
import { runClaude } from "./runner.ts";

const signal = new AbortController().signal;
const answering = (decision) => async () => ({ id: "r", cancelled: false, answers: { decision } });

beforeEach(resetNodeApprovals);

describe("needsApproval", () => {
  test("lets read-only and LMCanvas tools through, stops everything that changes things", () => {
    for (const name of ["Read", "Glob", "Grep", "TodoWrite", "mcp__lmc__ask_user_question"]) {
      expect(needsApproval(name, "n1")).toBe(false);
    }
    for (const name of ["Bash", "Edit", "Write", "WebFetch", "mcp__other__tool"]) {
      expect(needsApproval(name, "n1")).toBe(true);
    }
  });
});

describe("previewToolCall", () => {
  test("shows the command, url or path the user is approving, clipped", () => {
    expect(previewToolCall("Bash", { command: "rm -rf build" })).toBe("rm -rf build");
    expect(previewToolCall("Write", { file_path: "/a/b.ts", content: "x" })).toBe("/a/b.ts");
    expect(previewToolCall("WebFetch", { url: "https://x.dev" })).toBe("https://x.dev");
    expect(previewToolCall("Bash", { command: "x".repeat(2000) }).length).toBe(1001);
  });
});

describe("createToolApprover", () => {
  test("never asks for a read-only tool", async () => {
    const approve = createToolApprover({ nodeId: "n1", ask: () => { throw new Error("asked"); } });
    expect(await approve("Read", { file_path: "/a" }, { signal })).toEqual({ behavior: "allow", updatedInput: { file_path: "/a" } });
  });

  test("allow once lets the call run but asks again next time", async () => {
    let asked = 0;
    const approve = createToolApprover({ nodeId: "n1", ask: (q) => { asked += 1; return answering("Allow once")(q); } });
    expect((await approve("Bash", { command: "ls" }, { signal })).behavior).toBe("allow");
    await approve("Bash", { command: "ls" }, { signal });
    expect(asked).toBe(2);
  });

  test("always allow remembers the tool for that node only", async () => {
    let asked = 0;
    const ask = (q) => { asked += 1; return answering("Always allow Bash")(q); };
    const approve = createToolApprover({ nodeId: "n1", ask });
    await approve("Bash", { command: "ls" }, { signal });
    await approve("Bash", { command: "pwd" }, { signal });
    expect(asked).toBe(1);
    await createToolApprover({ nodeId: "n2", ask })("Bash", { command: "ls" }, { signal });
    expect(asked).toBe(2);
  });

  test("deny tells the model no without stopping the run", async () => {
    const approve = createToolApprover({ nodeId: "n1", ask: answering("Deny") });
    const result = await approve("Write", { file_path: "/a" }, { signal });
    expect(result.behavior).toBe("deny");
    expect(result.interrupt).toBeUndefined();
  });

  test("a cancelled or aborted question denies and stops the run", async () => {
    const cancelled = createToolApprover({ nodeId: "n1", ask: async () => ({ id: "r", cancelled: true }) });
    expect(await cancelled("Bash", {}, { signal })).toMatchObject({ behavior: "deny", interrupt: true });
    const aborted = createToolApprover({ nodeId: "n1", ask: async () => { throw new Error("Aborted"); } });
    expect(await aborted("Bash", {}, { signal })).toMatchObject({ behavior: "deny", interrupt: true });
  });

  test("the question carries the call's preview", () => {
    const [, always, deny] = approvalQuestion("Bash", { command: "ls" }).options;
    expect(approvalQuestion("Bash", { command: "ls" }).options[0].preview).toBe("ls");
    expect([always.label, deny.label]).toEqual(["Always allow Bash", "Deny"]);
  });
});

describe("runClaude permission options", () => {
  async function optionsFor(extra) {
    let seen;
    const queryFn = (params) => {
      seen = params.options;
      return Object.assign((async function* () {})(), { getContextUsage: async () => null });
    };
    await runClaude("hi", { cwd: "/tmp", client: {}, nodeId: "n1", onEvent: () => {}, queryFn, ...extra });
    return seen;
  }

  test("auto keeps today's unattended bypass", async () => {
    const options = await optionsFor({});
    expect(options.permissionMode).toBe("bypassPermissions");
    expect(options.canUseTool).toBeUndefined();
  });

  test("ask switches to the default mode with an approver", async () => {
    const options = await optionsFor({ approval: "ask" });
    expect(options.permissionMode).toBe("default");
    expect(options.allowDangerouslySkipPermissions).toBe(false);
    expect(typeof options.canUseTool).toBe("function");
  });

  test("plan mode stays plan mode even when ask is set", async () => {
    const options = await optionsFor({ approval: "ask", planMode: true });
    expect(options.permissionMode).toBe("plan");
  });
});
