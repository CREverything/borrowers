import { ClerkFailed, ClerkProvider, useAuth, useClerk, useUser } from "@clerk/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOGIN_PATH, navigate, SIGNUP_PATH } from "../router";
import { clerkAppearance } from "./appearance";
import { clerkLocalization } from "./localization";

/**
 * The app's view of authentication. Components use this instead of Clerk
 * directly, so the rest of the UI doesn't depend on the auth vendor and the
 * app still runs (signed out) when no Clerk key is configured.
 *
 * "unavailable" means login can't work right now: no key is configured, or
 * Clerk failed to load (bad key, network problem, blocked script).
 */
export type AuthStatus = "loading" | "signed-out" | "signed-in" | "unavailable";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  createdAt: Date | null;
}

export interface AuthState {
  status: AuthStatus;
  /** Local development diagnosis; never contains a key or token. */
  unavailableReason?: string;
  user: AuthUser | null;
  /** A short-lived session token for our API. Never store it; ask again per request. */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Opens Clerk's account settings (email, password, connected accounts). */
  openAccountSettings: () => void;
}

const unavailable: AuthState = {
  status: "unavailable",
  user: null,
  getToken: async () => null,
  signOut: async () => {},
  openAccountSettings: () => {},
};

const AuthContext = createContext<AuthState>(unavailable);

export const useAuthState = () => useContext(AuthContext);

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

function keyProblem(key: string | undefined): string | null {
  if (!key) return "VITE_CLERK_PUBLISHABLE_KEY is not set";
  if (key.startsWith("sk_")) {
    return "VITE_CLERK_PUBLISHABLE_KEY holds a secret key. Use the publishable key (pk_...) and rotate the secret key";
  }
  if (!key.startsWith("pk_")) return "VITE_CLERK_PUBLISHABLE_KEY is not a Clerk publishable key";
  return null;
}

const keyIssue = keyProblem(publishableKey);
if (keyIssue) console.warn(`[borrowers] ${keyIssue}. Login is turned off.`);

const unavailableState: AuthState = {
  ...unavailable,
  unavailableReason: import.meta.env.DEV
    ? keyIssue
      ? `${keyIssue}. Set VITE_CLERK_PUBLISHABLE_KEY to the publishable key (pk_...) from your Clerk application in the project root configuration, then restart the development server. Gemini keys do not configure Clerk.`
      : "Clerk could not load in this browser. Check the browser console and Network tab for failed Clerk requests. Confirm the publishable key belongs to an active Clerk application and check whether a browser extension or network filter is blocking Clerk."
    : undefined,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  if (keyIssue) {
    return <AuthContext.Provider value={unavailableState}>{children}</AuthContext.Provider>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey!}
      signInUrl={LOGIN_PATH}
      signUpUrl={SIGNUP_PATH}
      afterSignOutUrl="/"
      // Clerk's steps and redirects go through our router, so moving between
      // login steps doesn't reload the page.
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      appearance={clerkAppearance}
      localization={clerkLocalization}
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [failed, setFailed] = useState(false);

  const value = useMemo<AuthState>(() => {
    if (failed) return unavailableState;
    const status: AuthStatus = !isLoaded
      ? "loading"
      : isSignedIn && user
        ? "signed-in"
        : "signed-out";

    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const authUser: AuthUser | null =
      status === "signed-in" && user
        ? {
            id: user.id,
            name: user.fullName || user.username || email?.split("@")[0] || "Borrower",
            email,
            imageUrl: user.hasImage ? user.imageUrl : null,
            createdAt: user.createdAt ?? null,
          }
        : null;

    return {
      status,
      user: authUser,
      getToken: () => getToken(),
      signOut: () => signOut(),
      openAccountSettings: () => clerk.openUserProfile(),
    };
  }, [failed, isLoaded, isSignedIn, user, getToken, signOut, clerk]);

  return (
    <AuthContext.Provider value={value}>
      <ClerkFailed>
        <ReportFailure onFailure={setFailed} />
      </ClerkFailed>
      {children}
    </AuthContext.Provider>
  );
}

/** Rendered by <ClerkFailed> only when Clerk couldn't load. */
function ReportFailure({ onFailure }: { onFailure: (failed: true) => void }) {
  useEffect(() => {
    console.warn("[borrowers] Clerk failed to load. Login is unavailable.");
    onFailure(true);
  }, [onFailure]);
  return null;
}
