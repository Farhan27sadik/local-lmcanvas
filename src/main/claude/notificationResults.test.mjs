// src/main/claude/notificationResults.test.mjs
import { describe, expect, test } from "bun:test";
import { notificationResultFilter } from "./notificationResults.ts";

// The order Claude Code sends on resuming a session whose background agent was cut off.
const NOTICE = { type: "system", subtype: "task_notification", task_id: "a8e5", status: "failed", summary: "Background agent didn't finish before the previous session ended" };
const EMPTY = { type: "result", subtype: "success", is_error: false, num_turns: 0, result: "" };
const ANSWER = { type: "result", subtype: "success", is_error: false, num_turns: 1, result: "OK" };

describe("notificationResultFilter", () => {
  test("skips the empty result for a replayed notification, not the prompt's own", () => {
    const isNotificationResult = notificationResultFilter();
    expect([NOTICE, EMPTY, ANSWER].map(isNotificationResult)).toEqual([false, true, false]);
  });

  test("a result with no notice before it ends the run, even with no turns (e.g. /compact)", () => {
    const isNotificationResult = notificationResultFilter();
    expect(isNotificationResult(EMPTY)).toBe(false);
  });

  test("skips one result per notice", () => {
    const isNotificationResult = notificationResultFilter();
    expect([NOTICE, EMPTY, EMPTY].map(isNotificationResult)).toEqual([false, true, false]);
  });

  test("a notice during a turn doesn't swallow that turn's result", () => {
    const isNotificationResult = notificationResultFilter();
    expect([NOTICE, ANSWER].map(isNotificationResult)).toEqual([false, false]);
  });
});
