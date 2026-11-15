import {
  CalendarPlus,
  CircleAlert,
  Clock,
  Hourglass,
  PackageCheck,
  TriangleAlert,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { getUserName, lenderNameOf, shortName } from "../data/users";
import { useItems } from "../hooks/useItems";
import { useBalance } from "../hooks/useRequests";
import {
  describeDeadline,
  formatDuration,
  LATE_FEE_PER_HOUR,
  lateFee,
  loanProgress,
  parseTime,
  urgencyOf,
} from "../lib/deadline";
import { addDays, daysInclusive, formatDateTime, isoToLocalInput, localInputToISO, todayISO } from "../lib/dates";
import { paths } from "../router";
import type { RequestError } from "../services/requestStore";
import type { BorrowRequest, ISODate } from "../types";
import DateTimeField from "./DateTimeField";
import Dialog from "./Dialog";
import ItemIllustration from "./ItemIllustration";
import { ReportIssueButton } from "./ReportIssue";

const titleOf = (r: BorrowRequest) => r.itemTitle || "this item";

function lenderOf(r: BorrowRequest, item?: { lenderId: string; lenderName?: string }) {
  return shortName(r.lenderName) || (item ? lenderNameOf(item) : getUserName(r.lenderId));
}

/**
 * One item the borrower has right now: when they got it, the exact return
 * deadline, time left, and what they can do about it. Urgency rises from
 * neutral (over 72h) to a reminder (72h), a yellow countdown (24h) and a red
 * overdue warning, which stays until the loan is resolved.
 */
export function LoanCard({
  request: r,
  now,
  highlighted,
  busy,
  onExtend,
  onReturn,
}: {
  request: BorrowRequest;
  now: number;
  highlighted: boolean;
  busy: boolean;
  onExtend: () => void;
  onReturn: () => void;
}) {
  const { getItem } = useItems();
  const item = getItem(r.itemId);
  const title = item?.title ?? titleOf(r);
  const returning = r.stage === "return_pending";
  const urgency = urgencyOf(r.returnDueAt, now);
  const due = parseTime(r.returnDueAt);
  const progress = loanProgress(r.handedOverAt, r.returnDueAt, now);
  const ext = r.pendingExtension;

  const tone = returning ? "returning" : (urgency ?? "normal");

  return (
    <article
      id={`borrowing-${r.id}`}
      className={`loan-card loan-card--${tone}${highlighted ? " loan-card--focus" : ""}`}
      aria-labelledby={`loan-title-${r.id}`}
    >
      {item && <ItemIllustration item={item} size={36} className="loan-card__media" />}

      <div className="loan-card__body">
        <header className="loan-card__head">
          <div>
            <h3 id={`loan-title-${r.id}`}>
              {item ? <a href={paths.item(item.id)}>{title}</a> : title}
            </h3>
            <p className="muted small">
              from{" "}
              <a className="person-link" href={paths.user(r.lenderId)}>
                {lenderOf(r, item)}
              </a>
            </p>
          </div>
          <LoanStatus request={r} urgency={urgency} />
        </header>

        <dl className="loan-card__facts">
          <div>
            <dt>Picked up</dt>
            <dd>{r.handedOverAt ? formatDateTime(r.handedOverAt) : "–"}</dd>
          </div>
          <div>
            <dt>Return by</dt>
            <dd>{r.returnDueAt ? formatDateTime(r.returnDueAt) : "No deadline set"}</dd>
          </div>
        </dl>

        {returning && (
          <p className="loan-card__notice loan-card__notice--returning">
            <PackageCheck size={16} aria-hidden="true" />
            <span>
              You marked this returned{r.returnRequestedAt ? ` ${formatDateTime(r.returnRequestedAt)}` : ""}.
              Waiting for {lenderOf(r, item)} to confirm they have it.
              {urgency === "overdue" && " Until they do, it still counts as overdue."}
            </span>
          </p>
        )}
        {urgency === "overdue" && due !== null ? (
          <p className="loan-card__countdown loan-card__countdown--overdue">
            <TriangleAlert size={18} aria-hidden="true" />
            <span>
              <strong>Overdue by {formatDuration(now - due)}</strong>
              <span className="loan-card__sub">
                Late fee so far: <strong className="loan-card__fee">{lateFee(r.returnDueAt, now)} Switchies</strong>{" "}
                ({LATE_FEE_PER_HOUR} for every full hour late, until the lender confirms it's back).
                {returning ? "" : " Return it as soon as you can."}
              </span>
            </span>
          </p>
        ) : urgency === "soon" && due !== null ? (
          <p className="loan-card__countdown loan-card__countdown--soon">
            <Hourglass size={18} aria-hidden="true" />
            <span>
              <strong>{formatDuration(due - now)} left</strong>
              <span className="loan-card__sub">
                Due back within a day. After that it's {LATE_FEE_PER_HOUR} Switchies for every hour late.
              </span>
            </span>
          </p>
        ) : (
          <div className="loan-card__progress-row">
            {progress !== null && (
              <span className="loan-card__progress" aria-hidden="true">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            )}
            <span className={`loan-card__left${urgency === "upcoming" ? " loan-card__left--upcoming" : ""}`}>
              {urgency === "upcoming" && <Clock size={14} aria-hidden="true" />}
              {due !== null ? `${formatDuration(due - now)} left` : "No deadline set"}
              {urgency === "upcoming" && " · due within 3 days"}
            </span>
          </div>
        )}

        {ext && (
          <p className="loan-card__notice">
            <CalendarPlus size={16} aria-hidden="true" />
            <span>
              You asked to keep it until {formatDateTime(ext.requestedDueAt)}
              {ext.extraSwitchies > 0 ? ` for ${ext.extraSwitchies} more Switchies` : ""}. Waiting for{" "}
              {lenderOf(r, item)} to reply; your deadline stays the same until then.
            </span>
          </p>
        )}

        {!returning && (
          <div className="loan-card__actions">
            <button className="btn btn--secondary btn--sm" disabled={busy || !!ext} onClick={onExtend}>
              <CalendarPlus size={14} aria-hidden="true" />
              {ext ? "Extension requested" : "Request extension"}
            </button>
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={onReturn}>
              <PackageCheck size={14} aria-hidden="true" />
              Mark as returned
            </button>
          </div>
        )}
        {/* Secondary and quiet: available even while a return awaits confirmation. */}
        <div className="loan-card__report">
          <ReportIssueButton request={r} />
        </div>
      </div>
    </article>
  );
}

function LoanStatus({ request: r, urgency }: { request: BorrowRequest; urgency: ReturnType<typeof urgencyOf> }) {
  // Overdue wins: it stays overdue until the lender confirms the return.
  if (urgency === "overdue") return <span className="status status--overdue">Overdue</span>;
  if (r.stage === "return_pending") {
    return <span className="status status--return-pending">Return pending confirmation</span>;
  }
  if (urgency === "soon") return <span className="status status--pending">Due soon</span>;
  return <span className="status status--active">Borrowing</span>;
}

/** Borrower confirms they've handed the item back. The lender still has to confirm. */
export function ReturnDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: BorrowRequest;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lender = shortName(request.lenderName) || "the lender";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError((err as RequestError).message);
      setSaving(false);
    }
  };

  return (
    <Dialog title={`Return ${titleOf(request)}`} icon={<PackageCheck size={24} />} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <p>Have you handed {titleOf(request)} back to {lender}?</p>
        <p className="muted small">
          {lender} will be asked to confirm they have it. Until then it shows as "Return pending
          confirmation".
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Not yet
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Saving..." : "Yes, I've returned it"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Extra days past the current end date; the same day costs nothing extra. */
export function extraDaysFor(currentEnd: ISODate, newEnd: ISODate): number {
  return Math.max(0, daysInclusive(currentEnd, newEnd) - 1);
}

/**
 * Borrower proposes a later return time. Shows the current deadline and the
 * extra cost; nothing changes until the lender approves.
 */
export function ExtensionDialog({
  request: r,
  maxBorrowDays,
  onClose,
  onSave,
}: {
  request: BorrowRequest;
  maxBorrowDays: number | null;
  onClose: () => void;
  onSave: (body: { requestedDueAt: string; newEndDate: ISODate }) => Promise<unknown>;
}) {
  const balance = useBalance();
  const currentDue = parseTime(r.returnDueAt);
  const [value, setValue] = useState(() =>
    isoToLocalInput(new Date((currentDue ?? Date.now()) + 86_400_000).toISOString()),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const iso = localInputToISO(value);
  const newEndDate = value.slice(0, 10);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(newEndDate);
  const extraDays = validDate ? extraDaysFor(r.endDate, newEndDate) : 0;
  const perDay = r.switchiesPerDay ?? Math.round(r.totalSwitchies / Math.max(1, r.days));
  const cost = extraDays * perDay;
  const totalDays = validDate ? daysInclusive(r.startDate, newEndDate < r.endDate ? r.endDate : newEndDate) : r.days;

  const problem = (): string | null => {
    if (!iso || !validDate) return "Choose a date and time.";
    const t = Date.parse(iso);
    if (currentDue !== null && t <= currentDue) return "Pick a time after your current deadline.";
    if (t <= Date.now()) return "Pick a time that hasn't passed yet.";
    if (maxBorrowDays !== null && totalDays > maxBorrowDays) {
      return `This item can be borrowed for up to ${maxBorrowDays} days in total.`;
    }
    if (balance !== null && cost > balance) return `This costs ${cost} Switchies but you have ${balance}.`;
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issue = problem();
    if (issue) return setError(issue);
    setSaving(true);
    setError(null);
    try {
      await onSave({ requestedDueAt: iso!, newEndDate });
      onClose();
    } catch (err) {
      setError((err as RequestError).message);
      setSaving(false);
    }
  };

  return (
    <Dialog title="Request more time" icon={<CalendarPlus size={24} />} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <p className="muted">
          {titleOf(r)} is due back <strong>{r.returnDueAt ? formatDateTime(r.returnDueAt) : "–"}</strong>
          {r.returnDueAt ? ` (${describeDeadline(r.returnDueAt, Date.now())?.toLowerCase()})` : ""}.
        </p>
        <DateTimeField
          label="When would you like to return it?"
          timeLabel="Return time"
          date={value.slice(0, 10)}
          time={value.slice(11, 16)}
          min={r.returnDueAt ? isoToLocalInput(r.returnDueAt).slice(0, 10) : todayISO()}
          max={addDays(todayISO(), 180)}
          onChange={(date, time) => {
            setValue(`${date}T${time}`);
            setError(null);
          }}
        />
        <p className="extension-quote" aria-live="polite">
          {extraDays > 0 ? (
            <>
              <strong>
                {extraDays} more {extraDays === 1 ? "day" : "days"} · {cost} Switchies
              </strong>{" "}
              ({perDay} a day). Paid only if the lender agrees.
            </>
          ) : (
            <>
              <strong>No extra cost</strong>: it's still within your booked days.
            </>
          )}
        </p>
        <p className="muted small">
          <CircleAlert size={14} aria-hidden="true" /> Your current deadline stays in place until the lender
          replies. If the item's booked by someone else on those days, it can't be extended.
        </p>
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
            {saving ? "Sending..." : "Send request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
