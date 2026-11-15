import {
  ArrowLeft,
  CalendarDays,
  CircleCheckBig,
  Coins,
  Heart,
  MapPin,
  Package,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import AvailabilityBadge from "../components/AvailabilityBadge";
import DateRangeFields from "../components/DateRangeFields";
import ItemIllustration from "../components/ItemIllustration";
import { useLoginPrompt } from "../components/LoginPrompt";
import RatingInline from "../components/RatingInline";
import { getCategoryLabel } from "../data/categories";
import { getItem } from "../data/items";
import { getUser } from "../data/users";
import { getAvailability, upcomingBookings } from "../lib/availability";
import { quoteBorrow } from "../lib/borrowing";
import { formatRange, todayISO } from "../lib/dates";
import { paths } from "../router";
import { createBorrowRequest } from "../services/requestStore";
import type { BorrowRequest, Item } from "../types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

export default function ItemDetailPage({ id }: { id: number }) {
  const item = getItem(id);

  if (!item) {
    return (
      <div className="container page">
        <div className="empty">
          <span className="empty__icon">
            <Package size={28} aria-hidden="true" />
          </span>
          <h3>We couldn't find that item</h3>
          <p>It may have been removed by its lender.</p>
          <a className="btn btn--secondary" href={paths.browse}>
            Back to marketplace
          </a>
        </div>
      </div>
    );
  }

  // Keyed so form state resets when moving between items.
  return <ItemDetail key={item.id} item={item} />;
}

function ItemDetail({ item }: { item: Item }) {
  const promptLogin = useLoginPrompt();
  const lender = getUser(item.lenderId);
  const lenderName = lender?.displayName ?? "the lender";
  const today = todayISO();
  const availability = getAvailability(item, today);
  const bookings = upcomingBookings(item, today);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState<BorrowRequest | null>(null);

  const quote = quoteBorrow(item, startDate, endDate, today);
  const showError =
    !quote.ok && (attempted || (startDate !== "" && endDate !== ""));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!quote.ok) return;
    setSubmitted(
      createBorrowRequest({
        item,
        startDate,
        endDate,
        days: quote.days,
        totalSwitchies: quote.totalSwitchies,
      }),
    );
  };

  const resetForm = () => {
    setSubmitted(null);
    setStartDate("");
    setEndDate("");
    setAttempted(false);
  };

  return (
    <div className="container page">
      <a className="back-link" href={paths.browse}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to marketplace
      </a>

      <div className="detail">
        <div className="detail__main">
          <ItemIllustration item={item} size={140} className="detail__media">
            <button
              className="card__save"
              aria-label="Favourite item"
              onClick={() => promptLogin("favourite")}
            >
              <Heart size={18} />
            </button>
          </ItemIllustration>

          <div className="detail__info">
            <div className="tags">
              <span className="tag">{getCategoryLabel(item.category)}</span>
              <span className="tag">Condition: {item.condition}</span>
            </div>
            <h1>{item.title}</h1>
            <div className="detail__rating">
              <RatingInline rating={item.rating} />
              {!item.rating && <span className="muted">No ratings yet</span>}
            </div>
            <p className="detail__desc">{item.description}</p>

            <div className="detail__panels">
              <div className="panel">
                <h2>Lender</h2>
                <div className="lender">
                  <span className="avatar" aria-hidden="true">
                    {initials(lenderName)}
                  </span>
                  <div>
                    <strong>{lenderName}</strong>
                    {lender && (
                      <p className="muted">
                        Lending since {lender.memberSince} · {lender.itemsLent}{" "}
                        items lent
                      </p>
                    )}
                  </div>
                </div>
                <p className="detail__location">
                  <MapPin size={16} aria-hidden="true" />
                  Pick up near {item.location}
                </p>
              </div>

              <div className="panel">
                <h2>Availability</h2>
                <AvailabilityBadge summary={availability} />
                {bookings.length > 0 ? (
                  <ul className="bookings">
                    {bookings.map((range) => (
                      <li key={range.start}>
                        <CalendarDays size={16} aria-hidden="true" />
                        Booked {formatRange(range)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No upcoming bookings.</p>
                )}
                <p className="muted">
                  Borrow for up to {item.availability.maxBorrowDays} days at a
                  time.
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside className="booking" aria-label="Request to borrow">
          {submitted ? (
            <div className="confirmation">
              <CircleCheckBig
                size={40}
                className="confirmation__icon"
                aria-hidden="true"
              />
              <h2>Request sent</h2>
              <p>
                <strong>Pending approval.</strong> {lenderName} will review your
                request for{" "}
                {formatRange({
                  start: submitted.startDate,
                  end: submitted.endDate,
                })}{" "}
                ({submitted.days} {submitted.days === 1 ? "day" : "days"},{" "}
                {submitted.totalSwitchies} switchies).
              </p>
              <p className="muted small">
                No Switchies are spent until {lenderName} approves.
              </p>
              <div className="confirmation__actions">
                <a className="btn btn--primary" href={paths.requests}>
                  View my requests
                </a>
                <button className="btn btn--secondary" onClick={resetForm}>
                  Request other dates
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <p className="booking__price">
                <Coins size={22} aria-hidden="true" />
                <strong>{item.switchiesPerDay}</strong> Switchies / day
              </p>

              <DateRangeFields
                start={startDate}
                end={endDate}
                min={today}
                onChange={(start, end) => {
                  setStartDate(start);
                  setEndDate(end);
                }}
              />

              {quote.ok ? (
                <dl className="quote">
                  <div>
                    <dt>
                      {item.switchiesPerDay} swi × {quote.days}{" "}
                      {quote.days === 1 ? "day" : "days"}
                    </dt>
                    <dd>{quote.totalSwitchies} swi</dd>
                  </div>
                  <div className="quote__total">
                    <dt>Total</dt>
                    <dd>{quote.totalSwitchies} Switchies</dd>
                  </div>
                </dl>
              ) : showError ? (
                <p className="form-error" role="alert">
                  {quote.error}
                </p>
              ) : (
                <p className="muted small">Choose dates to see the total.</p>
              )}

              <button type="submit" className="btn btn--primary btn--block">
                Request to Borrow
              </button>
              <p className="muted small booking__note">
                Nothing is charged now. Switchies move only after {lenderName}{" "}
                approves.
              </p>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
