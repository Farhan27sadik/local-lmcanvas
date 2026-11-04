// .mjs keeps the bun:test import out of `bun run typecheck`.
import { describe, expect, test } from "bun:test";
import { approvalRefusal } from "./approvalSupport.ts";

describe("approvalRefusal", () => {
  test("Cursor refuses ask mode and says what to do", () => {
    expect(approvalRefusal("cursor", "ask")).toContain("Cursor can't ask");
    expect(approvalRefusal("cursor", "ask")).toContain("Switch the node's approval to auto");
  });

  test("everything else runs: auto or unset anywhere, ask on Claude, Codex and Kimi", () => {
    expect(approvalRefusal("cursor", "auto")).toBeUndefined();
    expect(approvalRefusal("cursor", undefined)).toBeUndefined();
    for (const provider of ["claude", "codex", "kimi"]) {
      expect(approvalRefusal(provider, "ask")).toBeUndefined();
    }
  });
});
