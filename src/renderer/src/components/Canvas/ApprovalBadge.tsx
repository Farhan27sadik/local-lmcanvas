import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import type { NodeId } from "@shared/types";
import { useCanvasStore } from "@/hooks/useCanvasStore";

type Props = { nodeId: NodeId };

/**
 * Toggle for per-node approval: when on, the agent stops for your OK before commands and edits.
 * Cursor and Kimi can't ask, so the badge only shows for Claude and Codex.
 */
export function ApprovalBadge({ nodeId }: Props) {
  const provider = useCanvasStore((s) => s.getEffectiveProvider(nodeId));
  const asking = useCanvasStore((s) => s.nodes[nodeId]?.data.nodeSettings?.approval === "ask");
  const setNodeSettings = useCanvasStore((s) => s.setNodeSettings);

  if (provider !== "claude" && provider !== "codex") return null;

  return (
    <div className="nodrag relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setNodeSettings(nodeId, { approval: asking ? undefined : "ask" });
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "flex items-center gap-1 rounded-sm border bg-card text-foreground px-1.5 py-[5px] text-xs font-medium cursor-pointer transition-colors",
          "hover:bg-muted",
          asking
            ? "border-accent-brand/60 bg-accent-brand/15 ring-1 ring-accent-brand/30 hover:bg-accent-brand/25"
            : "border-border",
        )}
        style={{ fontFamily: "var(--font-geist-pixel-square)" }}
        title={
          asking
            ? "Asks before running commands or editing files · click to run unattended"
            : "Runs commands and edits files without asking · click to ask first"
        }
        aria-pressed={asking}
      >
        <ShieldCheck
          className={clsx("w-[10px] h-[10px]", asking ? "text-accent-brand" : "text-muted-foreground")}
        />
        <span className="tracking-tight text-[8px] uppercase">{asking ? "ask" : "auto"}</span>
      </button>
    </div>
  );
}
