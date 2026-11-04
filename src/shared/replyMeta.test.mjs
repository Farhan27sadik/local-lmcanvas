import { expect, test } from "bun:test";
import { formatReplyTime, formatReplyTimeFull } from "./replyMeta.ts";

const at = Date.UTC(2026, 10, 4, 7, 29, 12); // 13:29:12 in UTC+6
const opts = { locale: "en-GB", timeZone: "Asia/Dhaka" };

test("a reply from this year shows month, day and time", () => {
  expect(formatReplyTime(at, { ...opts, now: Date.UTC(2026, 10, 5) })).toMatch(/^4 Nov,? (at )?13:29$/);
});

test("a reply from another year includes the year", () => {
  expect(formatReplyTime(at, { ...opts, now: Date.UTC(2027, 0, 2) })).toMatch(/^4 Nov 2026,? (at )?13:29$/);
});

test("the hover title has the full date and the seconds", () => {
  const full = formatReplyTimeFull(at, opts);
  expect(full).toContain("Wednesday");
  expect(full).toContain("13:29:12");
});
