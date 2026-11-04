// .mjs keeps the bun:test import out of `bun run typecheck`.
import { describe, expect, test } from "bun:test";
import { createRpc } from "./acpRpc.ts";

function setup(handlers = {}) {
  const written = [];
  const rpc = createRpc((line) => written.push(JSON.parse(line)), {
    onNotification: () => {},
    onRequest: async () => null,
    ...handlers,
  });
  return { rpc, written };
}

describe("createRpc", () => {
  test("a call resolves with the matching result", async () => {
    const { rpc, written } = setup();
    const pending = rpc.call("session/new", { cwd: "/w" });
    expect(written[0]).toMatchObject({ jsonrpc: "2.0", method: "session/new", params: { cwd: "/w" } });
    rpc.feed({ jsonrpc: "2.0", id: written[0].id, result: { sessionId: "s1" } });
    expect(await pending).toEqual({ sessionId: "s1" });
  });

  test("an error response rejects the call with its message", async () => {
    const { rpc, written } = setup();
    const pending = rpc.call("session/prompt", {});
    rpc.feed({ id: written[0].id, error: { code: -1, message: "not signed in" } });
    await expect(pending).rejects.toThrow("not signed in");
  });

  test("concurrent calls are matched by id, not by order", async () => {
    const { rpc, written } = setup();
    const first = rpc.call("a", {});
    const second = rpc.call("b", {});
    rpc.feed({ id: written[1].id, result: "B" });
    rpc.feed({ id: written[0].id, result: "A" });
    expect([await first, await second]).toEqual(["A", "B"]);
  });

  test("a request from the agent is answered with the handler's result", async () => {
    const { rpc, written } = setup({ onRequest: async (method) => ({ got: method }) });
    rpc.feed({ jsonrpc: "2.0", id: 7, method: "session/request_permission", params: {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(written[0]).toEqual({ jsonrpc: "2.0", id: 7, result: { got: "session/request_permission" } });
  });

  test("a failing handler answers with a JSON-RPC error", async () => {
    const { rpc, written } = setup({ onRequest: async () => { throw new Error("nope"); } });
    rpc.feed({ id: 3, method: "fs/read_text_file" });
    await new Promise((r) => setTimeout(r, 0));
    expect(written[0]).toMatchObject({ id: 3, error: { message: "nope" } });
  });

  test("notifications reach their handler and get no reply", () => {
    const seen = [];
    const { rpc, written } = setup({ onNotification: (method, params) => seen.push([method, params]) });
    rpc.feed({ method: "session/update", params: { update: 1 } });
    expect(seen).toEqual([["session/update", { update: 1 }]]);
    expect(written).toEqual([]);
  });

  test("failAll rejects every call still waiting, and junk input is ignored", async () => {
    const { rpc } = setup();
    const pending = rpc.call("session/prompt", {});
    rpc.feed(null);
    rpc.feed("text");
    rpc.feed({ id: 999, result: 1 });
    rpc.failAll(new Error("kimi exited with code 1"));
    await expect(pending).rejects.toThrow("kimi exited");
  });
});
