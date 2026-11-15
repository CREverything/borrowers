import {
  CalendarDays,
  CalendarPlus,
  CircleCheckBig,
  Clock,
  Handshake,
  Inbox,
  LogIn,
  MessageSquareText,
  Package,
  PackageCheck,
  PartyPopper,
  ShoppingBag,
  Star,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuthState } from "../auth/AuthContext";
import DateTimeField from "../components/DateTimeField";
import Dialog from "../components/Dialog";
import ItemIllustration from "../components/ItemIllustration";
import { StarInput, Stars } from "../components/StarRating";
import { shortName, getUserName, lenderNameOf } from "../data/users";
import { useItems } from "../hooks/useItems";
import {
  formatDateTime,
  formatRange,
  isoToLocalInput,
  localDateTimeInput,
  localInputToISO,
  addDays,
  todayISO,
} from "../lib/dates";
import { useRequests } from "../hooks/useRequests";
import { navigate, paths, type BorrowingView, type LendingSection } from "../router";
import { ExtensionDialog, LoanCard, ReturnDialog } from "../components/LoanCard";
import { useNow } from "../hooks/useNow";
import { formatDuration, lateFee, parseTime, urgencyOf } from "../lib/deadline";
import { scrollToSection } from "../lib/scroll";
import {
  approveRequest,
  cancelBorrowRequest,
  cancelEventRequest,
  decideExtension,
  declineRequest,
  initiateReturn,
  loadRequests,
  markHandedOver,
  markReturned,
  requestExtension,
  rateBorrower,
  RequestError,
  reviewListing,
  setReturnTime,
  type Score,
} from "../services/requestStore";
import type { BorrowRequest, EventRequest, RequestStage, RequestStatus } from "../types";

const stageLabels: Record<RequestStage, { borrower: string; lender: string }> = {
  pending: { borrower: "Pending lender approval", lender: "Needs your reply" },
  upcoming: { borrower: "Booked", lender: "Booked" },
  active: { borrower: "Borrowing", lender: "Out on loan" },
  return_pending: { borrower: "Return pending confirmation", lender: "Confirm return" },
  returned: { borrower: "Returned", lender: "Returned" },
  declined: { borrower: "Declined", lender: "Declined" },
  cancelled: { borrower: "Cancelled", lender: "Cancelled" },
};

const stageClass: Record<RequestStage, string> = {
  pending: "pending",
  upcoming: "approved",
  active: "active",
  return_pending: "return-pending",
  returned: "returned",
  declined: "declined",
  cancelled: "cancelled",
};

/** A request's stage, or just its status for older API responses. */
const stageOf = (r: BorrowRequest): RequestStage =>
  r.stage ?? (r.status === "approved" ? "upcoming" : r.status);

function StatusPill({
  request,
  status,
  asLender = false,
}: {
  request?: BorrowRequest;
  /** For event requests, which only have a status. */
  status?: RequestStatus;
  asLender?: boolean;
}) {
  const stage = request ? stageOf(request) : status === "approved" ? "upcoming" : (status ?? "pending");
  const label = stageLabels[stage][asLender ? "lender" : "borrower"];
  return <span className={`status status--${stageClass[stage]}`}>{label}</span>;
}

