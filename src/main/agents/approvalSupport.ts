import type { ApprovalMode, Provider } from "@shared/types";

const CANNOT_ASK: Partial<Record<Provider, string>> = {
  cursor: "Cursor",
  kimi: "Kimi",
};

/** Why a provider can't run in ask mode, or undefined when it can. Their print modes have no one to ask. */
export function approvalRefusal(provider: Provider, approval: ApprovalMode | undefined): string | undefined {
  const name = CANNOT_ASK[provider];
  if (approval !== "ask" || !name) return undefined;
  return `${name} can't ask for approval yet, so this node won't run it. Switch the node's approval to auto, or pick Claude or Codex.`;
}
