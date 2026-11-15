import { LogIn } from "lucide-react";
import { useAuthState } from "../auth/AuthContext";
import { navigate, paths } from "../router";

/** Shown on pages that need an account when the visitor isn't logged in. */
export default function LoginRequired({
  title,
  message,
  returnTo,
}: {
  title: string;
  message: string;
  /** In-app hash to come back to after login, e.g. "#/lend". */
  returnTo: string;
}) {
  const { status } = useAuthState();

  if (status === "loading") {
    return (
      <p className="muted" role="status">
        Checking your account...
      </p>
    );
  }

  return (
    <>
      <div className="notice" role="note">
        <LogIn size={20} aria-hidden="true" />
        <p>
          <strong>{title}</strong> {message}
        </p>
      </div>
      {status !== "unavailable" && (
        <div className="page__actions">
          <button className="btn btn--primary" onClick={() => navigate(paths.login(returnTo))}>
            Log in
          </button>
          <button className="btn btn--secondary" onClick={() => navigate(paths.signup(returnTo))}>
            Create an account
          </button>
        </div>
      )}
    </>
  );
}
