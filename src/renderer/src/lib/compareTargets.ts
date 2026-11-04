import type { NodeSettings, Provider } from "@shared/types";
import { HORIZONTAL_PADDING, NODE_WIDTH } from "./canvasConstants";

/** One extra model a prompt is sent to. `model` is undefined when the provider picks (Cursor "Auto"). */
export type CompareTarget = { provider: Provider; model?: string; label: string };

/** Extra models beside the node's own, so a send starts at most 6 agents. */
export const MAX_COMPARE_EXTRA = 5;

/** Gap between two compared nodes in the row. */
const ROW_GAP = HORIZONTAL_PADDING * 2;

export const targetKey = (t: Pick<CompareTarget, "provider" | "model">): string => `${t.provider}:${t.model ?? ""}`;

/** Adds or removes `target`; a full list ignores further additions. */
export function toggleTarget(list: readonly CompareTarget[], target: CompareTarget): CompareTarget[] {
  const key = targetKey(target);
  if (list.some((t) => targetKey(t) === key)) return list.filter((t) => targetKey(t) !== key);
  return list.length >= MAX_COMPARE_EXTRA ? [...list] : [...list, target];
}

/** Compare nodes ask first so several agents can't edit one folder unattended; Cursor can't ask. */
export function compareApproval(provider: Provider): NodeSettings["approval"] {
  return provider === "cursor" ? undefined : "ask";
}

/** A sibling keeps the source's folder and mode but has its own model, effort and tier. */
export function siblingSettings(source: NodeSettings | undefined, target: CompareTarget): NodeSettings {
  const { provider: _p, model: _m, reasoningEffort: _r, serviceTier: _s, approval: _a, ...kept } = source ?? {};
  const approval = compareApproval(target.provider);
  return {
    ...kept,
    provider: target.provider,
    ...(target.model ? { model: target.model } : {}),
    ...(approval ? { approval } : {}),
  };
}

/** The source node itself joins the compare in ask mode (when its provider can ask). */
export function sourceSettings(source: NodeSettings | undefined, provider: Provider): NodeSettings | undefined {
  const approval = compareApproval(provider);
  return approval ? { ...source, approval } : source;
}

/** The i-th sibling (0-based) sits in a row to the right of the source. */
export function siblingPosition(source: { x: number; y: number }, index: number): { x: number; y: number } {
  return { x: source.x + (index + 1) * (NODE_WIDTH + ROW_GAP), y: source.y };
}
