import { todayISO } from "../lib/dates";
import { authedFetch } from "./api";

/** Counts from GET /api/me/activity-summary for the logged-in user. */
export interface ActivitySummary {
  myListings: number;
  currentlyLent: number;
  pendingApprovals: number;
}

export interface ActivityState {
  userId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  /** The last good counts. Kept through a failed refresh. */
  summary: ActivitySummary | null;
}

type GetToken = () => Promise<string | null>;

const empty: ActivityState = { userId: null, status: "idle", summary: null };
let state = empty;
let lastToken: GetToken | null = null;
const listeners = new Set<() => void>();

function setState(next: ActivityState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getActivityState = () => state;

export function subscribeToActivity(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Loads the counts for `userId`, or re-reads them for the current user. */
export async function refreshActivity(getToken: GetToken = lastToken!, userId = state.userId) {
  if (!userId || !getToken) return;
  lastToken = getToken;
  if (userId !== state.userId) setState({ ...empty, userId, status: "loading" });
  else if (!state.summary) setState({ ...state, status: "loading" });
  try {
    const res = await authedFetch(
      `/api/me/activity-summary?today=${todayISO()}`,
      getToken,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(String(res.status));
    const summary = (await res.json()) as ActivitySummary;
    if (state.userId === userId) setState({ userId, status: "ready", summary });
  } catch (error) {
    console.warn("[borrowers] Couldn't load activity counts:", (error as Error).message);
    if (state.userId === userId) setState({ ...state, status: state.summary ? "ready" : "error" });
  }
}

export function resetActivity() {
  lastToken = null;
  setState(empty);
}
