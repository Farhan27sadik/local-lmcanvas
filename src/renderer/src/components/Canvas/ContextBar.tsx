import clsx from "clsx";
import type { NodeId } from "@shared/types";
import { useContextView } from "@/hooks/useContextView";

/** A 2px bar along the node's bottom edge: root→here against the model's window. */
export function ContextBar({ nodeId }: { nodeId: NodeId }) {
  const view = useContextView(nodeId);
  if (!view) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-b-[inherit] bg-transparent">
      <div
        className={clsx(
          "h-full transition-[width] duration-300",
          view.level === "full" ? "bg-red-500" : view.level === "warn" ? "bg-amber-500" : "bg-foreground/25",
        )}
        style={{ width: `${Math.min(100, Math.round(view.percent * 100))}%` }}
      />
    </div>
  );
}
