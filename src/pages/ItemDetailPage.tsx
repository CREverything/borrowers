import {
  ArrowLeft,
  CalendarDays,
  CircleCheckBig,
  Coins,
  Inbox,
  MapPin,
  Package,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuthState } from "../auth/AuthContext";
import { clearPendingIntent, peekPendingIntent } from "../auth/pendingAction";
import AvailabilityBadge from "../components/AvailabilityBadge";
import FavouriteButton from "../components/FavouriteButton";
import ItemCard from "../components/ItemCard";
import { relatedItems } from "../lib/planning";
import ItemIllustration from "../components/ItemIllustration";
import ItemReviews from "../components/ItemReviews";
import ItemsStatus from "../components/ItemsStatus";
import RangeCalendar from "../components/RangeCalendar";
import { useRequireAuth } from "../components/LoginPrompt";
import RatingInline from "../components/RatingInline";
import { getCategoryLabel } from "../data/categories";
import { lenderNameOf } from "../data/users";
import { usePublicProfile } from "../hooks/usePublicProfile";
import { Avatar } from "../components/UserMenu";
import { useItems } from "../hooks/useItems";
import { useOverdueLoans } from "../hooks/useOverdue";
import { useBalance, useRequests } from "../hooks/useRequests";
import { getAvailability, upcomingBookings } from "../lib/availability";
import { quoteBorrow } from "../lib/borrowing";
import { addDays, formatRange, todayISO } from "../lib/dates";
import { paths } from "../router";
import { createBorrowRequest, RequestError } from "../services/requestStore";
import type { BorrowRequest, Item } from "../types";
import { itemsLentLabel, memberSince } from "./UserPage";

