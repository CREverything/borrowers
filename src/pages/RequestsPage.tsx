import {
  CalendarDays,
  CircleCheckBig,
  Clock,
  Inbox,
  LogIn,
  MessageSquareText,
  Package,
  PartyPopper,
  ShoppingBag,
  Star,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuthState } from "../auth/AuthContext";
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
  todayISO,
} from "../lib/dates";
import { useRequests } from "../hooks/useRequests";
import { navigate, paths, type LendingSection } from "../router";
import { scrollToSection } from "../lib/scroll";
import {
  approveRequest,
  cancelBorrowRequest,
  cancelEventRequest,
  declineRequest,
  loadRequests,
  markReturned,
  rateBorrower,
  RequestError,
  reviewListing,
  setReturnTime,
  type Score,
} from "../services/requestStore";
import type { BorrowRequest, EventRequest, RequestStatus } from "../types";

const statusLabels: Record<RequestStatus, string> = {
  pending: "Pending lender approval",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
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

export default function RequestsPage({
  tab,
  section = null,
}: {
  tab: Tab;
  /** Part of the lending tab to scroll to, from the activity bar. */
  section?: LendingSection | null;
}) {
  const { status, user } = useAuthState();

  if (status === "signed-in" && user) {
    return <MyRequests userId={user.id} tab={tab} section={section} />;
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
  | { type: "approve" | "return-time" | "returned" | "rate" | "review"; request: BorrowRequest }
  | null;

function MyRequests({
  userId,
  tab,
  section,
}: {
  userId: string;
  tab: Tab;
  section: LendingSection | null;
}) {
  const { getToken } = useAuthState();
  const { status, borrowRequests, eventRequests, incoming } = useRequests();
  const pendingIncoming = incoming.filter((r) => r.status === "pending").length;
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
          borrowRequests={borrowRequests}
          eventRequests={eventRequests}
          busy={busy}
          onCancel={(id) => run(id, () => cancelBorrowRequest(getToken, id))}
          onCancelEvent={(id) => run(`event-${id}`, () => cancelEventRequest(getToken, id))}
          onReview={(request) => setDialog({ type: "review", request })}
        />
      ) : (
        <Lending
          section={section}
          incoming={incoming}
          busy={busy}
          onOpen={(type, request) => setDialog({ type, request })}
          onDecline={(id) => run(id, () => declineRequest(getToken, id))}
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
      {dialog?.type === "returned" && (
        <ScoreDialog
          title={`Mark ${titleOf(dialog.request)} as returned`}
          intro="Got it back early? That's fine. You can also score the borrower now or later."
          ratingLabel={`Score ${shortName(dialog.request.borrowerName) || "the borrower"} (optional)`}
          optionalRating
          submitLabel="Mark as returned"
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

const isOverdue = (r: BorrowRequest) =>
  r.status === "approved" && !!r.returnDueAt && new Date(r.returnDueAt).getTime() < Date.now();

function Borrowing({
  borrowRequests,
  eventRequests,
  busy,
  onCancel,
  onCancelEvent,
  onReview,
}: {
  borrowRequests: BorrowRequest[];
  eventRequests: EventRequest[];
  busy: string | null;
  onCancel: (id: string) => void;
  onCancelEvent: (id: string) => void;
  onReview: (request: BorrowRequest) => void;
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

  // Review once per listing: offer it on the most recent returned request only.
  const reviewTarget = new Map<number, string>();
  for (const r of borrowRequests) {
    if (r.status === "returned" && !r.reviewed && !reviewTarget.has(r.itemId)) {
      reviewTarget.set(r.itemId, r.id);
    }
  }

  const borrowerActions = (request: BorrowRequest, cancellable: boolean) => (
    <>
      {cancellable && request.status === "pending" && (
        <button
          className="btn btn--secondary btn--sm"
          disabled={busy === request.id}
          onClick={() => onCancel(request.id)}
        >
          Cancel
        </button>
      )}
      {request.status === "returned" &&
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
        ) : null)}
    </>
  );

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
                    <RequestRow key={request.id} request={request}>
                      {borrowerActions(request, false)}
                    </RequestRow>
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
                {borrowerActions(request, true)}
              </RequestRow>
            ))}
          </ul>
        </section>
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
}: {
  section: LendingSection | null;
  incoming: BorrowRequest[];
  busy: string | null;
  onOpen: (type: "approve" | "return-time" | "returned" | "rate", request: BorrowRequest) => void;
  onDecline: (id: string) => void;
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

  const waiting = incoming.filter((r) => r.status === "pending");
  // Approved loans whose dates have started count as out; later ones are just booked.
  const today = todayISO();
  const approved = incoming.filter((r) => r.status === "approved");
  const onLoan = approved.filter((r) => r.startDate <= today);
  const upcoming = approved.filter((r) => r.startDate > today);
  const past = incoming.filter((r) => r.status !== "pending" && r.status !== "approved");

  return (
    <>
      {waiting.length > 0 && (
        <section className="request-section" id="lending-waiting">
          <h2>Waiting for you</h2>
          <p className="muted small request-section__note">
            Approving books those dates, moves the Switchies to you, and lets
            you choose when you want it back.
          </p>
          <ul className="request-list">
            {waiting.map((request) => (
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
      {[
        { id: "on-loan", title: "Out on loan", rows: onLoan },
        { id: "upcoming", title: "Coming up", rows: upcoming },
      ].map(
        (group) =>
          group.rows.length > 0 && (
            <section key={group.id} className="request-section" id={`lending-${group.id}`}>
              <h2>{group.title}</h2>
              <ul className="request-list">
                {group.rows.map((request) => (
                  <RequestRow key={request.id} request={request} asLender>
                    <div className="request-row__actions">
                      <button
                        className="btn btn--primary btn--sm"
                        onClick={() => onOpen("returned", request)}
                      >
                        <CircleCheckBig size={14} aria-hidden="true" />
                        Mark as returned
                      </button>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => onOpen("return-time", request)}
                      >
                        <Clock size={14} aria-hidden="true" />
                        Change return time
                      </button>
                    </div>
                  </RequestRow>
                ))}
              </ul>
            </section>
          ),
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
  const overdue = isOverdue(request);
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
      {overdue ? (
        <span className="status status--overdue">Overdue</span>
      ) : (
        <StatusPill status={request.status} asLender={asLender} />
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
  if (r.returnedAt) {
    const early = r.returnDueAt && new Date(r.returnedAt) < new Date(r.returnDueAt);
    steps.push(`Returned ${formatDateTime(r.returnedAt)}${early ? " (early)" : ""}`);
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
    request.returnDueAt ? isoToLocalInput(request.returnDueAt) : localDateTimeInput(request.endDate, 18),
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
        <label className="field">
          <span className="field__label">When do you want it back?</span>
          <input
            type="datetime-local"
            value={value}
            min={`${request.startDate}T00:00`}
            max={`${request.endDate}T23:59`}
            onChange={(e) => setValue(e.target.value)}
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
