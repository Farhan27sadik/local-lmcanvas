import type { KimiModelInfo } from "@shared/types";
import type { RunnerEvent } from "./types";

type KimiToolCall = { id?: string; function?: { name?: string; arguments?: string } };

/**
 * Maps one `kimi -p --output-format stream-json` line to runner events. Kimi prints whole
 * messages (no deltas): `assistant` (text and/or tool_calls), `tool` (a result), and `meta`
 * (the session ID arrives last, in `session.resume_hint`). Anything else, such as a tool's own
 * stdout leaking onto the stream, is ignored.
 */
export function kimiLineEvents(obj: unknown): RunnerEvent[] {
  if (!obj || typeof obj !== "object") return [];
  const line = obj as Record<string, unknown>;

  if (line.role === "meta") {
    const id = line.session_id;
    if (line.type === "session.resume_hint" && typeof id === "string" && id) {
      return [{ kind: "session", session: { provider: "kimi", id } }];
    }
    return [];
  }

  if (line.role === "tool") {
    const id = line.tool_call_id;
    if (typeof id !== "string") return [];
    return [
      {
        kind: "tool_result",
        toolUseId: id,
        content: typeof line.content === "string" ? line.content : JSON.stringify(line.content ?? ""),
        isError: false,
      },
    ];
  }

  if (line.role !== "assistant") return [];
  const events: RunnerEvent[] = [];
  const thinking = line.reasoning_content ?? line.thinking;
  if (typeof thinking === "string" && thinking) events.push({ kind: "thinking_delta", text: thinking });
  if (typeof line.content === "string" && line.content) {
    events.push({ kind: "text_delta", text: line.content });
  }
  if (Array.isArray(line.tool_calls)) {
    for (const call of line.tool_calls as KimiToolCall[]) {
      events.push({
        kind: "tool_use",
        toolUseId: call.id ?? `kimi_${Math.random().toString(36).slice(2)}`,
        name: call.function?.name ?? "tool",
        input: parseArgs(call.function?.arguments),
      });
    }
  }
  return events;
}

function parseArgs(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { arguments: raw };
  }
}

/**
 * Reads the `[models."<alias>"]` tables out of ~/.kimi-code/config.toml. Only the keys named
 * here are looked at, so the api key and OAuth entries in the same file are never touched.
 */
export function parseKimiModels(toml: string): KimiModelInfo[] {
  const models: KimiModelInfo[] = [];
  let current: KimiModelInfo | null = null;
  for (const raw of toml.split(/\r?\n/)) {
    const text = raw.trim();
    const header = /^\[models\."([^"]+)"\]$/.exec(text);
    if (header) {
      current = { id: header[1], displayName: header[1], imageInput: false };
      models.push(current);
      continue;
    }
    if (text.startsWith("[")) {
      current = null;
      continue;
    }
    if (!current) continue;
    const kv = /^(display_name|max_context_size|capabilities)\s*=\s*(.+)$/.exec(text);
    if (!kv) continue;
    if (kv[1] === "display_name") current.displayName = kv[2].replace(/^"|"$/g, "");
    else if (kv[1] === "max_context_size") current.contextSize = Number(kv[2]) || undefined;
    else current.imageInput = /"image_in"/.test(kv[2]);
  }
  return models;
}
