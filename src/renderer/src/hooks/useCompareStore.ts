import { create } from "zustand";
import type { NodeId } from "@shared/types";
import type { CompareTarget } from "@/lib/compareTargets";

type CompareState = {
  /** Extra models ticked for a node's next send. Transient: never saved, never seeds new nodes. */
  byNode: Record<NodeId, CompareTarget[]>;
  set: (nodeId: NodeId, targets: CompareTarget[]) => void;
  /** Returns the node's ticked models and clears them, so a compare is always deliberate. */
  take: (nodeId: NodeId) => CompareTarget[];
};

export const useCompareStore = create<CompareState>((set, get) => ({
  byNode: {},
  set: (nodeId, targets) =>
    set((s) => {
      const { [nodeId]: _gone, ...rest } = s.byNode;
      return { byNode: targets.length > 0 ? { ...rest, [nodeId]: targets } : rest };
    }),
  take: (nodeId) => {
    const targets = get().byNode[nodeId] ?? [];
    if (targets.length > 0) get().set(nodeId, []);
    return targets;
  },
}));
