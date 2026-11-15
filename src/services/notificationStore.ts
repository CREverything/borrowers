import type { AppNotification } from "../types";
import { call } from "./requestStore";

/** The logged-in user's notifications from GET /api/notifications. */
export interface NotificationState {
  userId: string | null;
  loaded: boolean;
  notifications: AppNotification[];
  unreadCount: number;
}

type GetToken = () => Promise<string | null>;

const empty: NotificationState = { userId: null, loaded: false, notifications: [], unreadCount: 0 };
let state = empty;
const listeners = new Set<() => void>();

function setState(next: NotificationState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getNotificationState = () => state;

export function subscribeToNotifications(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pop-up toasts for notifications that arrive while the app is open. The
 * first load for a user only records what already exists, so old
 * notifications never pop up. Toasts don't mark anything read; they stay on
 * the notifications page.
 */
const MAX_TOASTS = 3;
let toasts: AppNotification[] = [];
let seenIds: { userId: string; ids: Set<string> } | null = null;
const toastListeners = new Set<() => void>();

function setToasts(next: AppNotification[]) {
  toasts = next;
  toastListeners.forEach((listener) => listener());
}

export const getToasts = () => toasts;

export function subscribeToToasts(listener: () => void) {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

export const dismissToast = (id: string) => setToasts(toasts.filter((t) => t.id !== id));

export const clearToasts = () => {
  if (toasts.length) setToasts([]);
};

function queueToasts(userId: string, notifications: AppNotification[]) {
  if (seenIds?.userId !== userId) {
    seenIds = { userId, ids: new Set(notifications.map((n) => n.id)) };
    return;
  }
  const fresh = notifications.filter((n) => !seenIds!.ids.has(n.id) && !n.read);
  notifications.forEach((n) => seenIds!.ids.add(n.id));
  if (fresh.length === 0) return;
  // Newest last, so the stack reads top to bottom in arrival order.
  setToasts([...toasts, ...fresh.reverse()].slice(-MAX_TOASTS));
}

// Bumped whenever notifications are marked read, so a load that started
// earlier can't bring back the old unread count when it finishes.
let readVersion = 0;

export async function loadNotifications(userId: string, getToken: GetToken) {
  if (state.userId !== userId) setState({ ...empty, userId });
  const startedAt = readVersion;
  try {
    const body = await call<{ notifications: AppNotification[]; unreadCount: number }>(
      "/api/notifications",
      getToken,
    );
    if (state.userId !== userId) return;
    queueToasts(userId, body.notifications);
    if (startedAt === readVersion) {
      setState({ userId, loaded: true, ...body });
    }
  } catch (error) {
    console.warn("[borrowers] Couldn't load notifications:", (error as Error).message);
  }
}

/** Marks every notification read, updating the badge straight away. */
export async function markAllRead(getToken: GetToken) {
  if (state.unreadCount === 0) return;
  readVersion++;
  setState({
    ...state,
    unreadCount: 0,
    notifications: state.notifications.map((n) => ({ ...n, read: true })),
  });
  try {
    await call("/api/notifications/read", getToken, { method: "POST", body: "{}" });
    // Re-read so anything that arrived meanwhile is shown correctly.
    if (state.userId) await loadNotifications(state.userId, getToken);
  } catch (error) {
    console.warn("[borrowers] Couldn't mark notifications read:", (error as Error).message);
  }
}

export function resetNotifications() {
  setState(empty);
  seenIds = null;
  setToasts([]);
}
