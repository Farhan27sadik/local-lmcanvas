// .mjs keeps the bun:test import out of `bun run typecheck`.
import { describe, expect, test } from "bun:test";
import {
  MAX_COMPARE_EXTRA,
  siblingPosition,
  siblingSettings,
  sourceSettings,
  toggleTarget,
} from "./compareTargets.ts";

const t = (provider, model) => ({ provider, model, label: `${provider} ${model}` });

describe("toggleTarget", () => {
  test("adds a target, then removes it on the second toggle", () => {
    const one = toggleTarget([], t("codex", "gpt-5"));
    expect(one).toHaveLength(1);
    expect(toggleTarget(one, t("codex", "gpt-5"))).toHaveLength(0);
  });

  test("the same model on another provider is a different target", () => {
    expect(toggleTarget([t("codex", "x")], t("kimi", "x"))).toHaveLength(2);
  });

  test("a full list ignores further additions but still allows removal", () => {
    const full = Array.from({ length: MAX_COMPARE_EXTRA }, (_, i) => t("claude", `m${i}`));
    expect(toggleTarget(full, t("claude", "extra"))).toHaveLength(MAX_COMPARE_EXTRA);
    expect(toggleTarget(full, t("claude", "m0"))).toHaveLength(MAX_COMPARE_EXTRA - 1);
  });
});

describe("siblingSettings", () => {
  const source = {
    provider: "claude",
    model: "opus",
    reasoningEffort: "high",
    serviceTier: "fast",
    approval: "auto",
    cwd: "/work",
    planMode: true,
  };

  test("keeps the folder and plan mode, swaps provider and model, drops effort and tier", () => {
    expect(siblingSettings(source, t("codex", "gpt-5"))).toEqual({
      cwd: "/work",
      planMode: true,
      provider: "codex",
      model: "gpt-5",
      approval: "ask",
    });
  });

  test("Cursor stays on auto and has no model when it picks its own", () => {
    expect(siblingSettings(source, { provider: "cursor", label: "Cursor" })).toEqual({
      cwd: "/work",
      planMode: true,
      provider: "cursor",
    });
  });

  test("works without any source settings", () => {
    expect(siblingSettings(undefined, t("kimi", "k3"))).toEqual({ provider: "kimi", model: "k3", approval: "ask" });
  });
});

describe("sourceSettings", () => {
  test("sets ask on a provider that can ask and leaves Cursor alone", () => {
    expect(sourceSettings({ cwd: "/w" }, "claude")).toEqual({ cwd: "/w", approval: "ask" });
    expect(sourceSettings(undefined, "kimi")).toEqual({ approval: "ask" });
    expect(sourceSettings({ cwd: "/w" }, "cursor")).toEqual({ cwd: "/w" });
    expect(sourceSettings(undefined, "cursor")).toBeUndefined();
  });
});

describe("siblingPosition", () => {
  test("lays siblings in a row at the source's height, one node width apart plus a gap", () => {
    const a = siblingPosition({ x: 10, y: 20 }, 0);
    const b = siblingPosition({ x: 10, y: 20 }, 1);
    expect(a.y).toBe(20);
    expect(a.x).toBeGreaterThan(10);
    expect(b.x - a.x).toBe(a.x - 10);
  });
});
