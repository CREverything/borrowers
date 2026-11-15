/**
 * Input checks for borrow and event requests. Only dates, item ids and event
 * text are read from the client. Prices, totals, lenders and the borrower are
 * always worked out on the server.
 */
export interface BorrowRequestInput {
  itemId: number;
  startDate: string;
  endDate: string;
}

export interface EventRequestInput {
  eventTitle: string;
  description: string;
  startDate: string;
  endDate: string;
  itemIds: number[];
}

export const MAX_EVENT_ITEMS = 20;
const MAX_DAYS_AHEAD = 365;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const DAY_MS = 86_400_000;

function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

/** Inclusive day count: the 14th to the 15th is 2 days. */
export const daysInclusive = (start: string, end: string) =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;

function checkDates(startDate: unknown, endDate: unknown): Result<{ startDate: string; endDate: string }> {
  if (!isISODate(startDate) || !isISODate(endDate)) return { ok: false, error: "Choose valid start and end dates." };
  // One day of slack, because the borrower's "today" may be behind UTC.
  if (startDate < isoDaysFromNow(-1)) return { ok: false, error: "The start date can't be in the past." };
  if (startDate > isoDaysFromNow(MAX_DAYS_AHEAD)) return { ok: false, error: "Pick dates within the next year." };
  if (endDate < startDate) return { ok: false, error: "The end date must be on or after the start date." };
  return { ok: true, value: { startDate, endDate } };
}

const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;

const asObject = (body: unknown) =>
  body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;

export function parseBorrowRequest(body: unknown): Result<BorrowRequestInput> {
  const input = asObject(body);
  if (!input || !isId(input.itemId)) return { ok: false, error: "Choose an item to borrow." };
  const dates = checkDates(input.startDate, input.endDate);
  if (!dates.ok) return dates;
  return { ok: true, value: { itemId: input.itemId, ...dates.value } };
}

export function parseEventRequest(body: unknown): Result<EventRequestInput> {
  const input = asObject(body);
  if (!input) return { ok: false, error: "Send the event request as a JSON object." };
  const title = typeof input.eventTitle === "string" ? input.eventTitle.trim() : "";
  if (!title || title.length > 120) return { ok: false, error: "Give the event a name of up to 120 characters." };
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > 500) return { ok: false, error: "Keep the event description under 500 characters." };
  if (!Array.isArray(input.itemIds) || input.itemIds.length === 0 || !input.itemIds.every(isId)) {
    return { ok: false, error: "Choose at least one item." };
  }
  const itemIds = [...new Set(input.itemIds as number[])];
  if (itemIds.length > MAX_EVENT_ITEMS) return { ok: false, error: `Request up to ${MAX_EVENT_ITEMS} items at once.` };
  const dates = checkDates(input.startDate, input.endDate);
  if (!dates.ok) return dates;
  return { ok: true, value: { eventTitle: title, description, itemIds, ...dates.value } };
}

export function parseId(raw: unknown): number | null {
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 && id <= Number.MAX_SAFE_INTEGER ? id : null;
}
