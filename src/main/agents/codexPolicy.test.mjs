// .mjs keeps the bun:test import out of `bun run typecheck`.
import { describe, expect, test } from "bun:test";
import { codexPolicy } from "./codexPolicy.ts";

describe("codexPolicy", () => {
  test("auto and unset keep Codex's unattended full access", () => {
    for (const mode of ["auto", undefined]) {
      expect(codexPolicy(mode, "/work")).toEqual({
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        sandboxPolicy: { type: "dangerFullAccess" },
      });
    }
  });

  test("ask stops for unknown commands and confines writes to the node's folder", () => {
    const policy = codexPolicy("ask", "/work");
    expect(policy.approvalPolicy).toBe("untrusted");
    expect(policy.sandbox).toBe("workspace-write");
    expect(policy.sandboxPolicy).toMatchObject({ type: "workspaceWrite", writableRoots: ["/work"], networkAccess: false });
  });
});
