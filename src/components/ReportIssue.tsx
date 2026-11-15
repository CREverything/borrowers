import { CircleCheckBig, Flag } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthState } from "../auth/AuthContext";
import { formatDateTime } from "../lib/dates";
import {
  categoryLabel,
  listMyReports,
  REPORT_CATEGORIES,
  REPORT_LIMITS,
  submitReport,
  type MyReport,
  type ReportCategory,
  type ReportError,
} from "../services/reportsApi";
import type { BorrowRequest } from "../types";
import Dialog from "./Dialog";
import Dropdown from "./Dropdown";


/** A small, low-key "Report an issue" link that opens the report form for this borrowing. */
export function ReportIssueButton({ request }: { request: BorrowRequest }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="report-link" onClick={() => setOpen(true)}>
        <Flag size={13} aria-hidden="true" />
        Report an issue
      </button>
      {open && <ReportIssueDialog request={request} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportIssueDialog({ request, onClose }: { request: BorrowRequest; onClose: () => void }) {
  const { getToken } = useAuthState();
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  // One id per form: resubmitting (or a retry after a network blip) returns the same report.
  const nonce = useRef(crypto.randomUUID());
  const inFlight = useRef(false);

  const trimmed = description.trim();
  const title = request.itemTitle || "this item";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!category) return setError("Choose what kind of issue this is.");
    if (trimmed.length < REPORT_LIMITS.min) {
      return setError(`Describe what happened in at least ${REPORT_LIMITS.min} characters.`);
    }
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await submitReport(getToken, {
        bookingId: request.id,
        category,
        description: trimmed,
        clientNonce: nonce.current,
      });
      setSaved({ id: result.id });
    } catch (err) {
      setError((err as ReportError).message);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  if (saved) {
    return (
      <Dialog title="Report submitted" icon={<CircleCheckBig size={24} />} onClose={onClose}>
        <div className="dialog-form">
          <p>Your report has been recorded. You can reference it using the report ID below.</p>
          <p className="report-id">
            <span className="field__label">Report ID</span>
            <code>{saved.id}</code>
          </p>
          <p className="muted small">
            If anyone is in danger or you need help right now, contact campus safety or emergency services.
          </p>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Report an issue" icon={<Flag size={24} />} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <p className="muted">Something not going as expected? Tell us what happened so we can look into it.</p>
        <p className="report-ref">
          <strong>{title}</strong>
          <span className="muted small">Borrowing reference #{request.id}</span>
        </p>
        <div className="field">
          <label className="field__label" htmlFor={`report-category-${request.id}`}>
            What kind of issue?
          </label>
          <Dropdown
            id={`report-category-${request.id}`}
            variant="field"
            label="What kind of issue?"
            value={category}
            options={REPORT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            placeholder="Choose a category"
            onChange={(value) => {
              setCategory(value as ReportCategory);
              setError(null);
            }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`report-description-${request.id}`}>
            What happened?
          </label>
          <textarea
            id={`report-description-${request.id}`}
            rows={4}
            maxLength={REPORT_LIMITS.max}
            placeholder="Briefly describe what happened..."
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
          />
          <span className="field__hint">
            {trimmed.length}/{REPORT_LIMITS.max}
            {trimmed.length < REPORT_LIMITS.min ? ` · at least ${REPORT_LIMITS.min}` : ""}
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={sending}>
            {sending ? "Submitting..." : "Submit Report"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Closed",
};

/** Reports you've submitted (only yours, never reviewer notes). Hidden when there are none. */
export function MyReports() {
  const { getToken } = useAuthState();
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listMyReports(getToken)
      .then((r) => active && setReports(r))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
    // Not keyed on getToken: its identity changes whenever Clerk refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;
  if (!reports || reports.length === 0) return null;
  return (
    <section className="panel my-reports" aria-labelledby="my-reports-title">
      <h2 id="my-reports-title">My reports</h2>
      <ul className="my-reports__list">
        {reports.map((r) => (
          <li key={r.id}>
            <div className="my-reports__main">
              <strong>{r.itemTitle}</strong>
              <span className="muted small">
                {categoryLabel(r.category)} · {formatDateTime(r.createdAt)}
              </span>
              <code className="my-reports__id">{r.id}</code>
            </div>
            <span className={`status my-reports__status my-reports__status--${r.status}`}>
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
