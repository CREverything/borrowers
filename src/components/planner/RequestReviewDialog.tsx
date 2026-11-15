import { CircleCheckBig, CircleX, Coins, Send } from "lucide-react";
import { useRef, useState } from "react";
import { lenderNameOf } from "../../data/users";
import type { PlanRequirement } from "../../lib/planning";
import { formatDateTime, localInputToISO } from "../../lib/dates";
import { paths } from "../../router";
import type { SubmitResult } from "../../services/plansApi";
import type { Item } from "../../types";
import Dialog from "../Dialog";

export interface ReviewRow {
  req: PlanRequirement;
  item: Item;
  totalSwitchies: number;
}

/**
 * Review before sending: each listing, its lender, the period and the price.
 * After sending, shows exactly which requests went through and which didn't.
 */
export default function RequestReviewDialog({
  rows,
  blocked = [],
  startLocal,
  returnLocal,
  balance,
  onClose,
  onSend,
}: {
  rows: ReviewRow[];
  /** Selected listings that aren't free on these dates; they won't be requested. */
  blocked?: { title: string; forName: string; reason: string }[];
  startLocal: string;
  returnLocal: string;
  balance: number | null;
  onClose: () => void;
  onSend: () => Promise<SubmitResult[]>;
}) {
  // Snapshot what's being reviewed, so the list doesn't shift while sending.
  const [snapshot] = useState(rows);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SubmitResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const total = snapshot.reduce((s, r) => s + r.totalSwitchies, 0);
  const lenders = new Set(snapshot.map((r) => r.item.lenderId)).size;
  const startAt = localInputToISO(startLocal);
  const returnAt = localInputToISO(returnLocal);

  const send = async () => {
    // Ignore repeat clicks while a send is in progress.
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      setResults(await onSend());
    } catch (e) {
      setError((e as Error).message || "Nothing was sent. Please try again.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  if (results) {
    const sent = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    const byId = new Map(snapshot.map((r) => [r.item.id, r]));
    return (
      <Dialog
        title={failed.length === 0 ? "Requests sent" : sent.length === 0 ? "Nothing was sent" : "Some requests went through"}
        icon={failed.length === 0 ? <CircleCheckBig size={24} /> : <CircleX size={24} />}
        onClose={onClose}
      >
        <div className="dialog-form">
          <p>
            <strong>
              {sent.length} of {results.length}
            </strong>{" "}
            {results.length === 1 ? "request" : "requests"} sent.{" "}
            {sent.length > 0 && "Each lender approves separately; no Switchies move until they do."}
          </p>
          <ul className="review-list">
            {results.map((r) => {
              const row = byId.get(r.itemId);
              return (
                <li key={r.itemId} className={r.ok ? "review-list__ok" : "review-list__fail"}>
                  {r.ok ? <CircleCheckBig size={16} aria-hidden="true" /> : <CircleX size={16} aria-hidden="true" />}
                  <span>
                    <strong>{row?.item.title ?? "Listing"}</strong>{" "}
                    {r.ok
                      ? r.alreadyRequested
                        ? "was already requested from this plan."
                        : `sent to ${row ? lenderNameOf(row.item) : "the lender"}.`
                      : `wasn't sent: ${r.error}`}
                  </span>
                </li>
              );
            })}
          </ul>
          {failed.length > 0 && (
            <p className="muted small">The ones that weren't sent are still selected in your plan, so you can choose another listing.</p>
          )}
          <div className="modal__actions">
            <a className="btn btn--secondary" href={paths.requests}>
              My requests
            </a>
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Back to plan
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Review your requests" icon={<Send size={24} />} onClose={onClose}>
      <div className="dialog-form">
        <p className="muted">
          {startAt && returnAt ? (
            <>
              Pick up {formatDateTime(startAt)}, return by {formatDateTime(returnAt)}.
            </>
          ) : (
            "Set your dates first."
          )}{" "}
          {snapshot.length} {snapshot.length === 1 ? "listing" : "listings"} from {lenders}{" "}
          {lenders === 1 ? "lender" : "lenders"}.
        </p>
        {blocked.length > 0 && (
          <div className="review-warning" role="alert">
            <p>
              <strong>
                Only {snapshot.length} of {snapshot.length + blocked.length} selected items are available on these dates.
              </strong>{" "}
              If you go ahead, requests are sent for the available ones only. The others stay selected in your
              plan, so you can pick other dates or listings for them later.
            </p>
            <ul>
              {blocked.map((b, i) => (
                <li key={i}>
                  <strong>{b.title}</strong> ({b.forName}): {b.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="review-list">
          {snapshot.map((r) => (
            <li key={r.item.id}>
              <span>
                <strong>{r.item.title}</strong> for {r.req.name}
                <span className="muted small">
                  {" "}
                  · {lenderNameOf(r.item)} · {r.item.location}
                </span>
              </span>
              <span className="review-list__price">{r.totalSwitchies} Swi.</span>
            </li>
          ))}
        </ul>
        <p className="review-total">
          <Coins size={18} aria-hidden="true" /> <strong>{total} Switchies</strong> estimated
          {balance !== null && <span className="muted"> · you have {balance}</span>}
        </p>
        {balance !== null && total > balance && (
          <p className="form-error">
            That's more than your balance. Each request is checked on its own, and each approval needs enough
            Switchies at that moment.
          </p>
        )}
        <p className="muted small">
          Availability and prices are checked again by the server as each request is sent. Nothing is charged
          until a lender approves.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void send()} disabled={sending || snapshot.length === 0}>
            {sending
              ? "Sending..."
              : blocked.length > 0
                ? `Request the ${snapshot.length} available`
                : `Send ${snapshot.length} ${snapshot.length === 1 ? "request" : "requests"}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
