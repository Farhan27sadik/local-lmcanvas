/** Resuming a session whose background task never finished replays the task's notification first,
 *  and Claude Code answers it with an empty result (no turns) before it runs the prompt. The returned
 *  check is true for those results, so a run doesn't end before its own prompt is answered. */
export function notificationResultFilter(): (msg: unknown) => boolean {
  let owed = 0;
  return (msg) => {
    if (typeof msg !== "object" || msg === null) return false;
    const m = msg as Record<string, unknown>;
    if (m.type === "system" && m.subtype === "task_notification") {
      owed += 1;
      return false;
    }
    if (m.type !== "result" || m.num_turns !== 0 || owed === 0) return false;
    owed -= 1;
    return true;
  };
}
