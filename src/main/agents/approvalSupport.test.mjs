// .mjs keeps the bun:test import out of `bun run typecheck`.
import { describe, expect, test } from "bun:test";
import { approvalRefusal } from "./approvalSupport.ts";

describe("approvalRefusal", () => {
  test("Cursor and Kimi refuse ask mode and say what to do", () => {
    expect(approvalRefusal("kimi", "ask")).toContain("Kimi can't ask");
    expect(approvalRefusal("cursor", "ask")).toContain("Switch the node's approval to auto");
  });

  test("everything else runs: auto or unset anywhere, ask on Claude and Codex", () => {
    expect(approvalRefusal("kimi", "auto")).toBeUndefined();
    expect(approvalRefusal("cursor", undefined)).toBeUndefined();
    expect(approvalRefusal("claude", "ask")).toBeUndefined();
    expect(approvalRefusal("codex", "ask")).toBeUndefined();
  });
});
