import { CalendarDays, Inbox, LogIn, PartyPopper } from "lucide-react";
import ItemIllustration from "../components/ItemIllustration";
import { getItem } from "../data/items";
import { getUserName } from "../data/users";
import { formatRange } from "../lib/dates";
import { useRequests } from "../hooks/useRequests";
import { paths } from "../router";
import {
  cancelBorrowRequest,
  cancelEventRequest,
} from "../services/requestStore";
import type { BorrowRequest, RequestStatus } from "../types";

const statusLabels: Record<RequestStatus, string> = {
  pending: "Pending lender approval",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

function StatusPill({ status }: { status: RequestStatus }) {
  return (
    <span className={`status status--${status}`}>{statusLabels[status]}</span>
  );
}

export default function RequestsPage() {
  const { borrowRequests, eventRequests } = useRequests();
  const standalone = borrowRequests.filter((r) => !r.eventRequestId);
  const isEmpty = standalone.length === 0 && eventRequests.length === 0;

  return (
    <div className="container page page--narrow">
      <header className="page__head">
        <h1>My requests</h1>
      </header>

      <div className="notice" role="note">
        <LogIn size={20} aria-hidden="true" />
        <p>
          <strong>You need to log in to check on your requests.</strong> Once
          you're signed in, you'll see when lenders approve or decline them.
        </p>
      </div>

      {isEmpty ? (
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
      ) : (
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
                        onClick={() => cancelEventRequest(event.id)}
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
                  <RequestRow key={request.id} request={request} cancellable />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RequestRow({
  request,
  cancellable = false,
}: {
  request: BorrowRequest;
  cancellable?: boolean;
}) {
  const item = getItem(request.itemId);
  return (
    <li className="request-row">
      {item && (
        <ItemIllustration item={item} size={22} className="match__thumb" />
      )}
      <div className="request-row__text">
        {item ? (
          <a href={paths.item(item.id)}>{item.title}</a>
        ) : (
          <strong>Removed item</strong>
        )}
        <span className="muted">
          <CalendarDays size={14} aria-hidden="true" />{" "}
          {formatRange({ start: request.startDate, end: request.endDate })} ·{" "}
          {request.days} {request.days === 1 ? "day" : "days"} · from{" "}
          {getUserName(request.lenderId)}
        </span>
      </div>
      <span className="request-row__price">{request.totalSwitchies} swi</span>
      <StatusPill status={request.status} />
      {cancellable && request.status === "pending" && (
        <button
          className="btn btn--secondary btn--sm"
          onClick={() => cancelBorrowRequest(request.id)}
        >
          Cancel
        </button>
      )}
    </li>
  );
}
