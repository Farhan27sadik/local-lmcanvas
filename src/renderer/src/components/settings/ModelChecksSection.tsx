import { useEffect } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { PROVIDERS } from "@shared/types";
import { useModelChecksStore } from "@/hooks/useModelChecksStore";
import { PROVIDER_INFO } from "@/components/Onboarding/providerInfo";

/** What "Check my models" found: which latest models answered, and why the others were refused. */
export function ModelChecksSection() {
  const { checks, running, error, load, run } = useModelChecksStore();
  useEffect(() => {
    void load();
  }, [load]);
  const rows = PROVIDERS.flatMap((provider) =>
    Object.entries(checks[provider] ?? {}).map(([model, check]) => ({ provider, model, check })),
  );
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={running}
          onClick={() => void run()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground hover:bg-muted disabled:opacity-60 cursor-pointer"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          {running ? "Checking…" : "Check my models"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Sends each latest model one tiny prompt, and hides the ones your plan can't run. Uses a little quota.
        </span>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-500">Check failed: {error}</p>}
      {rows.length > 0 && (
        <ul className="mt-2 grid gap-0.5">
          {rows.map(({ provider, model, check }) => (
            <li key={`${provider}/${model}`} className="flex items-start gap-1.5 text-[11px]">
              {check.ok ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
              ) : (
                <X className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
              )}
              <span className="shrink-0 text-muted-foreground">{PROVIDER_INFO[provider].name}</span>
              <span className="shrink-0 text-foreground">{model}</span>
              {!check.ok && <span className="min-w-0 truncate text-muted-foreground" title={check.error}>{check.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
