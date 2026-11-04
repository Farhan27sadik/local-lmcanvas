import type { ApprovalMode } from "@shared/types";

/**
 * What Codex may do without asking. `ask` runs only commands Codex knows are safe on its own
 * and stops for the rest (the app-server's approval requests reach the node as questions),
 * with writes limited to the node's folder. `auto` is the unattended full access Codex ran with before.
 */
export function codexPolicy(approval: ApprovalMode | undefined, cwd: string) {
  if (approval === "ask") {
    return {
      approvalPolicy: "untrusted",
      sandbox: "workspace-write",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [cwd],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    } as const;
  }
  return {
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    sandboxPolicy: { type: "dangerFullAccess" },
  } as const;
}
