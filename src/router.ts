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
  | {
      name: "plan";
      query: string;
      /** A saved plan to open. */
      planId: string | null;
      /** The My plans list. */
      mine: boolean;
    }
  | { name: "switchies" }
  | {
      name: "requests";
      tab: "borrowing" | "lending";
      section: LendingSection | null;
      /** Borrowing sub-tab; null picks the most useful one. */
      view: BorrowingView | null;
      /** A request to scroll to and highlight. */
      focus: string | null;
    }
  | { name: "profile" }
  | { name: "user"; id: string }
  | { name: "lend" }
  | { name: "notifications" }
  | { name: "my-listings"; createdId: number | null }
  | { name: "edit-listing"; id: number }
  /** returnTo is null when the URL has no ?return= (one of Clerk's own steps). */
  | { name: "login"; returnTo: string | null }
  | { name: "signup"; returnTo: string | null };

/** Parts of the lending tab that links can jump to. */
export type LendingSection = "waiting" | "on-loan";

/** The borrowing tab's sub-tabs. */
export type BorrowingView = "pending" | "upcoming" | "active" | "history";
const BORROWING_VIEWS: BorrowingView[] = ["pending", "upcoming", "active", "history"];

const HOME_HASH = "#/";

/** Links are absolute, so they also work from /login and /signup. */
export const paths = {
  home: "/#/",
  browse: "/#/browse",
  item: (id: number) => `/#/item/${id}`,
  plan: (query?: string) =>
    query ? `/#/plan?q=${encodeURIComponent(query)}` : "/#/plan",
  savedPlan: (id: string) => `/#/plan/${encodeURIComponent(id)}`,
  myPlans: "/#/plan?mine=1",
  switchies: "/#/switchies",
  requests: "/#/requests",
  lendingRequests: "/#/requests?tab=lending",
  lendingSection: (section: LendingSection) => `/#/requests?tab=lending&section=${section}`,
  borrowing: (view: BorrowingView, focus?: string) =>
    `/#/requests?view=${view}${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`,
  profile: "/#/profile",
  user: (id: string) => `/#/user/${encodeURIComponent(id)}`,
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
    case "plan": {
      const params = new URLSearchParams(search);
      return {
        name: "plan",
        query: params.get("q") ?? "",
        planId: second && /^\d{1,18}$/.test(second) ? second : null,
        mine: params.get("mine") === "1",
      };
    }
    case "switchies":
      return { name: "switchies" };
    case "requests": {
      const params = new URLSearchParams(search);
      const tab = params.get("tab") === "lending" ? "lending" : "borrowing";
      const section = params.get("section");
      const view = params.get("view") as BorrowingView | null;
      const focus = params.get("focus");
      return {
        name: "requests",
        tab,
        section: tab === "lending" && (section === "waiting" || section === "on-loan") ? section : null,
        view: tab === "borrowing" && view && BORROWING_VIEWS.includes(view) ? view : null,
        focus: focus && /^\d{1,19}$/.test(focus) ? focus : null,
      };
    }
    case "profile":
      return { name: "profile" };
    case "user": {
      let id = "";
      try {
        id = decodeURIComponent(second ?? "");
      } catch {
        // Malformed escape; falls through to home.
      }
      if (id) return { name: "user", id };
      break;
    }
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
