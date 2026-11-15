import { currentHash, safeReturnHash } from "../router";
import type { EventPlan, ISODate } from "../types";

/**
 * Remembers what a signed-out visitor was doing when they hit a protected
 * action, so it can be restored after they log in. Kept in sessionStorage
 * (this tab only, cleared when it closes). It holds form selections only,
 * never credentials or tokens; Clerk manages the session itself.
 */
export type PendingIntent =
  | { kind: "borrow"; itemId: number; startDate: ISODate; endDate: ISODate }
  | {
      kind: "event";
      query: string;
      plan: EventPlan;
      selected: number[];
      startDate: ISODate;
      endDate: ISODate;
    };

interface StoredIntent {
  intent: PendingIntent;
  /** Shown on the login page: "we'll take you back to {label}". */
  label: string;
  /** The page the intent belongs to. */
  returnTo: string;
  savedAt: number;
}

const INTENT_KEY = "borrowers.pendingAction.v1";
const RETURN_KEY = "borrowers.authReturn.v1";
const MAX_AGE_MS = 60 * 60 * 1000;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode). Login still works; the
    // selections just aren't restored.
  }
}

export function savePendingIntent(intent: PendingIntent, label: string) {
  const stored: StoredIntent = {
    intent,
    label,
    returnTo: currentHash(),
    savedAt: Date.now(),
  };
  write(INTENT_KEY, stored);
}

function readStored(): StoredIntent | null {
  const stored = read<StoredIntent>(INTENT_KEY);
  if (!stored || Date.now() - stored.savedAt > MAX_AGE_MS) return null;
  return stored;
}

/**
 * Returns the saved intent of the given kind if it matches, without removing
 * it. Safe to call from render (React may call initializers twice in dev);
 * call clearPendingIntent() from an effect once it has been applied.
 */
export function peekPendingIntent<K extends PendingIntent["kind"]>(
  kind: K,
  matches: (intent: Extract<PendingIntent, { kind: K }>) => boolean,
): Extract<PendingIntent, { kind: K }> | null {
  const stored = readStored();
  if (stored?.intent.kind !== kind) return null;
  const intent = stored.intent as Extract<PendingIntent, { kind: K }>;
  return matches(intent) ? intent : null;
}

/** The saved intent's label, if it belongs to the page login returns to. */
export function getPendingLabel(returnTo: string): string | null {
  const stored = readStored();
  return stored && stored.returnTo === returnTo ? stored.label : null;
}

export const clearPendingIntent = () => write(INTENT_KEY, null);

/**
 * Clerk moves between steps (/login/factor-one) and comes back from Google
 * without our ?return= parameter, so the auth pages remember it here.
 */
export function resolveReturnHash(fromUrl: string | null): string {
  if (fromUrl !== null) {
    write(RETURN_KEY, fromUrl);
    return fromUrl;
  }
  return safeReturnHash(read<string>(RETURN_KEY));
}

export const clearReturnHash = () => write(RETURN_KEY, null);
