import { LogIn, Sparkles, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuthState } from "../auth/AuthContext";
import { savePendingIntent, type PendingIntent } from "../auth/pendingAction";
import { currentHash, navigate, paths } from "../router";

export type GatedAction =
  | "lend"
  | "waitlist"
  | "favourite"
  | "request"
  | "event-request"
  | "trade";

const actionText: Record<GatedAction, string> = {
  lend: "lend an item",
  waitlist: "waitlist an item",
  favourite: "favourite an item",
  request: "request an item",
  "event-request": "send an event request",
  trade: "trade an item",
};

/** Features that need an account but aren't built yet. */
const comingSoon: Partial<Record<GatedAction, string>> = {
  waitlist: "Waitlists open soon",
  favourite: "Favourites are coming soon",
  trade: "Trades are coming soon",
};

interface Restore {
  intent: PendingIntent;
  /** Shown on the login page: "we'll take you back to {label}". */
  label: string;
}

interface RequireAuthOptions {
  /** Selections to bring back after login. */
  restore?: Restore;
  /** Where to land after login, if not the current page (an in-app hash like "#/lend"). */
  returnTo?: string;
}

/**
 * Returns true when the visitor is logged in and may continue. Otherwise it
 * saves `restore` (so their selections survive login) and opens the prompt.
 */
type RequireAuthFn = (action: GatedAction, options?: RequireAuthOptions) => boolean;

interface GateContextValue {
  requireAuth: RequireAuthFn;
  showComingSoon: (action: GatedAction) => void;
}

const GateContext = createContext<GateContextValue>({
  requireAuth: () => false,
  showComingSoon: () => {},
});

export const useRequireAuth = () => useContext(GateContext).requireAuth;

/** Opens the List an Item page, asking the visitor to log in first if needed. */
export function useStartListing() {
  const { requireAuth } = useContext(GateContext);
  return useCallback(() => {
    if (requireAuth("lend", { returnTo: paths.lend.slice(1) })) navigate(paths.lend);
  }, [requireAuth]);
}

/** For actions with no feature behind them yet: prompts login, or says it's coming. */
export function useGatedPlaceholder() {
  const { requireAuth, showComingSoon } = useContext(GateContext);
  return useCallback(
    (action: GatedAction) => {
      if (requireAuth(action)) showComingSoon(action);
    },
    [requireAuth, showComingSoon],
  );
}

type Dialog =
  | { type: "login"; action: GatedAction; returnTo: string }
  | { type: "soon"; action: GatedAction };

export function LoginPromptProvider({ children }: { children: ReactNode }) {
  const { status } = useAuthState();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const requireAuth = useCallback<RequireAuthFn>(
    (action, options = {}) => {
      if (status === "signed-in") return true;
      if (options.restore) savePendingIntent(options.restore.intent, options.restore.label);
      setDialog({ type: "login", action, returnTo: options.returnTo ?? currentHash() });
      return false;
    },
    [status],
  );

  const showComingSoon = useCallback(
    (action: GatedAction) => setDialog({ type: "soon", action }),
    [],
  );

  const close = () => dialogRef.current?.close();
  const go = (to: string) => {
    close();
    navigate(to);
  };

  useEffect(() => {
    const el = dialogRef.current;
    if (dialog && el && !el.open) el.showModal();
  }, [dialog]);

  return (
    <GateContext.Provider value={{ requireAuth, showComingSoon }}>
      {children}

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="login-prompt-title"
        onClose={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {dialog && (
          <div className="modal__content">
            <button className="modal__close" aria-label="Close" onClick={close}>
              <X size={20} />
            </button>
            <span className="modal__icon" aria-hidden="true">
              {dialog.type === "soon" ? <Sparkles size={24} /> : <LogIn size={24} />}
            </span>

            {dialog.type === "soon" ? (
              <>
                <h2 id="login-prompt-title">
                  {comingSoon[dialog.action] ?? "Coming soon"}
                </h2>
                <p className="muted">
                  You're logged in, so you'll be ready as soon as it launches.
                </p>
                <div className="modal__actions">
                  <button className="btn btn--primary" onClick={close}>
                    Got it
                  </button>
                </div>
              </>
            ) : status === "unavailable" ? (
              <>
                <h2 id="login-prompt-title">
                  You must be logged in to {actionText[dialog.action]}
                </h2>
                <p className="muted">Login isn't available right now.</p>
                <div className="modal__actions">
                  <button className="btn btn--secondary" onClick={close}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="login-prompt-title">
                  You must be logged in to {actionText[dialog.action]}
                </h2>
                <div className="modal__actions">
                  <button className="btn btn--secondary" onClick={close}>
                    Not now
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={() => go(paths.login(dialog.returnTo))}
                  >
                    Log in
                  </button>
                </div>
                <p className="modal__footnote">
                  New to Borrowers?{" "}
                  <button
                    className="link-btn"
                    onClick={() => go(paths.signup(dialog.returnTo))}
                  >
                    Create an account
                  </button>
                </p>
              </>
            )}
          </div>
        )}
      </dialog>
    </GateContext.Provider>
  );
}
