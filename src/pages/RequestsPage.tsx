import {
  CalendarDays,
  Inbox,
  LogIn,
  Package,
  PartyPopper,
  ShoppingBag,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuthState } from "../auth/AuthContext";
import ItemIllustration from "../components/ItemIllustration";
import { getUserName, lenderNameOf } from "../data/users";
import { useItems } from "../hooks/useItems";
import { formatRange } from "../lib/dates";
import { useRequests } from "../hooks/useRequests";
import { navigate, paths } from "../router";
import {
  approveRequest,
  cancelBorrowRequest,
  cancelEventRequest,
  declineRequest,
  loadRequests,
  RequestError,
} from "../services/requestStore";
import type { BorrowRequest, EventRequest, RequestStatus } from "../types";

const statusLabels: Record<RequestStatus, string> = {
  pending: "Pending lender approval",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

function StatusPill({
  status,
  asLender = false,
}: {
  status: RequestStatus;
  asLender?: boolean;
}) {
  const label = asLender && status === "pending" ? "Needs your reply" : statusLabels[status];
  return <span className={`status status--${status}`}>{label}</span>;
}

export default function RequestsPage({ tab }: { tab: Tab }) {
  const { status, user } = useAuthState();

  if (status === "signed-in" && user) return <MyRequests userId={user.id} tab={tab} />;

  return (
    <div className="container page page--narrow">
      <header className="page__head">
        <h1>My requests</h1>
      </header>

      {status === "loading" ? (
        <p className="muted" role="status">
          Checking your account...
        </p>
      ) : (
        <>
          <div className="notice" role="note">
            <LogIn size={20} aria-hidden="true" />
            <p>
              <strong>You need to log in to check on your requests.</strong>{" "}
              Once you're logged in, you'll see when lenders approve or decline
              them.
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
        </>
      )}
    </div>
  );
}

type Tab = "borrowing" | "lending";

function MyRequests({ userId, tab }: { userId: string; tab: Tab }) {
  const { getToken } = useAuthState();
  const { status, borrowRequests, eventRequests, incoming } = useRequests();
  const pendingIncoming = incoming.filter((r) => r.status === "pending").length;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** Runs one change at a time and shows the server's reason if it fails. */
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as RequestError).message);
    } finally {
      setBusy(null);
    }
  };

  const loading = status === "loading" || status === "idle";

  return (
    <div className="container page page--narrow">
      <header className="page__head">
        <h1>My requests</h1>
      </header>

      <div className="tabs" role="tablist" aria-label="Requests">
        <a
          role="tab"
          aria-selected={tab === "borrowing"}
          className={`chip${tab === "borrowing" ? " chip--active" : ""}`}
          href={paths.requests}
        >
          <ShoppingBag size={16} aria-hidden="true" />
          Borrowing
        </a>
        <a
          role="tab"
          aria-selected={tab === "lending"}
          className={`chip${tab === "lending" ? " chip--active" : ""}`}
          href={paths.lendingRequests}
        >
          <Package size={16} aria-hidden="true" />
          Lending
          {pendingIncoming > 0 && (
            <span className="tabs__count" aria-label={`${pendingIncoming} waiting`}>
              {pendingIncoming}
            </span>
          )}
        </a>
      </div>

      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}

      {status === "error" ? (
        <div className="empty" role="alert">
          <h3>We couldn't load your requests</h3>
          <p>Check your connection and try again.</p>
          <button
            className="btn btn--secondary"
            onClick={() => void loadRequests(userId, getToken)}
          >
            Try again
          </button>
        </div>
      ) : loading && borrowRequests.length + incoming.length === 0 ? (
        <p className="muted" role="status">
          Loading your requests...
        </p>
      ) : tab === "borrowing" ? (
        <Borrowing
          borrowRequests={borrowRequests}
          eventRequests={eventRequests}
          busy={busy}
          onCancel={(id) => run(id, () => cancelBorrowRequest(getToken, id))}
          onCancelEvent={(id) => run(`event-${id}`, () => cancelEventRequest(getToken, id))}
        />
      ) : (
        <Lending
          incoming={incoming}
          busy={busy}
          onApprove={(id) => run(id, () => approveRequest(getToken, id))}
          onDecline={(id) => run(id, () => declineRequest(getToken, id))}
        />
      )}
    </div>
  );
}