export default function RequestsPage({
  tab,
  section = null,
  view = null,
  focus = null,
}: {
  tab: Tab;
  /** Part of the lending tab to scroll to, from the activity bar. */
  section?: LendingSection | null;
  /** Borrowing sub-tab; null picks the most useful one. */
  view?: BorrowingView | null;
  /** A borrowing to scroll to and highlight, e.g. from a deadline link. */
  focus?: string | null;
}) {
  const { status, user } = useAuthState();

  if (status === "signed-in" && user) {
    return <MyRequests userId={user.id} tab={tab} section={section} view={view} focus={focus} />;
  }

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

/** Which dialog is open, and for which request. */
type OpenDialog =
  | {
      type: "approve" | "return-time" | "returned" | "rate" | "review" | "extend" | "return";
      request: BorrowRequest;
    }
  | null;

function MyRequests({
  userId,
  tab,
  section,
  view,
  focus,
}: {
  userId: string;
  tab: Tab;
  section: LendingSection | null;
  view: BorrowingView | null;
  focus: string | null;
}) {
  const { getToken } = useAuthState();
  const { getItem } = useItems();
  const { status, borrowRequests, eventRequests, incoming } = useRequests();
  // Everything waiting on you as a lender: requests, extensions and returns to confirm.
  const pendingIncoming = incoming.filter(
    (r) => r.status === "pending" || stageOf(r) === "return_pending" || r.pendingExtension,
  ).length;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);

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
  const close = () => setDialog(null);

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
          view={view}
          focus={focus}
          borrowRequests={borrowRequests}
          eventRequests={eventRequests}
          busy={busy}
          onCancel={(id) => run(id, () => cancelBorrowRequest(getToken, id))}
          onCancelEvent={(id) => run(`event-${id}`, () => cancelEventRequest(getToken, id))}
          onReview={(request) => setDialog({ type: "review", request })}
          onPickedUp={(id) => run(id, () => markHandedOver(getToken, id))}
          onExtend={(request) => setDialog({ type: "extend", request })}
          onReturn={(request) => setDialog({ type: "return", request })}
        />
      ) : (
        <Lending
          section={section}
          incoming={incoming}
          busy={busy}
          onOpen={(type, request) => setDialog({ type, request })}
          onDecline={(id) => run(id, () => declineRequest(getToken, id))}
          onHandedOver={(id) => run(id, () => markHandedOver(getToken, id))}
          onExtension={(request, decision) =>
            run(request.id, () => decideExtension(getToken, request.pendingExtension!.id, decision))
          }
        />
      )}

      {dialog?.type === "approve" && (
        <ReturnTimeDialog
          request={dialog.request}
          mode="approve"
          onClose={close}
          onSave={(iso) => approveRequest(getToken, dialog.request.id, iso)}
        />
      )}
      {dialog?.type === "return-time" && (
        <ReturnTimeDialog
          request={dialog.request}
          mode="change"
          onClose={close}
          onSave={(iso) => setReturnTime(getToken, dialog.request.id, iso)}
        />
      )}
      {dialog?.type === "extend" && (
        <ExtensionDialog
          request={dialog.request}
          maxBorrowDays={getItem(dialog.request.itemId)?.availability.maxBorrowDays ?? null}
          onClose={close}
          onSave={(body) => requestExtension(getToken, dialog.request.id, body)}
        />
      )}
      {dialog?.type === "return" && (
        <ReturnDialog
          request={dialog.request}
          onClose={close}
          onConfirm={() => initiateReturn(getToken, dialog.request.id)}
        />
      )}
      {dialog?.type === "returned" && (
        <ScoreDialog
          title={
            stageOf(dialog.request) === "return_pending"
              ? `Confirm ${titleOf(dialog.request)} is back`
              : `Mark ${titleOf(dialog.request)} as returned`
          }
          intro={`${
            stageOf(dialog.request) === "return_pending"
              ? "Only confirm once you actually have it."
              : "Got it back early? That's fine."
          }${lateFeeNote(dialog.request)} You can also score the borrower now or later.`}
          ratingLabel={`Score ${shortName(dialog.request.borrowerName) || "the borrower"} (optional)`}
          optionalRating
          submitLabel={stageOf(dialog.request) === "return_pending" ? "Confirm return" : "Mark as returned"}
          onClose={close}
          onSave={(score) => markReturned(getToken, dialog.request.id, score)}
        />
      )}
      {dialog?.type === "rate" && (
        <ScoreDialog
          title={`Score ${shortName(dialog.request.borrowerName) || "the borrower"}`}
          intro={`How was lending ${titleOf(dialog.request)} to them?`}
          ratingLabel="Your score"
          submitLabel="Save score"
          onClose={close}
          onSave={(score) => rateBorrower(getToken, dialog.request.id, score!)}
        />
      )}
      {dialog?.type === "review" && (
        <ScoreDialog
          title={`Review ${titleOf(dialog.request)}`}
          intro="Your review appears on the listing. You can review each listing once."
          ratingLabel="Your rating"
          commentLabel="Comment (optional)"
          maxComment={1000}
          submitLabel="Post review"
          onClose={close}
          onSave={(score) => reviewListing(getToken, dialog.request.itemId, score!)}
        />
      )}
    </div>
  );
}

