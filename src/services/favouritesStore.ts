import type { Item } from "../types";
import { authedFetch } from "./api";

/**
 * The logged-in user's favourite listings, from /api/favourites. Saving and
 * unsaving update the screen straight away and roll back if the server
 * refuses.
 */
export interface FavouritesState {
  userId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  /** Most recently saved first. */
  items: Item[];
  ids: Set<number>;
}

type GetToken = () => Promise<string | null>;

const empty: FavouritesState = { userId: null, status: "idle", items: [], ids: new Set() };
let state = empty;
const listeners = new Set<() => void>();

function setItems(items: Item[], extra: Partial<FavouritesState> = {}) {
  state = { ...state, ...extra, items, ids: new Set(items.map((i) => i.id)) };
  listeners.forEach((l) => l());
}

export const getFavouritesState = () => state;

export function subscribeToFavourites(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadFavourites(userId: string, getToken: GetToken) {
  if (state.userId !== userId) {
    state = { ...empty, userId, status: "loading" };
    listeners.forEach((l) => l());
  }
  try {
    const res = await authedFetch("/api/favourites", getToken, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const items = (await res.json()) as Item[];
    if (state.userId === userId) setItems(items, { status: "ready" });
  } catch (error) {
    console.warn("[borrowers] Couldn't load favourites:", (error as Error).message);
    if (state.userId === userId && state.status !== "ready") setItems(state.items, { status: "error" });
  }
}

// Bumped per change, so a slow response can't undo a newer click.
let version = 0;

/** Saves or unsaves `item`. Resolves to false if the server refused. */
export async function toggleFavourite(getToken: GetToken, item: Item): Promise<boolean> {
  const saving = !state.ids.has(item.id);
  const before = state.items;
  const mine = ++version;
  setItems(saving ? [item, ...before] : before.filter((i) => i.id !== item.id));
  try {
    const res = await authedFetch(`/api/favourites/${item.id}`, getToken, { method: saving ? "PUT" : "DELETE" });
    if (!res.ok) throw new Error(String(res.status));
    return true;
  } catch (error) {
    console.warn("[borrowers] Couldn't update favourites:", (error as Error).message);
    if (mine === version) setItems(before);
    return false;
  }
}

export function resetFavourites() {
  version++;
  state = empty;
  listeners.forEach((l) => l());
}
