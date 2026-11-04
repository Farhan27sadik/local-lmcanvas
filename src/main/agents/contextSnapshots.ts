import type { ContextSnapshot } from "@shared/types";

const positive = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

// Codex and Kimi compact on their own and report no threshold, so none is shown.
const exact = (tokens: number, window: number): ContextSnapshot => ({
  tokens,
  window,
  autoCompactEnabled: false,
  exact: true,
  measuredAt: Date.now(),
});

/**
 * Codex's `thread/tokenUsage/updated` payload: the last model call read and wrote `last.totalTokens`,
 * which is what the next call starts from. Without the window there is nothing to measure against.
 */
export function codexContext(tokenUsage: unknown): ContextSnapshot | undefined {
  const usage = tokenUsage as { last?: { totalTokens?: unknown }; modelContextWindow?: unknown } | null | undefined;
  const tokens = positive(usage?.last?.totalTokens);
  const window = positive(usage?.modelContextWindow);
  return tokens !== undefined && window !== undefined ? exact(tokens, window) : undefined;
}

/** Kimi's ACP `usage_update`: `used` of `size` tokens. */
export function kimiContext(update: unknown): ContextSnapshot | undefined {
  const { used, size } = (update ?? {}) as { used?: unknown; size?: unknown };
  const tokens = positive(used);
  const window = positive(size);
  return tokens !== undefined && window !== undefined ? exact(tokens, window) : undefined;
}
