import type { ModelCheckResult, ModelChecks, Provider } from "@shared/types";
import { classifyFailure } from "@shared/modelCatalog";

export type Candidate = { provider: Provider; model: string };
/** Sends one tiny prompt to the model. Resolves ok, or says why not; may also throw. */
export type Probe = (candidate: Candidate, signal: AbortSignal) => Promise<{ ok: true } | { ok: false; error: string }>;

const PROBE_TIMEOUT_MS = 60_000;
const MAX_ERROR_CHARS = 240;

/** Checks the candidates one at a time, so a run never opens many CLI processes at once. */
export async function runModelChecks(
  candidates: readonly Candidate[],
  probe: Probe,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ModelCheckResult[]> {
  const results: ModelCheckResult[] = [];
  for (const candidate of candidates) {
    const signal = AbortSignal.timeout(timeoutMs);
    let outcome: Awaited<ReturnType<Probe>>;
    try {
      outcome = await probe(candidate, signal);
    } catch (err) {
      outcome = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (outcome.ok) {
      results.push({ ...candidate, status: "ok" });
      continue;
    }
    const error = signal.aborted ? "timed out" : outcome.error.trim().slice(0, MAX_ERROR_CHARS) || "no answer";
    results.push({ ...candidate, status: classifyFailure(error), error });
  }
  return results;
}

/** Folds a run into the saved checks. `unknown` results change nothing, so a rate limit can't hide a good model. */
export function applyModelChecks(checks: ModelChecks, results: readonly ModelCheckResult[], now: number): ModelChecks {
  const next: ModelChecks = Object.fromEntries(Object.entries(checks).map(([p, byModel]) => [p, { ...byModel }]));
  for (const r of results) {
    if (r.status === "unknown") continue;
    const byModel = (next[r.provider] ??= {});
    byModel[r.model] = r.status === "ok" ? { ok: true, checkedAt: now } : { ok: false, checkedAt: now, error: r.error };
  }
  return next;
}
