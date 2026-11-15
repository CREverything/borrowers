import type { BorrowRequest, EventRequest, ISODate } from "../types";
import { refreshAccount } from "./accountStore";
import { authedFetch } from "./api";
import { loadItems } from "./itemsStore";

/**
 * Borrow and event requests, stored in TigerData through the API. The
 * backend works out the borrower, lender, price and total itself, so only
 * item ids and dates are sent from here.
 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface RequestState {
  status: LoadStatus;
  /** Whose requests these are, so a different login reloads. */
  userId: string | null;
  borrowRequests: BorrowRequest[];
  eventRequests: EventRequest[];
  /** Requests other people made for this user's items. */
  incoming: BorrowRequest[];
}

type GetToken = () => Promise<string | null>;

const empty: RequestState = {
  status: "idle",
  userId: null,
  borrowRequests: [],
  eventRequests: [],
  incoming: [],
};

let state: RequestState = empty;
const listeners = new Set<() => void>();

function setState(next: RequestState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getRequestState = () => state;

export function subscribeToRequests(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Requests used to be kept only in this browser. They're on the server now.
try {
  localStorage.removeItem("borrowers.requests.v1");
} catch {
  // Storage unavailable; nothing to clean up.
}

/** A refused request, with the server's explanation. */
export class RequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, getToken: GetToken, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await authedFetch(path, getToken, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
  } catch {
    throw new RequestError(0, "We couldn't reach the server. Check your connection and try again.");
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new RequestError(
      response.status,
      body?.error ??
        (response.status === 401 ? "Please log in again." : "Something went wrong. Please try again."),
    );
  }
  return body as T;
}

let inflight: Promise<void> | null = null;

/** Loads the user's requests and incoming requests. Shared by concurrent callers. */
export function loadRequests(userId: string, getToken: GetToken): Promise<void> {
  if (inflight && state.userId === userId) return inflight;
  setState({ ...(state.userId === userId ? state : empty), userId, status: "loading" });
  inflight = Promise.all([
    call<{ borrowRequests: BorrowRequest[]; eventRequests: EventRequest[] }>("/api/requests", getToken),
    call<BorrowRequest[]>("/api/incoming-requests", getToken),
  ])
    .then(([mine, incoming]) => {
      if (state.userId !== userId) return;
      setState({ status: "ready", userId, ...mine, incoming });
    })
    .catch((error: Error) => {
      console.warn("Could not load requests:", error.message);
      if (state.userId === userId) setState({ ...state, status: "error" });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const resetRequests = () => setState(empty);

/** Reloads after a change, and refreshes anything that depends on it. */
async function afterChange(getToken: GetToken, { items = false, balance = false } = {}) {
  if (state.userId) await loadRequests(state.userId, getToken);
  if (items) void loadItems(true);
  if (balance) void refreshAccount(getToken);
}

export async function createBorrowRequest(
  getToken: GetToken,
  input: { itemId: number; startDate: ISODate; endDate: ISODate },
): Promise<BorrowRequest> {
  const request = await call<BorrowRequest>("/api/requests", getToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  void afterChange(getToken);
  return request;
}

export async function createEventRequest(
  getToken: GetToken,
  input: { eventTitle: string; description: string; startDate: ISODate; endDate: ISODate; itemIds: number[] },
): Promise<EventRequest> {
  const event = await call<EventRequest>("/api/event-requests", getToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  void afterChange(getToken);
  return event;
}

export async function cancelBorrowRequest(getToken: GetToken, id: string) {
  await call(`/api/requests/${encodeURIComponent(id)}/cancel`, getToken, { method: "POST" });
  await afterChange(getToken);
}

export async function cancelEventRequest(getToken: GetToken, id: string) {
  await call(`/api/event-requests/${encodeURIComponent(id)}/cancel`, getToken, { method: "POST" });
  await afterChange(getToken);
}

/** Lender approves: the dates become booked and the Switchies move. */
export async function approveRequest(getToken: GetToken, id: string) {
  await call(`/api/requests/${encodeURIComponent(id)}/approve`, getToken, { method: "POST" });
  await afterChange(getToken, { items: true, balance: true });
}

export async function declineRequest(getToken: GetToken, id: string) {
  await call(`/api/requests/${encodeURIComponent(id)}/decline`, getToken, { method: "POST" });
  await afterChange(getToken);
}
