import { useCallback, useEffect, useState } from "react";
import { useAuthState } from "../auth/AuthContext";
import { fetchMyListings, ListingError } from "../services/listingsApi";
import type { Item } from "../types";

export type MyListingsState =
  | { status: "loading" }
  | { status: "ready"; items: Item[] }
  | { status: "error"; message: string };

/** The logged-in user's own listings (active and hidden), from GET /api/my-items. */
export function useMyListings() {
  const { status: authStatus, getToken } = useAuthState();
  const [state, setState] = useState<MyListingsState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (authStatus !== "signed-in") return;
    let active = true;
    setState({ status: "loading" });
    fetchMyListings(getToken)
      .then((items) => active && setState({ status: "ready", items }))
      .catch(
        (error: ListingError) =>
          active && setState({ status: "error", message: error.message }),
      );
    return () => {
      active = false;
    };
    // Not keyed on getToken: its identity changes whenever Clerk refreshes.
  }, [authStatus, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /** Updates the list locally after an edit or removal, without refetching. */
  const replace = useCallback(
    (update: (items: Item[]) => Item[]) =>
      setState((s) => (s.status === "ready" ? { ...s, items: update(s.items) } : s)),
    [],
  );

  return { state, reload, replace };
}
