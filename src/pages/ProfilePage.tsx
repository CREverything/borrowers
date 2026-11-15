import { Coins, LogIn, Mail, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthState, type AuthUser } from "../auth/AuthContext";
import { ProfileAvatar } from "../components/UserMenu";
import { Stars } from "../components/StarRating";
import { useBalance, useBorrowerScore } from "../hooks/useRequests";
import { navigate, paths } from "../router";
import { authedFetch } from "../services/api";

export default function ProfilePage() {
  const { status, user } = useAuthState();

  if (status === "loading") {
    return (
      <div className="container page page--narrow">
        <p className="muted" role="status">
          Loading your profile...
        </p>
      </div>
    );
  }

  if (status !== "signed-in" || !user) {
    return (
      <div className="container page page--narrow">
        <header className="page__head">
          <h1>Profile</h1>
        </header>
        <div className="notice" role="note">
          <LogIn size={20} aria-hidden="true" />
          <p>
            <strong>Log in to see your profile.</strong> Browsing and event
            planning stay open without an account.
          </p>
        </div>
        {status !== "unavailable" && (
          <div className="page__actions">
            <button
              className="btn btn--primary"
              onClick={() => navigate(paths.login())}
            >
              Log in
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => navigate(paths.signup())}
            >
              Create an account
            </button>
          </div>
        )}
      </div>
    );
  }

  return <Profile user={user} />;
}

const memberSince = (date: Date | null) =>
  date?.toLocaleDateString(undefined, { month: "long", year: "numeric" });

function Profile({ user }: { user: AuthUser }) {
  const { signOut, openAccountSettings } = useAuthState();
  const since = memberSince(user.createdAt);
  const balance = useBalance();
  const score = useBorrowerScore();

  return (
    <div className="container page page--narrow">
      <header className="profile">
        <ProfileAvatar user={user} size={88} />
        <div>
          <h1>{user.name}</h1>
          {user.email && (
            <p className="profile__email">
              <Mail size={16} aria-hidden="true" />
              {user.email}
            </p>
          )}
          {since && <p className="muted small">Member since {since}</p>}
          <p className="profile__score">
            {score ? (
              <>
                <Stars value={score.average} />
                <strong>{score.average.toFixed(1)}</strong>
                <span className="muted small">
                  borrower rating from {score.count}{" "}
                  {score.count === 1 ? "lender" : "lenders"}
                </span>
              </>
            ) : (
              <span className="muted small">
                No borrower rating yet. Lenders can score you after you return
                something.
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="profile__panels">
        <section className="panel">
          <h2>Switchies balance</h2>
          <p className="profile__balance">
            <span className="profile__balance-icon" aria-hidden="true">
              <Coins size={22} />
            </span>
            <strong>{balance ?? "–"}</strong>
            <span className="muted">Switchies</span>
          </p>
          <p className="muted small">
            Earn Switchies by lending your stuff and spend them to borrow from
            other students.
          </p>
          <div className="page__actions profile__actions">
            <a className="btn btn--secondary" href={paths.switchies}>
              How Switchies work
            </a>
          </div>
        </section>

        <section className="panel">
          <h2>Account</h2>
          <p className="muted small">
            Change your email, password or connected Google account.
          </p>
          <SessionCheck />
          <div className="page__actions profile__actions">
            <button
              className="btn btn--secondary"
              onClick={openAccountSettings}
            >
              Manage account
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => void signOut()}
            >
              Log out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

type CheckState = "checking" | "verified" | "rejected" | "unavailable";

/** Asks the backend to verify the session token, which confirms the API is set up for auth. */
function SessionCheck() {
  const { getToken } = useAuthState();
  const [state, setState] = useState<CheckState>("checking");

  useEffect(() => {
    let active = true;
    authedFetch("/api/me", getToken)
      .then((res) => {
        if (!active) return;
        setState(
          res.ok ? "verified" : res.status === 401 ? "rejected" : "unavailable",
        );
      })
      .catch(() => active && setState("unavailable"));
    return () => {
      active = false;
    };
  }, [getToken]);

  const text: Record<CheckState, string> = {
    checking: "Checking your session with the Borrowers server...",
    verified: "Your session is verified by the Borrowers server.",
    rejected:
      "The Borrowers server couldn't verify your session. Try logging in again.",
    unavailable: "The Borrowers server isn't reachable right now.",
  };
  const Icon = state === "verified" ? ShieldCheck : ShieldQuestion;

  return (
    <p className={`session-check session-check--${state}`} role="status">
      <Icon size={16} aria-hidden="true" />
      {text[state]}
    </p>
  );
}
