import { expect, test } from "bun:test";
import { kimiLineEvents, parseKimiModels } from "./kimiStream.ts";

// Lines captured from `kimi -p "Say hi, then run ls" --output-format stream-json` (Kimi Code 2.4.1).
const run = [
  { role: "meta", type: "system.version", version: "2.4.1" },
  "bun-node-744846f84", // a tool's own stdout leaking onto the stream is not JSON
  42, // ...and a file named "42" parses as a number
  {
    role: "assistant",
    content: "Hi!",
    tool_calls: [{ type: "function", id: "tool_a", function: { name: "Bash", arguments: '{"command":"ls","cwd":"/tmp"}' } }],
  },
  { role: "tool", tool_call_id: "tool_a", content: "a\nb\n" },
  { role: "assistant", content: "Ran `ls`." },
  { role: "meta", type: "session.resume_hint", session_id: "session_8e91", command: "kimi -r session_8e91" },
];

test("a whole Kimi run maps to text, tool use, tool result and the session", () => {
  const events = run.flatMap((line) => kimiLineEvents(line));
  expect(events).toEqual([
    { kind: "text_delta", text: "Hi!" },
    { kind: "tool_use", toolUseId: "tool_a", name: "Bash", input: { command: "ls", cwd: "/tmp" } },
    { kind: "tool_result", toolUseId: "tool_a", content: "a\nb\n", isError: false },
    { kind: "text_delta", text: "Ran `ls`." },
    { kind: "session", session: { provider: "kimi", id: "session_8e91" } },
  ]);
});

test("tool arguments that are not JSON are kept, not dropped", () => {
  const [ev] = kimiLineEvents({ role: "assistant", tool_calls: [{ id: "t", function: { name: "X", arguments: "not json" } }] });
  expect(ev).toMatchObject({ kind: "tool_use", input: { arguments: "not json" } });
});

const toml = `default_model = "kimi-code/k3.1-pro"
[providers."managed:kimi-code"]
api_key = "SECRET-DO-NOT-READ"
[models."kimi-code/k3"]
provider = "managed:kimi-code"
max_context_size = 262144
capabilities = [ "thinking", "image_in", "tool_use" ]
display_name = "K3"
[models."kimi-code/k3.1-pro"]
display_name = "K3.1 Pro"
[models."kimi-code/k3.1-pro-highspeed"]
display_name = "K3.1 Pro Highspeed"
[thinking]
display_name = "not a model"
`;

test("models come from the [models.*] tables only", () => {
  const models = parseKimiModels(toml);
  expect(models.map((m) => m.id)).toEqual(["kimi-code/k3", "kimi-code/k3.1-pro", "kimi-code/k3.1-pro-highspeed"]);
  expect(models[0]).toMatchObject({ displayName: "K3", contextSize: 262144, imageInput: true });
  expect(JSON.stringify(models)).not.toContain("SECRET");
});

test("the default model and its variants are the latest; the rest are older", () => {
  const latest = Object.fromEntries(parseKimiModels(toml).map((m) => [m.id, m.latest]));
  expect(latest).toEqual({ "kimi-code/k3": false, "kimi-code/k3.1-pro": true, "kimi-code/k3.1-pro-highspeed": true });
});

test("with no default_model, every model counts as latest", () => {
  const models = parseKimiModels(toml.replace(/^default_model.*$/m, ""));
  expect(models.every((m) => m.latest)).toBe(true);
});
