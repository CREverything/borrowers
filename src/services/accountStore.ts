import { authedFetch } from "./api";

/**
 * The logged-in user's Switchies balance, stored in TigerData and read from
 * GET /api/me. The server is the only place it changes (when a lender
 * approves a request), so the browser just displays it.
 */
export interface AccountState {
  userId: string | null;
  balance: number | null;
  /** Average score lenders have given this user as a borrower. */
  borrowerScore: { average: number; count: number } | null;
}

let state: AccountState = { userId: null, balance: null, borrowerScore: null };
const listeners = new Set<() => void>();

function setState(next: AccountState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getAccountState = () => state;

export function subscribeToAccount(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type GetToken = () => Promise<string | null>;

/** Loads the balance for `userId`, or re-reads it if `userId` is omitted. */
export async function refreshAccount(getToken: GetToken, userId = state.userId) {
  if (!userId) return;
  if (userId !== state.userId) setState({ userId, balance: null, borrowerScore: null });
  try {
    const response = await authedFetch("/api/me", getToken, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      console.warn(`[borrowers] Couldn't load your Switchies balance: ${response.status} ${body?.error ?? ""}`);
      return;
    }
    const body = (await response.json()) as {
      userId: string;
      switchiesBalance: number;
      borrowerScore: AccountState["borrowerScore"];
    };
    if (state.userId === userId && body.userId === userId) {
      setState({ userId, balance: body.switchiesBalance, borrowerScore: body.borrowerScore ?? null });
    }
  } catch (error) {
    // Leave the last known balance in place; it reloads on the next change.
    console.warn("[borrowers] Couldn't load your Switchies balance:", (error as Error).message);
  }
}

export const resetAccount = () => setState({ userId: null, balance: null, borrowerScore: null });
