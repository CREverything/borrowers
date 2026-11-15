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
    if (state.userId === userId && startedAt === readVersion) {
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

export const resetNotifications = () => setState(empty);
