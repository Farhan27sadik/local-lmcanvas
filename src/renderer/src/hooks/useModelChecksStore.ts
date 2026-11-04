import { create } from "zustand";
import type { ModelCheckResult, ModelChecks } from "@shared/types";

type State = {
  /** Saved results: which models answered a tiny prompt, and which were refused. */
  checks: ModelChecks;
  /** This session's last run, with the reason each refused model gave. */
  lastResults: ModelCheckResult[];
  running: boolean;
  error: string | undefined;
  load: () => Promise<void>;
  run: () => Promise<void>;
};

/** Shared by the model picker and Settings, so a run started in one shows in the other. */
export const useModelChecksStore = create<State>((set, get) => ({
  checks: {},
  lastResults: [],
  running: false,
  error: undefined,
  load: async () => {
    try {
      set({ checks: await window.api.providers.modelChecks() });
    } catch {
      // No saved checks is the same as "not checked yet".
    }
  },
  run: async () => {
    if (get().running) return;
    set({ running: true, error: undefined });
    try {
      const report = await window.api.providers.checkModels();
      set({ checks: report.checks, lastResults: report.results, running: false });
    } catch (err) {
      set({ running: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
