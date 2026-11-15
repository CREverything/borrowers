import { Coins, Heart, MapPin } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { getCategoryLabel } from "../data/categories";
import { lenderNameOf } from "../data/users";
import { getAvailability } from "../lib/availability";
import { navigate, paths } from "../router";
import type { Item } from "../types";
import AvailabilityBadge from "./AvailabilityBadge";
import ItemIllustration from "./ItemIllustration";
import { useGatedPlaceholder } from "./LoginPrompt";
import RatingInline from "./RatingInline";

const stop = (e: MouseEvent) => e.stopPropagation();

export default function ItemCard({ item }: { item: Item }) {
  const gatedPlaceholder = useGatedPlaceholder();
  const availability = getAvailability(item);
  const href = paths.item(item.id);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.title]);

  return (
    <article className="card" onClick={() => navigate(href)}>
      <ItemIllustration item={item} size={64} className="card__media">
        <span className="card__category">
          {getCategoryLabel(item.category)}
        </span>
        <button
          className="card__save"
          aria-label="Favourite item"
          onClick={(e) => {
            stop(e);
            gatedPlaceholder("favourite");
          }}
        >
          <Heart size={18} />
        </button>
      </ItemIllustration>

      <div className="card__body">
        <div className="card__row">
          <h3
            ref={titleRef}
            className={`card__title${overflowing ? " card__title--fade" : ""}`}
            title={item.title}
          >
            <a href={href} onClick={stop}>
              {item.title}
            </a>
          </h3>
          <RatingInline rating={item.rating} />
        </div>

        <p className="card__meta">
          <MapPin size={14} aria-hidden="true" />
          <span className="card__meta-text">
            {item.location} · {lenderNameOf(item)}
          </span>
        </p>

        <AvailabilityBadge summary={availability} />

        <div className="card__footer">
          <p className="card__price">
            <Coins size={18} aria-hidden="true" />
            <strong>{item.switchiesPerDay}</strong>
            <span className="muted">Swi. / day</span>
          </p>
          {availability.status === "unavailable" ? (
            <button
              className="btn btn--secondary btn--sm"
              onClick={(e) => {
                stop(e);
                gatedPlaceholder("waitlist");
              }}
            >
              Waitlist
            </button>
          ) : (
            <a
              className="btn btn--secondary btn--sm"
              href={href}
              onClick={stop}
            >
              Request
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
