// .mjs keeps the bun:test import out of `bun run typecheck`.
import { describe, expect, test } from "bun:test";
import { kimiWindowFor } from "./kimiWindow.ts";

const models = [
  { id: "old", displayName: "Old", contextSize: 131072, imageInput: false, latest: false },
  { id: "k3", displayName: "K3", contextSize: 262144, imageInput: false, latest: true },
];

describe("kimiWindowFor", () => {
  test("uses the node's own model", () => {
    expect(kimiWindowFor(models, "old")).toBe(131072);
  });

  test("falls back to the first current model when the node has none or an unknown one", () => {
    expect(kimiWindowFor(models, undefined)).toBe(262144);
    expect(kimiWindowFor(models, "gone")).toBe(262144);
  });

  test("no models, no window", () => {
    expect(kimiWindowFor([], "k3")).toBeUndefined();
  });
});
