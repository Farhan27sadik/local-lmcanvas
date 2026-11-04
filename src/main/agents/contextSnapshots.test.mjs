// .mjs keeps the bun:test import out of `bun run typecheck`.
import { describe, expect, test } from "bun:test";
import { codexContext, kimiContext } from "./contextSnapshots.ts";

describe("codexContext", () => {
  test("measures the last call against the model's window", () => {
    const usage = { total: { totalTokens: 90_000 }, last: { totalTokens: 31_000 }, modelContextWindow: 258_400 };
    expect(codexContext(usage)).toMatchObject({ tokens: 31_000, window: 258_400, exact: true, autoCompactEnabled: false });
  });

  test("nothing to report without a window or a count", () => {
    expect(codexContext({ last: { totalTokens: 5 }, modelContextWindow: null })).toBeUndefined();
    expect(codexContext({ last: { totalTokens: 0 }, modelContextWindow: 100 })).toBeUndefined();
    expect(codexContext(undefined)).toBeUndefined();
    expect(codexContext("junk")).toBeUndefined();
  });
});

describe("kimiContext", () => {
  test("reads used and size from a usage_update", () => {
    expect(kimiContext({ sessionUpdate: "usage_update", used: 15_164, size: 262_144 })).toMatchObject({
      tokens: 15_164,
      window: 262_144,
      exact: true,
    });
  });

  test("ignores updates without usable numbers", () => {
    expect(kimiContext({ used: "15", size: 262_144 })).toBeUndefined();
    expect(kimiContext({ used: 10 })).toBeUndefined();
    expect(kimiContext(null)).toBeUndefined();
  });
});
