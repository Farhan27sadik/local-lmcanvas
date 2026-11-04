import { Loader2, ShieldCheck } from "lucide-react";
import { useModelChecksStore } from "@/hooks/useModelChecksStore";

function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/** Runs "Check my models": each latest model gets one tiny prompt; the ones that answer stay. */
export function CheckModelsFooter() {
  const { checks, running, error, run } = useModelChecksStore();
  const times = Object.values(checks).flatMap((byModel) => Object.values(byModel ?? {}).map((c) => c.checkedAt));
  const last = times.length > 0 ? Math.max(...times) : undefined;
  return (
    <div className="mt-1 flex items-center gap-2 border-t border-border px-2.5 pt-1.5 text-[9px] text-muted-foreground">
      <button
        type="button"
        disabled={running}
        onClick={() => void run()}
        title="Sends each model one tiny prompt, and hides the ones your plan can't run. Uses a little quota."
        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-foreground hover:bg-muted disabled:opacity-60 cursor-pointer"
      >
        {running ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ShieldCheck className="h-2.5 w-2.5" />}
        {running ? "Checking…" : "Check my models"}
      </button>
      <span className="truncate">
        {error ? `Failed: ${error}` : last === undefined ? "Not checked yet" : `Checked ${ago(last)}`}
      </span>
    </div>
  );
}
