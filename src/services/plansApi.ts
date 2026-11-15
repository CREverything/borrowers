import type { PlanLink, PlanRequirement } from "../lib/planning";
import type { BorrowRequest, ISODate } from "../types";
import { refreshAccount } from "./accountStore";
import { refreshActivity } from "./activityStore";
import { authedFetch } from "./api";
import { getRequestState, loadRequests } from "./requestStore";

/** A saved event plan from /api/plans. Request statuses in `links` are live. */
export interface SavedPlan {
  id: string;
  title: string;
  description: string;
  prompt: string;
  eventDate: ISODate | null;
  startAt: string | null;
  returnAt: string | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  requirements: PlanRequirement[];
  links: PlanLink[];
  createdAt: string;
  updatedAt: string;
}

export type PlanFields = Omit<SavedPlan, "id" | "links" | "createdAt" | "updatedAt">;

export interface SubmitResult {
  itemId: number;
  requirementKey: string;
  ok: boolean;
  alreadyRequested?: boolean;
  request?: BorrowRequest;
  error?: string;
}

export class PlanError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type GetToken = () => Promise<string | null>;

async function call<T>(path: string, getToken: GetToken, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(path, getToken, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
  } catch (error) {
    throw new PlanError(
      (error as Error).message === "Not logged in"
        ? "Please log in again."
        : "We couldn't reach the server. Check your connection and try again.",
      0,
    );
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new PlanError(body?.error ?? "Something went wrong. Please try again.", res.status);
  return body as T;
}

export const listPlans = (getToken: GetToken) => call<SavedPlan[]>("/api/plans", getToken);

export const getPlan = (getToken: GetToken, id: string) =>
  call<SavedPlan>(`/api/plans/${encodeURIComponent(id)}`, getToken);

export const createPlan = (getToken: GetToken, fields: PlanFields) =>
  call<SavedPlan>("/api/plans", getToken, { method: "POST", body: JSON.stringify(fields) });

export const updatePlan = (getToken: GetToken, id: string, fields: Partial<PlanFields>) =>
  call<SavedPlan>(`/api/plans/${encodeURIComponent(id)}`, getToken, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });

export const deletePlan = (getToken: GetToken, id: string) =>
  call<{ ok: true }>(`/api/plans/${encodeURIComponent(id)}`, getToken, { method: "DELETE" });

export const duplicatePlan = (getToken: GetToken, id: string) =>
  call<SavedPlan>(`/api/plans/${encodeURIComponent(id)}/duplicate`, getToken, { method: "POST" });

/**
 * Requests the selected listings. The server checks and books each one
 * separately and reports per listing; afterwards My requests, the balance
 * and the activity bar are refreshed.
 */
export async function submitPlanRequests(
  getToken: GetToken,
  id: string,
  selections: { requirementKey: string; itemId: number }[],
) {
  const body = await call<{ results: SubmitResult[]; plan: SavedPlan }>(
    `/api/plans/${encodeURIComponent(id)}/requests`,
    getToken,
    { method: "POST", body: JSON.stringify({ selections }) },
  );
  const userId = getRequestState().userId;
  if (userId) void loadRequests(userId, getToken);
  void refreshAccount(getToken);
  void refreshActivity(getToken);
  return body;
}
