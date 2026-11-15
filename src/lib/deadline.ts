/**
 * Countdown maths for return deadlines. Always worked out from the stored
 * deadline and the current time; nothing counts down in the database.
 * No imports, so it can be unit-tested directly with Node.
 */

export type Urgency = "normal" | "upcoming" | "soon" | "overdue";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Parses an ISO time, or null if it's missing or invalid. */
export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * normal: more than 72 hours left. upcoming: within 72 hours. soon: within
 * 24 hours. overdue: the deadline has passed. null when there's no deadline.
 */
export function urgencyOf(dueAt: string | null | undefined, now: number): Urgency | null {
  const due = parseTime(dueAt);
  if (due === null) return null;
  const left = due - now;
  if (left <= 0) return "overdue";
  if (left <= DAY) return "soon";
  if (left <= 3 * DAY) return "upcoming";
  return "normal";
}

/**
 * A short duration: "3h 42m", "2d 5h", "45m", "under a minute". Hours and
 * minutes under a day; days and hours above.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MINUTE));
  if (total < 1) return "under a minute";
  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  const minutes = total % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** "Due in 3h 42m" or "Overdue by 2h", for a deadline relative to now. */
export function describeDeadline(dueAt: string | null | undefined, now: number): string | null {
  const due = parseTime(dueAt);
  if (due === null) return null;
  return due > now ? `Due in ${formatDuration(due - now)}` : `Overdue by ${formatDuration(now - due)}`;
}

/**
 * How far through the loan we are, 0 to 1, from the handover to the
 * deadline. null if either time is missing or they're the wrong way round.
 */
export function loanProgress(
  startAt: string | null | undefined,
  dueAt: string | null | undefined,
  now: number,
): number | null {
  const start = parseTime(startAt);
  const due = parseTime(dueAt);
  if (start === null || due === null || due <= start) return null;
  return Math.min(1, Math.max(0, (now - start) / (due - start)));
}

/** Switchies charged for each full hour an item comes back late. Matches the backend. */
export const LATE_FEE_PER_HOUR = 5;

/** The late fee if it came back at `returnedAt` (or now): 5 per full hour past the deadline. */
export function lateFee(dueAt: string | null | undefined, returnedAt: number): number {
  const due = parseTime(dueAt);
  if (due === null || returnedAt <= due) return 0;
  return Math.floor((returnedAt - due) / HOUR) * LATE_FEE_PER_HOUR;
}

/**
 * The deadlines worth flagging (overdue, or due within 24 hours), most
 * pressing first: overdue items before upcoming ones, then soonest deadline.
 */
export function urgentFirst<T extends { returnDueAt?: string | null }>(loans: T[], now: number): T[] {
  return loans
    .filter((l) => {
      const u = urgencyOf(l.returnDueAt, now);
      return u === "soon" || u === "overdue";
    })
    .sort((a, b) => parseTime(a.returnDueAt)! - parseTime(b.returnDueAt)!);
}
