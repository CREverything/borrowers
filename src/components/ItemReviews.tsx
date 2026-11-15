import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { firstNameOnly } from "../data/users";
import { formatShortDate, toISODate } from "../lib/dates";
import type { Item, Review } from "../types";
import { Stars } from "./StarRating";

/** Public reviews for a listing, from borrowers who returned it. */
export default function ItemReviews({ item }: { item: Item }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/items/${item.id}/reviews`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Review[]) => active && setReviews(data))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
    // The rating changes when a review is added, so refetch then too.
  }, [item.id, item.rating?.count]);

  return (
    <section className="reviews" aria-labelledby="reviews-title">
      <div className="reviews__head">
        <h2 id="reviews-title">Reviews</h2>
        {item.rating && (
          <span className="reviews__summary">
            <Stars value={item.rating.average} />
            <strong>{item.rating.average.toFixed(1)}</strong>
            <span className="muted">({item.rating.count})</span>
          </span>
        )}
      </div>
      {failed ? (
        <p className="muted small">Reviews couldn't be loaded right now.</p>
      ) : reviews === null ? (
        <p className="muted small">Loading reviews...</p>
      ) : reviews.length === 0 ? (
        <p className="muted small">
          No written reviews yet. Borrowers can leave one after returning it.
        </p>
      ) : (
        <ul className="reviews__list">
          {reviews.map((r) => (
            <li key={r.id} className="review">
              <div className="review__top">
                <Stars value={r.rating} />
                <strong>{firstNameOnly(r.reviewerName) || "A student"}</strong>
                <span className="muted small">
                  {formatShortDate(toISODate(new Date(r.createdAt)))}
                </span>
              </div>
              {r.comment && (
                <p className="review__comment">
                  <MessageSquareText size={14} aria-hidden="true" />
                  {r.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
