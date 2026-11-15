import type { Item } from "../types";

/**
 * Marketplace listings loaded from the backend (`GET /api/items`).
 * Fetched once and shared by every page.
 */
export type ItemsStatus = "idle" | "loading" | "ready" | "error";

export interface ItemsState {
  status: ItemsStatus;
  items: Item[];
  byId: Map<number, Item>;
}

const ITEMS_ENDPOINT = "/api/items";

let state: ItemsState = { status: "idle", items: [], byId: new Map() };
const listeners = new Set<() => void>();

function setState(next: ItemsState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getItemsState = () => state;

export function subscribeToItems(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Guards against a malformed response breaking the UI. */
function isItem(value: unknown): value is Item {
  const item = value as Item;
  return (
    !!item &&
    typeof item.id === "number" &&
    typeof item.title === "string" &&
    typeof item.switchiesPerDay === "number" &&
    typeof item.iconKey === "string" &&
    Array.isArray(item.keywords) &&
    !!item.availability &&
    Array.isArray(item.availability.bookedRanges)
  );
}

let inflight: Promise<void> | null = null;

/**
 * Loads listings. Callers that arrive mid-request share the same request.
 * Pass `force` to retry after an error or refresh.
 */
export function loadItems(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && state.status === "ready") return Promise.resolve();

  inflight = fetchItems().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchItems(): Promise<void> {
  setState({ ...state, status: "loading" });
  try {
    const response = await fetch(ITEMS_ENDPOINT, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Items request failed with ${response.status}`);

    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Items response was not a list");

    const items = data.filter(isItem);
    setState({ status: "ready", items, byId: new Map(items.map((item) => [item.id, item])) });
  } catch (error) {
    console.warn("Could not load listings:", (error as Error).message);
    // Keep any listings already shown so a failed refresh doesn't blank the page.
    setState({ ...state, status: "error" });
  }
}
