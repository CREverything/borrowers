import { useEffect, useState } from "react";
import type { PublicProfile } from "../types";

export type ProfileLoad =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfile }
  | { status: "missing" }
  | { status: "error" };

/** Someone's public profile from GET /api/users/:id. Pass null to skip. */
export function usePublicProfile(userId: string | null, reloadKey: unknown = null): ProfileLoad {
  const [state, setState] = useState<ProfileLoad & { id?: string | null }>({ status: "loading" });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setState((s) => (s.id === userId ? s : { status: "loading", id: userId }));
    fetch(`/api/users/${encodeURIComponent(userId)}`, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 404) return setState({ status: "missing", id: userId });
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: "ready", profile: (await res.json()) as PublicProfile, id: userId });
      })
      .catch(() => active && setState((s) => (s.status === "ready" && s.id === userId ? s : { status: "error", id: userId })));
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  // A stale result for a previous id is never shown.
  return state.id === userId ? state : { status: "loading" };
}