export default function ItemDetailPage({ id }: { id: number }) {
  const { getItem, status, reload } = useItems();
  const item = getItem(id);

  if (!item && status !== "ready") {
    return (
      <div className="container page">
        <ItemsStatus status={status} onRetry={reload} />
      </div>
    );
  }

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
  const requireAuth = useRequireAuth();
  const { user, getToken } = useAuthState();
  const balance = useBalance();
  const { incoming } = useRequests();
  const isOwner = !!user && user.id === item.lenderId;
  const pendingForItem = incoming.filter(
    (r) => r.itemId === item.id && r.status === "pending",
  ).length;
  const lenderProfile = usePublicProfile(item.lenderId, item.rating?.count);
  const lender = lenderProfile.status === "ready" ? lenderProfile.profile : null;
  const lenderName = lenderNameOf(item);
  const today = todayISO();
  const availability = getAvailability(item, today);
  const bookings = upcomingBookings(item, today);

  // Dates picked before logging in come back here afterwards.
  const [restored] = useState(() =>
    peekPendingIntent("borrow", (intent) => intent.itemId === item.id),
  );
  useEffect(() => {
    if (restored) clearPendingIntent();
  }, [restored]);

  const [startDate, setStartDate] = useState(restored?.startDate ?? "");
  const [endDate, setEndDate] = useState(restored?.endDate ?? "");
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState<BorrowRequest | null>(null);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const quote = quoteBorrow(item, startDate, endDate, today);
  const showError =
    !quote.ok && (attempted || (startDate !== "" && endDate !== ""));
  const overdue = useOverdueLoans();
  const cantAfford =
    quote.ok && balance !== null && quote.totalSwitchies > balance;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (!quote.ok || cantAfford || overdue.length > 0) return;
    const allowed = requireAuth("request", {
      restore: {
        intent: { kind: "borrow", itemId: item.id, startDate, endDate },
        label: `your request for ${item.title}`,
      },
    });
    if (!allowed || !user) return;
    setSending(true);
    try {
      // The server prices the request itself and re-checks the dates.
      setSubmitted(
        await createBorrowRequest(getToken, {
          itemId: item.id,
          startDate,
          endDate,
        }),
      );
    } catch (error) {
      setServerError((error as RequestError).message);
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setSubmitted(null);
    setStartDate("");
    setEndDate("");
    setAttempted(false);
    setServerError(null);
  };

  return (
    <div className="container page">
      <a className="back-link" href={paths.browse}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to marketplace
      </a>

      <div className="detail">
        <div className="detail__main">
          <PhotoGallery item={item} />

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
                <a className="lender" href={paths.user(item.lenderId)}>
                  <Avatar name={lenderName} imageUrl={lender?.avatarUrl ?? null} size={44} />
                  <div>
                    <strong className="lender__name">{lenderName}</strong>
                    {lender ? (
                      <p className="muted">
                        Member since {memberSince(lender.memberSince)} ·{" "}
                        {itemsLentLabel(lender.itemsLent)}
                      </p>
                    ) : (
                      <p className="muted">View profile</p>
                    )}
                  </div>
                </a>
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
            <ItemReviews item={item} />
            {/* In the main column, so it lines up with the panels and reviews above. */}
            <RelatedItems item={item} />
          </div>
        </div>

        <aside className="booking" aria-label="Request to borrow">
          {isOwner ? (
            <div className="owner-panel">
              <p className="booking__price">
                <Coins size={22} aria-hidden="true" />
                <strong>{item.switchiesPerDay}</strong> Switchies / day
              </p>
              <p className="owner-panel__badge">
                <Package size={16} aria-hidden="true" />
                This is your listing
              </p>
              <dl className="quote owner-panel__stats">
                <div>
                  <dt>Pending requests</dt>
                  <dd>{pendingForItem}</dd>
                </div>
                <div>
                  <dt>Lend for up to</dt>
                  <dd>
                    {item.availability.maxBorrowDays}{" "}
                    {item.availability.maxBorrowDays === 1 ? "day" : "days"}
                  </dd>
                </div>
              </dl>
              {pendingForItem > 0 && (
                <a className="owner-panel__review" href={paths.lendingRequests}>
                  <Inbox size={16} aria-hidden="true" />
                  Review{" "}
                  {pendingForItem === 1
                    ? "request"
                    : `${pendingForItem} requests`}
                </a>
              )}
              <div className="owner-panel__actions">
                <a
                  className="btn btn--primary btn--block"
                  href={paths.editListing(item.id)}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Edit listing
                </a>
                <a
                  className="btn btn--secondary btn--block"
                  href={paths.myListings()}
                >
                  My listings
                </a>
              </div>
            </div>
          ) : submitted ? (
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
              {restored && user && (
                <p className="resume-note" role="status">
                  <RotateCcw size={16} aria-hidden="true" />
                  Welcome back. Your dates are saved, so you can send the
                  request now.
                </p>
              )}
              <p className="booking__price">
                <Coins size={22} aria-hidden="true" />
                <strong>{item.switchiesPerDay}</strong> Switchies / day
              </p>

              <RangeCalendar
                start={startDate}
                end={endDate}
                min={today}
                max={addDays(today, 365)}
                booked={item.availability.bookedRanges}
                maxDays={item.availability.maxBorrowDays}
                onChange={(start, end) => {
                  setStartDate(start);
                  setEndDate(end);
                  setServerError(null);
                }}
              />
              <p className="muted small booking__calendar-note">
                An item stays booked until its lender confirms it's been returned, so it can't be
                borrowed again before then, even on the same day.
              </p>

              {quote.ok ? (
                <dl className="quote">
                  <div>
                    <dt>
                      {item.switchiesPerDay} Swi. × {quote.days}{" "}
                      {quote.days === 1 ? "day" : "days"}
                    </dt>
                    <dd>{quote.totalSwitchies} Swi.</dd>
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
                <p className="muted small">
                  {startDate
                    ? "Now choose the last day you need it."
                    : "Choose the first day you need it."}
                </p>
              )}
              {overdue.length > 0 && (
                <p className="form-error" role="alert">
                  {overdue[0].itemTitle || "An item you borrowed"} is overdue. Return it before borrowing
                  anything new.{" "}
                  <a className="link" href={paths.borrowing("active", overdue[0].id)}>
                    See it
                  </a>
                </p>
              )}
              {cantAfford && (
                <p className="form-error" role="alert">
                  You have {balance} Switchies, so this is out of reach for now.
                </p>
              )}
              {serverError && (
                <p className="form-error" role="alert">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={sending || overdue.length > 0}
              >
                {sending ? "Sending..." : "Request to Borrow"}
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

/** Three related listings, as the same cards as the marketplace. */
function RelatedItems({ item }: { item: Item }) {
  const { items } = useItems();
  const related = relatedItems(item, items, 3);
  if (related.length === 0) return null;
  return (
    <section className="related" aria-labelledby="related-title">
      <h2 id="related-title">Related items</h2>
      <div className="related__grid">
        {related.map((other) => (
          <ItemCard key={other.id} item={other} />
        ))}
      </div>
    </section>
  );
}

/** The cover photo (or icon), with thumbnails to switch between photos. */
function PhotoGallery({ item }: { item: Item }) {
  const photos = item.images ?? [];
  const [index, setIndex] = useState(0);
  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="gallery">
      <ItemIllustration item={item} size={140} className="detail__media" photoUrl={current?.url} fit="contain">
        <FavouriteButton item={item} />
      </ItemIllustration>
      {photos.length > 1 && (
        <ul className="gallery__thumbs" aria-label="Photos">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              <button
                type="button"
                className={`gallery__thumb${i === index ? " gallery__thumb--active" : ""}`}
                aria-label={`Show photo ${i + 1} of ${photos.length}`}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
              >
                <img src={photo.url} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
