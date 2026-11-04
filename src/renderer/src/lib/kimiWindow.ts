import type { KimiModelInfo } from "@shared/types";

/** The window of the Kimi model a node uses (its own, else the first current one in the config). */
export function kimiWindowFor(models: readonly KimiModelInfo[], model: string | undefined): number | undefined {
  const chosen = (model ? models.find((m) => m.id === model) : undefined) ?? models.find((m) => m.latest);
  return chosen?.contextSize;
}
