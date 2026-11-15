import type { Pool } from "pg";
import { inTransaction, RequestError } from "../requests/repository.ts";

/**
 * Issue reports about a borrowing. Only the borrower or lender of that
 * borrowing can report it, and only ever see their own reports. Saving a
 * report has no side effects: no status changes, Switchies or penalties.
 */

export const REPORT_CATEGORIES = [
  "damaged",
  "not_returned",
  "not_as_described",
  "pickup_return",
  "conduct",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface ReportInput {
  bookingId: string;
  category: ReportCategory;
  description: string;
  clientNonce: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DESCRIPTION_LIMITS = { min: 10, max: 1000 };
/** Reports one person can submit per hour. */
export const REPORTS_PER_HOUR = 5;

/** Checks the request body. Never reads a user id from it. */
export function parseReport(body: unknown): ReportInput {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const bookingId = typeof b.bookingId === "string" || typeof b.bookingId === "number" ? String(b.bookingId) : "";
  if (!/^\d{1,18}$/.test(bookingId)) throw new RequestError(400, "Choose the borrowing this is about.");
  if (typeof b.category !== "string" || !(REPORT_CATEGORIES as readonly string[]).includes(b.category)) {
    throw new RequestError(400, "Choose what kind of issue this is.");
  }
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.includes("\0")) throw new RequestError(400, "The description contains characters we can't save.");
  if (description.length < DESCRIPTION_LIMITS.min) {
    throw new RequestError(400, `Describe what happened in at least ${DESCRIPTION_LIMITS.min} characters.`);
  }
  if (description.length > DESCRIPTION_LIMITS.max) {
    throw new RequestError(400, `Keep the description under ${DESCRIPTION_LIMITS.max} characters.`);
  }
  if (typeof b.clientNonce !== "string" || !UUID.test(b.clientNonce)) {
    throw new RequestError(400, "This report couldn't be sent. Reload the page and try again.");
  }
  return { bookingId, category: b.category as ReportCategory, description, clientNonce: b.clientNonce.toLowerCase() };
}

export interface SavedReport {
  id: string;
  status: string;
  createdAt: string;
  /** True when this matched a report already saved (a retry or double submit). */
  duplicate: boolean;
}

export async function createReport(pool: Pool, reporterId: string, input: ReportInput): Promise<SavedReport> {
  return inTransaction(pool, async (client) => {
    // One submission at a time per person, so the rate limit and duplicate checks can't be raced.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 7))", [reporterId]);

    const booking = await client.query(
      "select 1 from borrow_requests where id = $1 and (borrower_id = $2 or lender_id = $2)",
      [input.bookingId, reporterId],
    );
    // Not found and not yours look the same, so this doesn't reveal other people's borrowings.
    if (!booking.rowCount) throw new RequestError(404, "We couldn't find that borrowing in your requests.");

    // The same form submitted twice (double click, retry after a timeout) returns the first report.
    const existing = await client.query<{ id: string; status: string; created_at: Date }>(
      `select id::text, status, created_at from issue_reports
       where reporter_id = $1 and (client_nonce = $2
         or (booking_id = $3 and category = $4 and description = $5 and created_at > now() - interval '10 minutes'))
       order by created_at limit 1`,
      [reporterId, input.clientNonce, input.bookingId, input.category, input.description],
    );
    if (existing.rows[0]) {
      const r = existing.rows[0];
      return { id: r.id, status: r.status, createdAt: r.created_at.toISOString(), duplicate: true };
    }

    const recent = await client.query<{ n: number }>(
      "select count(*)::int as n from issue_reports where reporter_id = $1 and created_at > now() - interval '1 hour'",
      [reporterId],
    );
    if (recent.rows[0].n >= REPORTS_PER_HOUR) {
      throw new RequestError(429, "You've sent several reports recently. Please try again in a little while.");
    }

    const saved = await client.query<{ id: string; status: string; created_at: Date }>(
      `insert into issue_reports (reporter_id, booking_id, category, description, client_nonce)
       values ($1, $2, $3, $4, $5) returning id::text, status, created_at`,
      [reporterId, input.bookingId, input.category, input.description, input.clientNonce],
    );
    const r = saved.rows[0];
    return { id: r.id, status: r.status, createdAt: r.created_at.toISOString(), duplicate: false };
  });
}

export interface MyReport {
  id: string;
  bookingId: string;
  itemTitle: string;
  category: ReportCategory;
  status: string;
  createdAt: string;
}

/** The reporter's own reports. Never includes reviewer notes or anyone else's reports. */
export async function listMyReports(pool: Pool, reporterId: string): Promise<MyReport[]> {
  const result = await pool.query<{
    id: string;
    booking_id: string;
    item_title: string;
    category: ReportCategory;
    status: string;
    created_at: Date;
  }>(
    `select r.id::text, r.booking_id::text, i.title as item_title, r.category, r.status, r.created_at
     from issue_reports r
     join borrow_requests b on b.id = r.booking_id
     join items i on i.id = b.item_id
     where r.reporter_id = $1
     order by r.created_at desc limit 50`,
    [reporterId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    itemTitle: r.item_title,
    category: r.category,
    status: r.status,
    createdAt: r.created_at.toISOString(),
  }));
}
