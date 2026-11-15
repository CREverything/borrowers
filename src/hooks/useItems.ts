import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getItemsState, loadItems, subscribeToItems } from "../services/itemsStore";

/** Listings from the backend, loaded on first use. */
export function useItems() {
  const state = useSyncExternalStore(subscribeToItems, getItemsState);

  useEffect(() => {
    void loadItems();
  }, []);

  const reload = useCallback(() => {
    void loadItems(true);
  }, []);
  const getItem = useCallback((id: number) => state.byId.get(id), [state]);

  return { items: state.items, status: state.status, getItem, reload };
}
