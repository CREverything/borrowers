import { authedFetch } from "./api";

/** Report categories, matching the server's list, with the labels people see. */
export const REPORT_CATEGORIES = [
  { value: "damaged", label: "Item was damaged" },
  { value: "not_returned", label: "Item was not returned" },
  { value: "not_as_described", label: "Item was not as described" },
  { value: "pickup_return", label: "Pickup or return problem" },
  { value: "conduct", label: "Uncomfortable or inappropriate interaction" },
  { value: "other", label: "Other issue" },
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export const categoryLabel = (value: string) =>
  REPORT_CATEGORIES.find((c) => c.value === value)?.label ?? "Other issue";

export const REPORT_LIMITS = { min: 10, max: 1000 };

export interface MyReport {
  id: string;
  bookingId: string;
  itemTitle: string;
  category: ReportCategory;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: string;
}

type GetToken = () => Promise<string | null>;

export class ReportError extends Error {}

async function call<T>(path: string, getToken: GetToken, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(path, getToken, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
  } catch {
    throw new ReportError("We couldn't reach the server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ReportError(body?.error ?? "Something went wrong. Please try again.");
  return body as T;
}

/**
 * Sends a report. `clientNonce` is made once per form, so a retry or double
 * click returns the same report instead of creating another.
 */
export const submitReport = (
  getToken: GetToken,
  body: { bookingId: string; category: ReportCategory; description: string; clientNonce: string },
) =>
  call<{ id: string; status: string; createdAt: string }>("/api/reports", getToken, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listMyReports = (getToken: GetToken) => call<MyReport[]>("/api/reports", getToken);