const titleOf = (r: BorrowRequest) => r.itemTitle || "this item";

/** What a return would cost the borrower in late fees, measured to when they said it was back. */
function lateFeeNote(r: BorrowRequest): string {
  // Overdue until you confirm it, so the fee runs to now.
  const fee = lateFee(r.returnDueAt, Date.now());
  return fee > 0
    ? ` It came back late, so a ${fee} Switchies late fee moves from the borrower to you (as much as they have).`
    : "";
}

/** Late, and the lender hasn't confirmed it's back (the borrower marking it returned isn't enough). */
const isOverdue = (r: BorrowRequest, now: number) =>
  (stageOf(r) === "active" || stageOf(r) === "return_pending") && urgencyOf(r.returnDueAt, now) === "overdue";

const VIEW_LABELS: Record<BorrowingView, string> = {
  pending: "Pending",
  upcoming: "Upcoming",
  active: "Active",
  history: "History",
};

function viewOf(r: BorrowRequest): BorrowingView {
  switch (stageOf(r)) {
    case "pending":
      return "pending";
    case "upcoming":
      return "upcoming";
    case "active":
    case "return_pending":
      return "active";
    default:
      return "history";
  }
}

function Borrowing({
  view: requestedView,
  focus,
  borrowRequests,
  eventRequests,
  busy,
  onCancel,
  onCancelEvent,
  onReview,
  onPickedUp,
  onExtend,
  onReturn,
}: {
  view: BorrowingView | null;
  focus: string | null;
  borrowRequests: BorrowRequest[];
  eventRequests: EventRequest[];
  busy: string | null;
  onCancel: (id: string) => void;
  onCancelEvent: (id: string) => void;
  onReview: (request: BorrowRequest) => void;
  onPickedUp: (id: string) => void;
  onExtend: (request: BorrowRequest) => void;
  onReturn: (request: BorrowRequest) => void;
}) {
  const now = useNow();

  const groups: Record<BorrowingView, BorrowRequest[]> = { pending: [], upcoming: [], active: [], history: [] };
  for (const r of borrowRequests) groups[viewOf(r)].push(r);
  // Active: the most pressing first (overdue, then soonest deadline).
  groups.active.sort(
    (a, b) => (parseTime(a.returnDueAt) ?? Infinity) - (parseTime(b.returnDueAt) ?? Infinity),
  );
  groups.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const pendingEvents = eventRequests.filter((e) => e.status === "pending");

  // With no view in the link, open the most useful tab that has something in it.
  const counts: Record<BorrowingView, number> = {
    pending: groups.pending.filter((r) => !r.eventRequestId).length + pendingEvents.length,
    upcoming: groups.upcoming.length,
    active: groups.active.length,
    history: groups.history.length,
  };
  const view =
    requestedView ??
    (["active", "pending", "upcoming", "history"] as BorrowingView[]).find((v) => counts[v] > 0) ??
    "active";

  // Scroll to and briefly highlight a borrowing a link pointed at.
  const [flash, setFlash] = useState<string | null>(null);
  const focusReady = !!focus && borrowRequests.some((r) => r.id === focus);
  useEffect(() => {
    if (!focus || !focusReady) return;
    requestAnimationFrame(() => scrollToSection(`borrowing-${focus}`));
    setFlash(focus);
    const t = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(t);
  }, [focus, focusReady]);

  if (borrowRequests.length === 0 && eventRequests.length === 0) {
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

  // Review once per listing: offer it on the most recent returned request only.
  const reviewTarget = new Map<number, string>();
  for (const r of borrowRequests) {
    if (r.status === "returned" && !r.reviewed && !reviewTarget.has(r.itemId)) {
      reviewTarget.set(r.itemId, r.id);
    }
  }

  const reviewAction = (request: BorrowRequest) =>
    request.status === "returned" &&
    (reviewTarget.get(request.itemId) === request.id ? (
      <button className="btn btn--primary btn--sm" onClick={() => onReview(request)}>
        <Star size={14} aria-hidden="true" />
        Leave a review
      </button>
    ) : request.reviewed ? (
      <span className="request-row__done">
        <CircleCheckBig size={14} aria-hidden="true" />
        Reviewed
      </span>
    ) : null);

  const urgentActive = groups.active.filter((r) => {
    const u = urgencyOf(r.returnDueAt, now);
    return stageOf(r) === "active" && (u === "soon" || u === "overdue");
  }).length;

  const empty: Record<BorrowingView, { title: string; text: string }> = {
    pending: { title: "Nothing waiting on a lender", text: "Requests you send show up here until the lender replies." },
    upcoming: {
      title: "No upcoming bookings",
      text: "Approved requests wait here until you pick the item up.",
    },
    active: {
      title: "You're not borrowing anything right now",
      text: "Once you've picked something up, its return deadline and time left show here.",
    },
    history: { title: "No history yet", text: "Returned, declined and cancelled requests end up here." },
  };

  return (
    <>
      <nav className="subtabs" aria-label="Borrowing">
        {(Object.keys(VIEW_LABELS) as BorrowingView[]).map((v) => (
          <a
            key={v}
            className={`subtab${view === v ? " subtab--active" : ""}`}
            aria-current={view === v ? "page" : undefined}
            href={paths.borrowing(v)}
          >
            {VIEW_LABELS[v]}
            <span className="subtab__count">{counts[v]}</span>
            {v === "active" && urgentActive > 0 && (
              <span className="subtab__alert" title="Due within a day or overdue">
                <span className="sr-only">, {urgentActive} due soon or overdue</span>
              </span>
            )}
          </a>
        ))}
      </nav>

      {view === "pending" && (
        <>
          {pendingEvents.map((event) => {
            const children = borrowRequests.filter((r) => r.eventRequestId === event.id);
            return (
              <article key={event.id} className="event-card">
                <header className="event-card__head">
                  <span className="event-card__icon">
                    <PartyPopper size={20} aria-hidden="true" />
                  </span>
                  <div className="event-card__title">
                    <h3>{event.eventTitle}</h3>
                    <p className="muted">
                      {formatRange({ start: event.startDate, end: event.endDate })} · {children.length}{" "}
                      {children.length === 1 ? "item" : "items"} · {event.totalSwitchies} Switchies
                    </p>
                  </div>
                  <StatusPill status={event.status} />
                </header>
                {event.description && <p className="event-card__desc">"{event.description}"</p>}
                <ul className="request-list">
                  {children.map((request) => (
                    <RequestRow key={request.id} request={request} />
                  ))}
                </ul>
                <button
                  className="btn btn--secondary btn--sm"
                  disabled={busy === `event-${event.id}`}
                  onClick={() => onCancelEvent(event.id)}
                >
                  Cancel event request
                </button>
              </article>
            );
          })}
          {groups.pending.some((r) => !r.eventRequestId) && (
            <ul className="request-list">
              {groups.pending
                .filter((r) => !r.eventRequestId)
                .map((request) => (
                  <RequestRow key={request.id} request={request}>
                    <button
                      className="btn btn--secondary btn--sm"
                      disabled={busy === request.id}
                      onClick={() => onCancel(request.id)}
                    >
                      Cancel
                    </button>
                  </RequestRow>
                ))}
            </ul>
          )}
        </>
      )}

      {view === "upcoming" && groups.upcoming.length > 0 && (
        <ul className="request-list">
          {groups.upcoming.map((request) => (
            <RequestRow key={request.id} request={request}>
              <button
                className="btn btn--secondary btn--sm"
                disabled={busy === request.id}
                onClick={() => onPickedUp(request.id)}
              >
                <PackageCheck size={14} aria-hidden="true" />
                I've picked it up
              </button>
            </RequestRow>
          ))}
        </ul>
      )}

      {view === "active" && groups.active.length > 0 && (
        <div className="loan-list">
          {groups.active.map((request) => (
            <LoanCard
              key={request.id}
              request={request}
              now={now}
              highlighted={flash === request.id}
              busy={busy === request.id}
              onExtend={() => onExtend(request)}
              onReturn={() => onReturn(request)}
            />
          ))}
        </div>
      )}

      {view === "history" && groups.history.length > 0 && (
        <ul className="request-list">
          {groups.history.map((request) => (
            <RequestRow key={request.id} request={request}>
              {reviewAction(request)}
            </RequestRow>
          ))}
        </ul>
      )}

      {counts[view] === 0 && (
        <div className="empty empty--compact">
          <h3>{empty[view].title}</h3>
          <p>{empty[view].text}</p>
          {view !== "history" && (
            <a className="btn btn--secondary" href={paths.browse}>
              Browse items
            </a>
          )}
        </div>
      )}
    </>
  );
}

function Lending({
  section,
  incoming,
  busy,
  onOpen,
  onDecline,
  onHandedOver,
  onExtension,
}: {
  section: LendingSection | null;
  incoming: BorrowRequest[];
  busy: string | null;
  onOpen: (type: "approve" | "return-time" | "returned" | "rate", request: BorrowRequest) => void;
  onDecline: (id: string) => void;
  onHandedOver: (id: string) => void;
  onExtension: (request: BorrowRequest, decision: "approve" | "decline") => void;
}) {
  // Jump to the section a link asked for, once its rows are on the page.
  const hasRows = incoming.length > 0;
  useEffect(() => {
    if (section && hasRows) requestAnimationFrame(() => scrollToSection(`lending-${section}`));
  }, [section, hasRows]);

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

  const returns = incoming.filter((r) => stageOf(r) === "return_pending");
  const extensions = incoming.filter((r) => r.pendingExtension && stageOf(r) === "active");
  const requests = incoming.filter((r) => r.status === "pending");
  const onLoan = incoming
    .filter((r) => stageOf(r) === "active")
    .sort((a, b) => (parseTime(a.returnDueAt) ?? Infinity) - (parseTime(b.returnDueAt) ?? Infinity));
  const upcoming = incoming
    .filter((r) => stageOf(r) === "upcoming")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = incoming.filter((r) => ["returned", "declined", "cancelled"].includes(stageOf(r)));
  const waitingCount = returns.length + extensions.length + requests.length;

  const returnTimeButton = (request: BorrowRequest) => (
    <button className="btn btn--secondary btn--sm" onClick={() => onOpen("return-time", request)}>
      <Clock size={14} aria-hidden="true" />
      Change return time
    </button>
  );

  return (
    <>
      {waitingCount > 0 && (
        <section className="request-section" id="lending-waiting">
          <h2>Waiting for you</h2>
          {requests.length > 0 && (
            <p className="muted small request-section__note">
              Approving a request books those dates, moves the Switchies to you, and lets you choose when
              you want it back.
            </p>
          )}
          <ul className="request-list">
            {returns.map((request) => (
              <RequestRow key={`return-${request.id}`} request={request} asLender>
                <p className="request-row__note">
                  <PackageCheck size={14} aria-hidden="true" />
                  {shortName(request.borrowerName) || "The borrower"} says they returned it
                  {request.returnRequestedAt ? ` ${formatDateTime(request.returnRequestedAt)}` : ""}. Confirm
                  once you have it.
                </p>
                <div className="request-row__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={busy === request.id}
                    onClick={() => onOpen("returned", request)}
                  >
                    <CircleCheckBig size={14} aria-hidden="true" />
                    Confirm return
                  </button>
                </div>
              </RequestRow>
            ))}
            {extensions.map((request) => {
              const ext = request.pendingExtension!;
              return (
                <RequestRow key={`ext-${request.id}`} request={request} asLender>
                  <p className="request-row__note">
                    <CalendarPlus size={14} aria-hidden="true" />
                    Wants to keep it until {formatDateTime(ext.requestedDueAt)}
                    {ext.extraDays > 0
                      ? ` · ${ext.extraDays} more ${ext.extraDays === 1 ? "day" : "days"} · ${ext.extraSwitchies} Switchies to you`
                      : " · no extra cost"}
                    . Currently due {request.returnDueAt ? formatDateTime(request.returnDueAt) : "–"}.
                  </p>
                  <div className="request-row__actions">
                    <button
                      className="btn btn--primary btn--sm"
                      disabled={busy === request.id}
                      onClick={() => onExtension(request, "approve")}
                    >
                      Give more time
                    </button>
                    <button
                      className="btn btn--secondary btn--sm"
                      disabled={busy === request.id}
                      onClick={() => onExtension(request, "decline")}
                    >
                      Decline
                    </button>
                  </div>
                </RequestRow>
              );
            })}
            {requests.map((request) => (
              <RequestRow key={request.id} request={request} asLender>
                <div className="request-row__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={busy === request.id}
                    onClick={() => onOpen("approve", request)}
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

      {onLoan.length > 0 && (
        <section className="request-section" id="lending-on-loan">
          <h2>Out on loan</h2>
          <ul className="request-list">
            {onLoan.map((request) => (
              <RequestRow key={request.id} request={request} asLender>
                <div className="request-row__actions">
                  <button className="btn btn--primary btn--sm" onClick={() => onOpen("returned", request)}>
                    <CircleCheckBig size={14} aria-hidden="true" />
                    Mark as returned
                  </button>
                  {returnTimeButton(request)}
                </div>
              </RequestRow>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="request-section" id="lending-upcoming">
          <h2>Coming up</h2>
          <p className="muted small request-section__note">
            Booked but not picked up yet. Mark the handover when you give it to them; that starts the loan.
          </p>
          <ul className="request-list">
            {upcoming.map((request) => (
              <RequestRow key={request.id} request={request} asLender>
                <div className="request-row__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={busy === request.id}
                    onClick={() => onHandedOver(request.id)}
                  >
                    <Handshake size={14} aria-hidden="true" />
                    Mark as handed over
                  </button>
                  {returnTimeButton(request)}
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
              <RequestRow key={request.id} request={request} asLender>
                {request.status === "returned" && request.borrowerRating === null && (
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => onOpen("rate", request)}
                  >
                    <Star size={14} aria-hidden="true" />
                    Score borrower
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
  const person = asLender ? (
    <>
      by{" "}
      <a className="person-link" href={paths.user(request.borrowerId)}>
        {shortName(request.borrowerName) || "a student"}
      </a>
    </>
  ) : (
    <>
      from{" "}
      <a className="person-link" href={paths.user(request.lenderId)}>
        {shortName(request.lenderName) || (item ? lenderNameOf(item) : getUserName(request.lenderId))}
      </a>
    </>
  );
  const now = useNow();
  const overdue = isOverdue(request, now);
  const dueAt = parseTime(request.returnDueAt);
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
          {asLender && request.borrowerScore && (
            <span className="request-row__score" title="Score from other lenders">
              <Stars value={request.borrowerScore.average} size={12} />
              {request.borrowerScore.average.toFixed(1)} ({request.borrowerScore.count})
            </span>
          )}
        </span>
        <Timeline request={request} />
        {request.borrowerRating !== null && request.borrowerRating !== undefined && (
          <span className="request-row__given">
            {asLender ? "You gave" : `${shortName(request.lenderName) || "The lender"} gave you`}{" "}
            <Stars value={request.borrowerRating} size={12} />
            {request.borrowerRatingComment && (
              <>
                <MessageSquareText size={12} aria-hidden="true" />"{request.borrowerRatingComment}"
              </>
            )}
          </span>
        )}
      </div>
      <span className="request-row__price">{request.totalSwitchies} Swi.</span>
      {overdue && dueAt !== null ? (
        <span className="status status--overdue">Overdue by {formatDuration(now - dueAt)}</span>
      ) : (
        <StatusPill request={request} asLender={asLender} />
      )}
      {children}
    </li>
  );
}

/** Timestamps for each step, in the viewer's time zone. */
function Timeline({ request: r }: { request: BorrowRequest }) {
  const steps: string[] = [`Requested ${formatDateTime(r.createdAt)}`];
  if (r.decidedAt) {
    steps.push(`${r.status === "declined" ? "Declined" : "Approved"} ${formatDateTime(r.decidedAt)}`);
  }
  if (r.handedOverAt) steps.push(`Picked up ${formatDateTime(r.handedOverAt)}`);
  if (r.returnRequestedAt && !r.returnedAt) {
    steps.push(`Marked returned ${formatDateTime(r.returnRequestedAt)}`);
  }
  if (r.returnedAt) {
    const early = r.returnDueAt && new Date(r.returnedAt) < new Date(r.returnDueAt);
    steps.push(`Return confirmed ${formatDateTime(r.returnedAt)}${early ? " (early)" : ""}`);
    if (r.lateFeeSwitchies) steps.push(`Late fee ${r.lateFeeSwitchies} Switchies`);
  } else if (r.returnDueAt && r.status === "approved") {
    steps.push(`Return by ${formatDateTime(r.returnDueAt)}`);
  }
  return (
    <span className="request-row__timeline">
      <Clock size={12} aria-hidden="true" />
      {steps.join(" · ")}
    </span>
  );
}

/** Approve with a return time, or change the return time later. */
function ReturnTimeDialog({
  request,
  mode,
  onClose,
  onSave,
}: {
  request: BorrowRequest;
  mode: "approve" | "change";
  onClose: () => void;
  onSave: (iso: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(
    request.returnDueAt
      ? isoToLocalInput(request.returnDueAt)
      : request.requestedReturnAt
        ? isoToLocalInput(request.requestedReturnAt)
        : localDateTimeInput(request.endDate, 18),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const iso = localInputToISO(value);
    if (!iso) return setError("Choose a date and time.");
    if (new Date(iso).getTime() < Date.now()) return setError("Pick a time that hasn't passed yet.");
    setSaving(true);
    setError(null);
    try {
      await onSave(iso);
      onClose();
    } catch (err) {
      setError((err as RequestError).message);
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={mode === "approve" ? `Approve ${titleOf(request)}` : "Change the return time"}
      icon={<Clock size={24} />}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={submit} noValidate>
        <p className="muted">
          {shortName(request.borrowerName) || "The borrower"} has it{" "}
          {formatRange({ start: request.startDate, end: request.endDate })}.
          {mode === "approve" &&
            ` You'll receive ${request.totalSwitchies} Switchies when you approve.`}
        </p>
        <DateTimeField
          label="When do you want it back?"
          timeLabel="Return time"
          date={value.slice(0, 10)}
          time={value.slice(11, 16)}
          min={request.startDate > todayISO() ? request.startDate : todayISO()}
          max={addDays(request.endDate, 1)}
          onChange={(date, time) => setValue(date && time ? `${date}T${time}` : `${date}T`)}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Saving..." : mode === "approve" ? "Approve" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** A 1-5 rating with an optional comment, used for returns, borrower scores and reviews. */
function ScoreDialog({
  title,
  intro,
  ratingLabel,
  commentLabel = "Comment (optional)",
  optionalRating = false,
  maxComment = 500,
  submitLabel,
  onClose,
  onSave,
}: {
  title: string;
  intro: string;
  ratingLabel: string;
  commentLabel?: string;
  optionalRating?: boolean;
  maxComment?: number;
  submitLabel: string;
  onClose: () => void;
  onSave: (score: Score | null) => Promise<unknown>;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trimmed = comment.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rating && !optionalRating) return setError("Choose a rating from 1 to 5 stars.");
    if (!rating && trimmed) return setError("Add a star rating to go with your comment.");
    if (trimmed && trimmed.length < 10) return setError("Comments need at least 10 characters.");
    setSaving(true);
    setError(null);
    try {
      await onSave(rating ? { rating, comment: trimmed } : null);
      onClose();
    } catch (err) {
      setError((err as RequestError).message);
      setSaving(false);
    }
  };

  return (
    <Dialog title={title} icon={<Star size={24} />} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <p className="muted">{intro}</p>
        <StarInput label={ratingLabel} value={rating} onChange={setRating} />
        <label className="field">
          <span className="field__label">{commentLabel}</span>
          <textarea
            rows={3}
            maxLength={maxComment}
            value={comment}
            placeholder="At least 10 characters"
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
