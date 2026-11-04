import { expect, test } from "bun:test";
import { applyModelChecks, runModelChecks } from "./modelCheck.ts";

const c = (provider, model) => ({ provider, model });

test("each candidate gets its own result: ok, failed for a plan error, unknown for a transient one", async () => {
  const probe = async ({ model }) => {
    if (model === "opus") return { ok: false, error: "It may not exist or you may not have access to it." };
    if (model === "fable") return { ok: false, error: "rate limit exceeded" };
    if (model === "boom") throw new Error("spawn failed");
    return { ok: true };
  };
  const results = await runModelChecks([c("claude", "sonnet"), c("claude", "opus"), c("claude", "fable"), c("kimi", "boom")], probe);
  expect(results.map((r) => [r.model, r.status])).toEqual([
    ["sonnet", "ok"], ["opus", "failed"], ["fable", "unknown"], ["boom", "failed"],
  ]);
  expect(results[1].error).toContain("may not have access");
});

test("a probe that outlives the timeout is unknown, not failed", async () => {
  const probe = (_c, signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ ok: false, error: "aborted" })));
  const [r] = await runModelChecks([c("codex", "slow")], probe, 20);
  expect(r).toMatchObject({ status: "unknown", error: "timed out" });
});

test("only ok and failed are saved; unknown leaves the earlier result alone; the input is not mutated", () => {
  const before = { claude: { opus: { ok: true, checkedAt: 1 } } };
  const after = applyModelChecks(
    before,
    [
      { provider: "claude", model: "opus", status: "unknown", error: "rate limit" },
      { provider: "claude", model: "sonnet", status: "ok" },
      { provider: "kimi", model: "k3", status: "failed", error: "no access" },
    ],
    99,
  );
  expect(after.claude.opus).toEqual({ ok: true, checkedAt: 1 });
  expect(after.claude.sonnet).toEqual({ ok: true, checkedAt: 99 });
  expect(after.kimi.k3).toEqual({ ok: false, checkedAt: 99, error: "no access" });
  expect(before).toEqual({ claude: { opus: { ok: true, checkedAt: 1 } } });
});
