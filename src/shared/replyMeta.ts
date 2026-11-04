export type ReplyTimeOptions = { now?: number; locale?: string; timeZone?: string };

/** "Nov 4, 13:29" in the system's own format; the year is added when it isn't the current one. */
export function formatReplyTime(ms: number, { now = Date.now(), locale, timeZone }: ReplyTimeOptions = {}): string {
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(ms);
}

/** The full date and time with seconds, for the hover title. */
export function formatReplyTimeFull(ms: number, { locale, timeZone }: ReplyTimeOptions = {}): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "medium", timeZone }).format(ms);
}
