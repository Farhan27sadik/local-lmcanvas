import { useCallback } from "react";
import { useStore } from "@xyflow/react";
import type { Attachment } from "@shared/ipc";
import type { NodeId } from "@shared/types";
import { NODE_WIDTH } from "@/lib/canvasConstants";
import { makeDomHeightMeasurer, resolveCollisions } from "@/lib/collisionResolution";
import { siblingPosition, siblingSettings, sourceSettings } from "@/lib/compareTargets";
import { makeBlankNode, useCanvasStoreApi } from "./useCanvasStore";
import { useCompareStore } from "./useCompareStore";

type Submit = (text: string, attachments?: Attachment[]) => Promise<void>;

/**
 * Wraps a node's `submit`: when models were ticked for the node, the same prompt also goes to a
 * sibling node per model (same parent, row to the right), then the node runs as usual. Every node
 * in the compare asks before it acts, so no two agents edit one folder unattended.
 */
export function useCompareSubmit(nodeId: NodeId, submit: Submit): Submit {
  const storeApi = useCanvasStoreApi();
  const zoom = useStore((s) => s.transform[2]);

  return useCallback(
    async (text, attachments = []) => {
      const state = storeApi.getState();
      const source = state.nodes[nodeId];
      const sendable = text.trim() !== "" || attachments.length > 0;
      // Same gate as `submit`: a send that won't run must keep its ticks.
      if (!source || !sendable || state.lock !== "held" || !state.canvasId) return submit(text, attachments);
      const targets = useCompareStore.getState().take(nodeId);
      // A merge node has several parents; a sibling would need all of them.
      if (targets.length === 0 || source.data.chat.parentIds.length > 1) return submit(text, attachments);

      const parentId = source.data.chat.parentIds[0];
      const own = sourceSettings(source.data.nodeSettings, state.getEffectiveProvider(nodeId));
      // patchNode, not setNodeSettings: ask mode here must not become the seed for every new node.
      if (own !== source.data.nodeSettings) state.patchNode(nodeId, { nodeSettings: own });

      const ids = targets.map((target, i) => {
        const blank = makeBlankNode(siblingPosition(source.position, i), parentId);
        const sibling = { ...blank, data: { ...blank.data, nodeSettings: siblingSettings(own, target) } };
        state.setPrefill(sibling.id, text, { autoSubmit: true, attachments });
        state.addNode(sibling);
        if (parentId) state.connectEdge(parentId, sibling.id);
        return sibling.id;
      });

      // Once the siblings are in the DOM, spread them off anything they landed on.
      requestAnimationFrame(() => {
        const measure = makeDomHeightMeasurer(zoom);
        for (const id of ids) {
          const moves = resolveCollisions(id, storeApi.getState().nodes, measure, {
            fixedWidth: NODE_WIDTH,
            excludeIds: parentId ? [parentId] : [],
          });
          for (const movedId of Object.keys(moves)) storeApi.getState().movePosition(movedId, moves[movedId]);
        }
      });
      return submit(text, attachments);
    },
    [nodeId, submit, storeApi, zoom],
  );
}