function Borrowing({
  borrowRequests,
  eventRequests,
  busy,
  onCancel,
  onCancelEvent,
}: {
  borrowRequests: BorrowRequest[];
  eventRequests: EventRequest[];
  busy: string | null;
  onCancel: (id: string) => void;
  onCancelEvent: (id: string) => void;
}) {
  const standalone = borrowRequests.filter((r) => !r.eventRequestId);

  if (standalone.length === 0 && eventRequests.length === 0) {
    return (
      <div className="empty">
        <span className="empty__icon">
          <Inbox size={28} aria-hidden="true" />
        </span>
        <h3>No requests yet</h3>
        <p>
          Find something to borrow, or plan an event and request everything at
          once.
        </p>
        <div className="page__actions">
          <a className="btn btn--primary" href={paths.browse}>
            Browse items
          </a>
          <a className="btn btn--secondary" href={paths.plan()}>
            Plan an event
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {eventRequests.length > 0 && (
        <section className="request-section">
          <h2>Event requests</h2>
          {eventRequests.map((event) => {
            const children = borrowRequests.filter(
              (r) => r.eventRequestId === event.id,
            );
            return (
              <article key={event.id} className="event-card">
                <header className="event-card__head">
                  <span className="event-card__icon">
                    <PartyPopper size={20} aria-hidden="true" />
                  </span>
                  <div className="event-card__title">
                    <h3>{event.eventTitle}</h3>
                    <p className="muted">
                      {formatRange({
                        start: event.startDate,
                        end: event.endDate,
                      })}{" "}
                      · {children.length}{" "}
                      {children.length === 1 ? "item" : "items"} ·{" "}
                      {event.totalSwitchies} Switchies
                    </p>
                  </div>
                  <StatusPill status={event.status} />
                </header>
                {event.description && (
                  <p className="event-card__desc">"{event.description}"</p>
                )}
                <ul className="request-list">
                  {children.map((request) => (
                    <RequestRow key={request.id} request={request} />
                  ))}
                </ul>
                {event.status === "pending" && (
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={busy === `event-${event.id}`}
                    onClick={() => onCancelEvent(event.id)}
                  >
                    Cancel event request
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {standalone.length > 0 && (
        <section className="request-section">
          <h2>Item requests</h2>
          <ul className="request-list">
            {standalone.map((request) => (
              <RequestRow key={request.id} request={request}>
                {request.status === "pending" && (
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={busy === request.id}
                    onClick={() => onCancel(request.id)}
                  >
                    Cancel
                  </button>
                )}
              </RequestRow>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Lending({
  incoming,
  busy,
  onApprove,
  onDecline,
}: {
  incoming: BorrowRequest[];
  busy: string | null;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  if (incoming.length === 0) {
    return (
      <div className="empty">
        <span className="empty__icon">
          <Inbox size={28} aria-hidden="true" />
        </span>
        <h3>No one has asked to borrow your things yet</h3>
        <p>When someone requests one of your listings, it shows up here.</p>
        <a className="btn btn--secondary" href={paths.myListings()}>
          My listings
        </a>
      </div>
    );
  }

  const waiting = incoming.filter((r) => r.status === "pending");
  const past = incoming.filter((r) => r.status !== "pending");

  return (
    <>
      {waiting.length > 0 && (
        <section className="request-section">
          <h2>Waiting for you</h2>
          <p className="muted small request-section__note">
            Approving books those dates and moves the Switchies to you.
          </p>
          <ul className="request-list">
            {waiting.map((request) => (
              <RequestRow key={request.id} request={request} asLender>
                <div className="request-row__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={busy === request.id}
                    onClick={() => onApprove(request.id)}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={busy === request.id}
                    onClick={() => onDecline(request.id)}
                  >
                    Decline
                  </button>
                </div>
              </RequestRow>
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="request-section">
          <h2>Earlier requests</h2>
          <ul className="request-list">
            {past.map((request) => (
              <RequestRow key={request.id} request={request} asLender />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function RequestRow({
  request,
  asLender = false,
  children,
}: {
  request: BorrowRequest;
  /** Show who asked, instead of who is lending. */
  asLender?: boolean;
  children?: ReactNode;
}) {
  const { getItem } = useItems();
  const item = getItem(request.itemId);
  const title = item?.title ?? request.itemTitle ?? "Removed item";
  const person = asLender
    ? `by ${request.borrowerName || "a student"}`
    : `from ${request.lenderName || (item ? lenderNameOf(item) : getUserName(request.lenderId))}`;
  return (
    <li className="request-row">
      {item && (
        <ItemIllustration item={item} size={22} className="match__thumb" />
      )}
      <div className="request-row__text">
        {item ? <a href={paths.item(item.id)}>{title}</a> : <strong>{title}</strong>}
        <span className="muted">
          <CalendarDays size={14} aria-hidden="true" />{" "}
          {formatRange({ start: request.startDate, end: request.endDate })} ·{" "}
          {request.days} {request.days === 1 ? "day" : "days"} · {person}
        </span>
      </div>
      <span className="request-row__price">{request.totalSwitchies} Swi.</span>
      <StatusPill status={request.status} asLender={asLender} />
      {children}
    </li>
  );
}
