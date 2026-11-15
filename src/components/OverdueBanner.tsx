import { TriangleAlert } from "lucide-react";
import { useAuthState } from "../auth/AuthContext";
import { useNow } from "../hooks/useNow";
import { useOverdueLoans } from "../hooks/useOverdue";
import { formatDuration, lateFee, parseTime } from "../lib/deadline";
import { paths, type Route } from "../router";

/**
 * Shown at the top of every page while you have an overdue item, until it's
 * marked returned. Not dismissible: borrowing is blocked until then.
 */
export default function OverdueBanner({ route }: { route: Route }) {
  const { status } = useAuthState();
  const overdue = useOverdueLoans();
  const now = useNow();
  if (status !== "signed-in" || overdue.length === 0) return null;
  if (route.name === "login" || route.name === "signup") return null;

  const first = overdue[0];
  const due = parseTime(first.returnDueAt);
  const fee = overdue.reduce((sum, r) => sum + lateFee(r.returnDueAt, now), 0);

  return (
    <div className="overdue-banner" role="alert">
      <div className="container overdue-banner__inner">
        <TriangleAlert size={20} aria-hidden="true" />
        <p>
          <strong>
            {first.itemTitle || "An item"} is overdue
            {due !== null ? ` by ${formatDuration(now - due)}` : ""}
          </strong>
          {overdue.length > 1 && ` (and ${overdue.length - 1} more)`}. You can't borrow anything new until the
          lender confirms {overdue.length > 1 ? "they're" : "it's"} back. Late fees so far: <strong>{fee} Switchies</strong>.
        </p>
        <a className="btn btn--sm overdue-banner__action" href={paths.borrowing("active", first.id)}>
          Return it
        </a>
      </div>
    </div>
  );
}
