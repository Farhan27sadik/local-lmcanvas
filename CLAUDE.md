# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`local-lmcanvas` — fully-local, canvas-based branching AI conversation tool (Electron + React + TypeScript). This is the xack20 fork; its default branch is `local/model-labels`.

See [AGENTS.md](./AGENTS.md) for build commands, layout, conventions, and the four-place rule for adding channels. Read it first.

Always run `bun run typecheck` before reporting work complete.

Unit tests are `*.test.mjs` files run with Bun (`bun test src/shared/history.test.mjs` runs one). Run each file in its own `bun test <file>` process; never pass several files to one `bun test` invocation. `settings.test.mjs` redirects `HOME` and refuses to run once another file has loaded the storage modules. Tests import the `.ts` source directly by relative path (no `@shared`/`@/` aliases). There's no lint script.

## Architecture

**Data model.** Each canvas is one JSON file, `~/.local-lmcanvas/canvases/<id>.json`, written atomically by `src/main/storage/`. A node's `data.chat` holds its own `messages`, `parentIds`, and `providerSession` (a Claude session ID or Codex thread ID). Only `parentIds[0]` is the conversation parent. `getMessageHistoryForNode` in `src/shared/history.ts` walks that chain. Any other parents are merge inputs (`buildMergeContext`).

**A chat run, end to end:**
1. `src/renderer/src/hooks/useNodeChat.ts` calls `window.api.chat.start` with the branch history plus the node's and primary parent's `providerSession`.
2. `chat:start` in `src/main/index.ts` resolves the provider, model, cwd, and system prompt. The node setting wins, then the canvas, then `settings.json`.
3. `runAgent` in `src/main/agents/index.ts` dispatches to the Claude runner (`src/main/claude/runner.ts`, Agent SDK) or the Codex/Cursor adapters in `src/main/agents/`.
4. Runners emit `RunnerEvent`s. Main forwards them as `chat:event` to the client that started the chat. Every chat ends with exactly one `done`, which the renderer waits for.

**Resume vs replay.** If the node or its primary parent has a session from the *same* provider, only the new prompt is sent. For Claude that means `resume`, plus `forkSession` when branching off the parent. Otherwise the whole branch is replayed as a `[User]`/`[Assistant]` transcript (`src/main/claude/history.ts`), which also happens after a provider switch. A Claude replay is fitted to the model's window (`replayFit.ts`, `replaySummary.ts`) and retried on overflow (`overflowRetry.ts`). The README's "Context window" section describes how this behaves for the user.

**One call table, two transports.** `src/main/api/registry.ts` is the only place handlers are registered. Every handler gets a `Client` (desktop window or browser tab) as its first argument. Scope is enforced in `invoke`: `desktop-only` is the default, `shared` lets paired browsers call it. The same table is bound to Electron IPC and to the browser-access server in `src/main/web/`. In a browser, `src/renderer/src/lib/webBridge.ts` provides the same `window.api` over HTTPS + WebSocket. Only one place (the desktop or a browser) holds a canvas lock at a time (`src/main/web/canvasLocks.ts`, `src/renderer/src/lib/lockClaims.ts`).

**Renderer state.** `useCanvasStore.ts` is a Zustand store *factory* (`createCanvasStoreApi`) provided through React context. Each canvas pane gets its own instance, so read it through the context hooks rather than a global store.
