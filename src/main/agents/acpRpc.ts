import { errorMessage } from "./types";

type Pending = { resolve: (value: unknown) => void; reject: (err: Error) => void };

export type RpcHandlers = {
  onNotification: (method: string, params: unknown) => void;
  /** Answers a request from the agent; a rejection is sent back as a JSON-RPC error. */
  onRequest: (method: string, params: unknown) => Promise<unknown>;
};

/**
 * JSON-RPC 2.0 over already-split messages, as the Agent Client Protocol uses on stdio.
 * `write` gets one JSON line (no newline); `feed` takes each parsed message from the agent.
 */
export function createRpc(write: (line: string) => void, handlers: RpcHandlers) {
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const reply = (id: unknown, body: object): void => write(JSON.stringify({ jsonrpc: "2.0", id, ...body }));

  return {
    call(method: string, params: object): Promise<unknown> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        write(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      });
    },

    notify(method: string, params: object): void {
      write(JSON.stringify({ jsonrpc: "2.0", method, params }));
    },

    feed(message: unknown): void {
      if (!message || typeof message !== "object") return;
      const msg = message as { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: { message?: unknown } };

      if (typeof msg.method === "string") {
        if (msg.id === undefined) {
          handlers.onNotification(msg.method, msg.params);
          return;
        }
        handlers.onRequest(msg.method, msg.params).then(
          (result) => reply(msg.id, { result: result ?? null }),
          (err: unknown) => reply(msg.id, { error: { code: -32603, message: errorMessage(err) } }),
        );
        return;
      }

      if (typeof msg.id !== "number") return;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(typeof msg.error.message === "string" ? msg.error.message : "ACP request failed"));
      else entry.resolve(msg.result);
    },

    /** The agent went away: nothing still waiting will ever be answered. */
    failAll(err: Error): void {
      for (const entry of pending.values()) entry.reject(err);
      pending.clear();
    },
  };
}
