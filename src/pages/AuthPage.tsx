import { SignIn, SignUp } from "@clerk/react";
import {
  ClipboardList,
  Coins,
  PackageOpen,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthState } from "../auth/AuthContext";
import {
  clearReturnHash,
  getPendingLabel,
  resolveReturnHash,
} from "../auth/pendingAction";
import { LOGIN_PATH, navigate, paths, SIGNUP_PATH } from "../router";

interface AuthPageProps {
  mode: "login" | "signup";
  returnTo: string | null;
}

const perks = [
  { icon: PackageOpen, text: "Borrow from students near you" },
  { icon: Coins, text: "Lend your things and earn Switchies" },
  { icon: ClipboardList, text: "Track every request in one place" },
];

export default function AuthPage({ mode, returnTo: fromUrl }: AuthPageProps) {
  const { status } = useAuthState();
  const [returnTo] = useState(() => resolveReturnHash(fromUrl));
  const [pendingLabel] = useState(() => getPendingLabel(returnTo));
  const afterAuthUrl = `/${returnTo}`;

  // Already logged in (or just finished): go back to where they came from.
  useEffect(() => {
    if (status !== "signed-in") return;
    clearReturnHash();
    navigate(afterAuthUrl, { replace: true });
  }, [status, afterAuthUrl]);

  const isLogin = mode === "login";

  return (
    <div className="container page auth">
      <section className="auth__intro">
        <h1>{isLogin ? "Welcome back!" : "Join Borrowers"}</h1>
        <p className="page__lead">
          {isLogin
            ? "Log in to request items, plan events, and keep track of what you've borrowed."
            : "Create an account with Google or your email to start borrowing."}
        </p>

        {pendingLabel && (
          <div className="notice" role="note">
            <RotateCcw size={20} aria-hidden="true" />
            <p>
              <strong>Your selections are saved.</strong> After you{" "}
              {isLogin ? "log in" : "sign up"}, we'll take you back to{" "}
              {pendingLabel.replace(/\.+$/, "")}.
            </p>
          </div>
        )}

        <ul className="auth__perks">
          {perks.map(({ icon: Icon, text }) => (
            <li key={text}>
              <span className="auth__perk-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </section>

      <section
        className="auth__card"
        aria-label={isLogin ? "Log in" : "Sign up"}
      >
        {status === "unavailable" ? (
          <div className="panel auth__unavailable">
            <ShieldAlert size={28} aria-hidden="true" />
            <h2>Login isn't available right now</h2>
            <p className="muted">
              You can keep browsing and planning events in the meantime.
            </p>
            <a className="btn btn--secondary" href={paths.browse}>
              Back to marketplace
            </a>
          </div>
        ) : status === "loading" ? (
          <div className="panel auth__unavailable" role="status">
            <p className="muted">Loading...</p>
          </div>
        ) : isLogin ? (
          <SignIn
            routing="path"
            path={LOGIN_PATH}
            signUpUrl={paths.signup(returnTo)}
            forceRedirectUrl={afterAuthUrl}
            signUpForceRedirectUrl={afterAuthUrl}
          />
        ) : (
          <SignUp
            routing="path"
            path={SIGNUP_PATH}
            signInUrl={paths.login(returnTo)}
            forceRedirectUrl={afterAuthUrl}
            signInForceRedirectUrl={afterAuthUrl}
          />
        )}
      </section>
    </div>
  );
}
