import { useEffect, useSyncExternalStore } from "react";
import { useAuthState } from "../auth/AuthContext";
import {
  getAccountState,
  refreshAccount,
  resetAccount,
  subscribeToAccount,
} from "../services/accountStore";
import { loadFavourites, resetFavourites } from "../services/favouritesStore";
import {
  getActivityState,
  refreshActivity,
  resetActivity,
  subscribeToActivity,
} from "../services/activityStore";
import {
  getNotificationState,
  getToasts,
  loadNotifications,
  resetNotifications,
  subscribeToNotifications,
  subscribeToToasts,
} from "../services/notificationStore";
import {
  getRequestState,
  loadRequests,
  resetRequests,
  subscribeToRequests,
} from "../services/requestStore";

/** How often to check for new notifications while the tab is open. */
const POLL_MS = 20_000;

/**
 * Keeps the request, balance and notification stores in step with who is
 * logged in. Mounted once, near the top of the app.
 */
export function useAccountSync() {
  const { status, user, getToken } = useAuthState();
  const userId = status === "signed-in" ? (user?.id ?? null) : null;

  useEffect(() => {
    if (!userId) {
      resetRequests();
      resetAccount();
      resetNotifications();
      resetActivity();
      resetFavourites();
      return;
    }
    const refresh = () => {
      void loadRequests(userId, getToken);
      void refreshAccount(getToken, userId);
      void loadNotifications(userId, getToken);
      void refreshActivity(getToken, userId);
      void loadFavourites(userId, getToken);
    };
    refresh();
    // Other people's actions (approvals, returns, reviews) change things, so
    // re-check when the tab comes back into focus and every 20 seconds while open.
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      // Something new (an approval, an extension decision, a return) usually
      // means the requests and balance changed too.
      void loadNotifications(userId, getToken).then((arrived) => {
        if (arrived > 0) {
          void loadRequests(userId, getToken);
          void refreshAccount(getToken, userId);
        }
      });
      // New incoming requests arrive without any action here, so poll the counts too.
      void refreshActivity(getToken, userId);
    }, POLL_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
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

/** The user's average score from lenders, or null if none yet. */
export function useBorrowerScore() {
  return useSyncExternalStore(subscribeToAccount, getAccountState).borrowerScore;
}

/** The user's notifications and unread count. */
export function useNotifications() {
  return useSyncExternalStore(subscribeToNotifications, getNotificationState);
}

/** Notifications that just arrived, to show as pop-ups. */
export function useToasts() {
  return useSyncExternalStore(subscribeToToasts, getToasts);
}

/** The activity bar's counts and load state. */
export function useActivity() {
  return useSyncExternalStore(subscribeToActivity, getActivityState);
}
