import { useEffect, useState } from "react";

/**
 * Minimal router. App pages use the hash (#/browse), so they need no server
 * config. Login and sign-up use real paths (/login, /signup) because Clerk's
 * components keep their own steps (such as /login/factor-one and the Google
 * callback) in the path. Vite's dev and preview servers serve index.html for
 * those paths; a static host needs the same SPA fallback.
 */
export type Route =
  | { name: "home"; section?: "browse" }
  | { name: "item"; id: number }
  | { name: "plan"; query: string }
  | { name: "switchies" }
  | { name: "requests"; tab: "borrowing" | "lending" }
  | { name: "profile" }
  | { name: "lend" }
  | { name: "notifications" }
  | { name: "my-listings"; createdId: number | null }
  | { name: "edit-listing"; id: number }
  /** returnTo is null when the URL has no ?return= (one of Clerk's own steps). */
  | { name: "login"; returnTo: string | null }
  | { name: "signup"; returnTo: string | null };

const HOME_HASH = "#/";

/** Links are absolute, so they also work from /login and /signup. */
export const paths = {
  home: "/#/",
  browse: "/#/browse",
  item: (id: number) => `/#/item/${id}`,
  plan: (query?: string) =>
    query ? `/#/plan?q=${encodeURIComponent(query)}` : "/#/plan",
  switchies: "/#/switchies",
  requests: "/#/requests",
  lendingRequests: "/#/requests?tab=lending",
  profile: "/#/profile",
  lend: "/#/lend",
  notifications: "/#/notifications",
  myListings: (createdId?: number) =>
    createdId ? `/#/my-listings?created=${createdId}` : "/#/my-listings",
  editListing: (id: number) => `/#/my-listings/${id}/edit`,
  login: (returnTo = currentHash()) => authPath("/login", returnTo),
  signup: (returnTo = currentHash()) => authPath("/signup", returnTo),
};

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";

function authPath(base: string, returnTo: string) {
  return `${base}?return=${encodeURIComponent(safeReturnHash(returnTo))}`;
}

/** The current app page as a hash, used as the place to come back to. */
export function currentHash(): string {
  const { pathname, hash } = window.location;
  if (isAuthPath(pathname)) {
    return safeReturnHash(
      new URLSearchParams(window.location.search).get("return"),
    );
  }
  return safeReturnHash(hash);
}

/**
 * Only in-app hash routes are allowed as return targets, so a crafted
 * ?return= link can't send someone to another site after they log in.
 */
export function safeReturnHash(value: string | null | undefined): string {
  if (!value) return HOME_HASH;
  const hash = value.startsWith("/#/") ? value.slice(1) : value;
  return /^#\/[^\s\\]*$/.test(hash) && !hash.startsWith("#//")
    ? hash
    : HOME_HASH;
}

const isAuthPath = (pathname: string) =>
  pathname === LOGIN_PATH ||
  pathname.startsWith(`${LOGIN_PATH}/`) ||
  pathname === SIGNUP_PATH ||
  pathname.startsWith(`${SIGNUP_PATH}/`);

export function parseLocation(location: Location = window.location): Route {
  const { pathname } = location;
  if (isAuthPath(pathname)) {
    const param = new URLSearchParams(location.search).get("return");
    const returnTo = param === null ? null : safeReturnHash(param);
    return pathname.startsWith(SIGNUP_PATH)
      ? { name: "signup", returnTo }
      : { name: "login", returnTo };
  }
  return parseHash(location.hash);
}

export function parseHash(hash: string): Route {
  const [path, search = ""] = hash.replace(/^#\/?/, "").split("?");
  const [first, second] = path.split("/").filter(Boolean);

  switch (first) {
    case "item": {
      const id = Number(second);
      if (Number.isInteger(id)) return { name: "item", id };
      break;
    }
    case "plan":
      return {
        name: "plan",
        query: new URLSearchParams(search).get("q") ?? "",
      };
    case "switchies":
      return { name: "switchies" };
    case "requests":
      return {
        name: "requests",
        tab: new URLSearchParams(search).get("tab") === "lending" ? "lending" : "borrowing",
      };
    case "profile":
      return { name: "profile" };
    case "lend":
      return { name: "lend" };
    case "notifications":
      return { name: "notifications" };
    case "my-listings": {
      const id = Number(second);
      if (second && Number.isInteger(id)) return { name: "edit-listing", id };
      const created = Number(new URLSearchParams(search).get("created"));
      return {
        name: "my-listings",
        createdId: Number.isInteger(created) && created > 0 ? created : null,
      };
    }
    case "browse":
      return { name: "home", section: "browse" };
  }
  return { name: "home" };
}

const LOCATION_EVENT = "borrowers:locationchange";

/**
 * Moves within the app without a page load. Accepts app links ("/#/browse"),
 * bare hashes ("#/browse") and same-origin URLs (Clerk passes those).
 */
export function navigate(to: string, { replace = false } = {}) {
  let url: URL;
  try {
    url = new URL(to.startsWith("#") ? `/${to}` : to, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  const target = url.pathname + url.search + url.hash;
  const current =
    window.location.pathname + window.location.search + window.location.hash;
  if (target === current) return;

  if (replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseLocation());

  useEffect(() => {
    const onChange = () => setRoute(parseLocation());
    const events = ["hashchange", "popstate", LOCATION_EVENT];
    events.forEach((name) => window.addEventListener(name, onChange));
    return () =>
      events.forEach((name) => window.removeEventListener(name, onChange));
  }, []);

  return route;
}
