import { useEffect, useSyncExternalStore } from "react";
import { useAuthState } from "../auth/AuthContext";
import {
  getAccountState,
  refreshAccount,
  resetAccount,
  subscribeToAccount,
} from "../services/accountStore";
import {
  getRequestState,
  loadRequests,
  resetRequests,
  subscribeToRequests,
} from "../services/requestStore";

/**
 * Keeps the request and balance stores in step with who is logged in.
 * Mounted once, near the top of the app.
 */
export function useAccountSync() {
  const { status, user, getToken } = useAuthState();
  const userId = status === "signed-in" ? (user?.id ?? null) : null;

  useEffect(() => {
    if (!userId) {
      resetRequests();
      resetAccount();
      return;
    }
    void loadRequests(userId, getToken);
    void refreshAccount(getToken, userId);
    // Balances change when someone else approves a request, so re-check when
    // the tab comes back into focus.
    const onFocus = () => {
      void refreshAccount(getToken, userId);
      void loadRequests(userId, getToken);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // Keyed on the user, not getToken, whose identity changes on refresh.
  }, [userId]);
}

/** The user's requests (and incoming requests for their items). */
export function useRequests() {
  return useSyncExternalStore(subscribeToRequests, getRequestState);
}

/** The user's Switchies balance from the server, or null while unknown. */
export function useBalance() {
  return useSyncExternalStore(subscribeToAccount, getAccountState).balance;
}
