import { Coins, SearchX } from "lucide-react";
import CategoryFilter from "../components/CategoryFilter";
import EventPlannerBanner from "../components/EventPlannerBanner";
import ItemCard from "../components/ItemCard";
import MarketplaceControls from "../components/MarketplaceControls";
import SearchBar from "../components/SearchBar";
import { getCategoryLabel } from "../data/categories";
import { items } from "../data/items";
import {
  defaultFilters,
  filterItems,
  hasActiveFilters,
  type MarketplaceFilters,
} from "../lib/marketplace";
import { paths } from "../router";

/** Listings shown before "Show all" when no filters are active. */
const FEATURED_COUNT = 8;

interface HomePageProps {
  filters: MarketplaceFilters;
  onFiltersChange: (filters: MarketplaceFilters) => void;
  showAll: boolean;
  onShowAll: () => void;
}

export default function HomePage({
  filters,
  onFiltersChange,
  showAll,
  onShowAll,
}: HomePageProps) {
  const update = (patch: Partial<MarketplaceFilters>) =>
    onFiltersChange({ ...filters, ...patch });

  const results = filterItems(items, filters);
  const filtered = hasActiveFilters(filters);
  const truncated = !filtered && !showAll && results.length > FEATURED_COUNT;
  const visible = truncated ? results.slice(0, FEATURED_COUNT) : results;

  const heading =
    filters.category === "all"
      ? "Popular on campus"
      : getCategoryLabel(filters.category);
  const countLabel = truncated
    ? `Showing ${visible.length} of ${results.length} items`
    : `${results.length} ${results.length === 1 ? "item" : "items"}`;

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <h1>
            Lend what you have.{" "}
            <span className="hero__accent">Borrow what you need</span>.
          </h1>
          <SearchBar
            query={filters.query}
            onQueryChange={(query) => update({ query })}
          />
          <p className="hero__trust">
            <Coins size={18} aria-hidden="true" />
            Earn Switchies when you lend, spend them when you borrow.
            <a href={paths.switchies}>How does it work?</a>
          </p>
        </div>
      </section>

      <EventPlannerBanner />

      <section id="browse" className="container browse">
        <CategoryFilter
          active={filters.category}
          onChange={(category) => update({ category })}
        />

        <div className="browse__head">
          <div>
            <h2>{heading}</h2>
            <p className="browse__count muted" aria-live="polite">
              {countLabel}
            </p>
          </div>
          <MarketplaceControls
            availability={filters.availability}
            sort={filters.sort}
            onAvailabilityChange={(availability) => update({ availability })}
            onSortChange={(sort) => update({ sort })}
          />
        </div>

        {visible.length > 0 ? (
          <div className="grid">
            {visible.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <span className="empty__icon">
              <SearchX size={28} aria-hidden="true" />
            </span>
            <h3>Nothing matches yet</h3>
            <p>
              Try a different search, or someone on campus might list it soon.
            </p>
            <button
              className="btn btn--secondary"
              onClick={() =>
                onFiltersChange({ ...defaultFilters, sort: filters.sort })
              }
            >
              Clear filters
            </button>
          </div>
        )}

        {truncated && (
          <div className="browse__more">
            <button className="btn btn--secondary" onClick={onShowAll}>
              Show all {results.length} items
            </button>
          </div>
        )}
      </section>
    </>
  );
}
