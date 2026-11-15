import {
  ArrowLeft,
  Circle,
  CircleCheckBig,
  Coins,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import AvailabilityBadge from "../components/AvailabilityBadge";
import DateRangeFields from "../components/DateRangeFields";
import { EVENT_PLACEHOLDER } from "../components/EventPlannerBanner";
import ItemIllustration from "../components/ItemIllustration";
import { getItem, items } from "../data/items";
import { getUserName } from "../data/users";
import { getAvailability } from "../lib/availability";
import { quoteBorrow, type BorrowQuote } from "../lib/borrowing";
import { addDays, formatRange, todayISO } from "../lib/dates";
import { matchListings } from "../lib/eventMatching";
import { navigate, paths } from "../router";
import { eventPlanner } from "../services/eventPlanner";
import { createEventRequest } from "../services/requestStore";
import type { EventPlan, EventRequest, Item } from "../types";

const EXAMPLES = [
  "I'm hosting a movie night for 20 people",
  "Study group for our chem final, 6 of us",
  "Birthday party for 30 friends",
];

export default function EventPlannerPage({ query }: { query: string }) {
  const [description, setDescription] = useState(query);
  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const latestRun = useRef(0);

  // The URL holds the description, so plans survive refreshes and back navigation.
  useEffect(() => {
    setDescription(query);
    if (!query.trim()) {
      setPlan(null);
      return;
    }
    const run = ++latestRun.current;
    setLoading(true);
    eventPlanner.plan(query).then((result) => {
      if (run !== latestRun.current) return;
      setPlan(result);
      setLoading(false);
    })
      .catch(() => {
        if (run !== latestRun.current) return;
        setPlan(null);
        setLoading(false);
      });
  }, [query]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== query) navigate(paths.plan(trimmed));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(description);
  };

  return (
    <div className="container page">
      <a className="back-link" href={paths.browse}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to marketplace
      </a>

      <header className="page__head">
        <h1>Plan an event</h1>
        <p className="page__lead">
          Describe what you're planning and we'll find what you need nearby.
        </p>
      </header>

      <form className="planner-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="planner-input">
          Describe your event
        </label>
        <input
          id="planner-input"
          type="text"
          placeholder={EVENT_PLACEHOLDER}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={loading}>
          <Sparkles size={18} aria-hidden="true" />
          Find items with AI
        </button>
      </form>

      {loading && (
        <div className="planner-loading" role="status">
          <Sparkles size={22} className="pulse" aria-hidden="true" />
          Working out what you'll need...
        </div>
      )}

      {!loading && !plan && (
        <div className="examples">
          <p className="muted">Try one of these:</p>
          <div className="examples__list">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                className="chip"
                onClick={() => submit(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && plan && (
        <PlanResults
          key={`${plan.eventType}-${query}`}
          plan={plan}
          description={query}
        />
      )}
    </div>
  );
}

function PlanResults({
  plan,
  description,
}: {
  plan: EventPlan;
  description: string;
}) {
  const today = todayISO();
  const [selected, setSelected] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(addDays(today, 7));
  const [endDate, setEndDate] = useState(addDays(today, 7));
  const [submitted, setSubmitted] = useState<EventRequest | null>(null);

  const requirements = useMemo(
    () =>
      plan.requirements.map((req) => ({
        req,
        matches: matchListings(req, items),
      })),
    [plan],
  );

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const selectedItems = selected
    .map(getItem)
    .filter((item): item is Item => Boolean(item));
  const quotes = new Map<number, BorrowQuote>(
    selectedItems.map((item) => [
      item.id,
      quoteBorrow(item, startDate, endDate, today),
    ]),
  );
  const valid =
    selectedItems.length > 0 &&
    selectedItems.every((item) => quotes.get(item.id)?.ok);
  const total = selectedItems.reduce((sum, item) => {
    const quote = quotes.get(item.id);
    return sum + (quote?.ok ? quote.totalSwitchies : 0);
  }, 0);
  const lenderCount = new Set(selectedItems.map((item) => item.lenderId)).size;
  // Date problems apply to every item, so report them once instead of per item.
  const dateError =
    !startDate || !endDate ? "Choose the dates you need everything for." : null;

  const handleSubmit = () => {
    if (!valid) return;
    setSubmitted(
      createEventRequest({
        description,
        eventTitle: plan.title,
        startDate,
        endDate,
        items: selectedItems.map((item) => {
          const quote = quotes.get(item.id) as Extract<
            BorrowQuote,
            { ok: true }
          >;
          return {
            item,
            startDate,
            endDate,
            days: quote.days,
            totalSwitchies: quote.totalSwitchies,
          };
        }),
      }),
    );
  };

  return (
    <div className="planner-layout">
      <div>
        <div className="plan-summary">
          <h2>{plan.title}</h2>
          <p>{plan.summary}</p>
        </div>

        <ol className="checklist">
          {requirements.map(({ req, matches }) => {
            const covered = matches.some((m) => selected.includes(m.id));
            return (
              <li
                key={req.id}
                className={`checklist__item${covered ? " checklist__item--done" : ""}`}
              >
                <div className="checklist__head">
                  {covered ? (
                    <CircleCheckBig
                      size={22}
                      className="checklist__mark"
                      aria-label="Covered"
                    />
                  ) : (
                    <Circle
                      size={22}
                      className="checklist__mark"
                      aria-label="Not covered yet"
                    />
                  )}
                  <div>
                    <h3>
                      {req.name}
                      {req.quantity > 1 && (
                        <span className="muted">
                          {" "}
                          · about {req.quantity} needed
                        </span>
                      )}
                    </h3>
                    <p className="muted">{req.reason}</p>
                  </div>
                </div>

                {matches.length > 0 ? (
                  <ul className="matches">
                    {matches.map((item) => (
                      <MatchRow
                        key={item.id}
                        item={item}
                        checked={selected.includes(item.id)}
                        onToggle={() => toggle(item.id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="matches__none muted">
                    No one on campus is lending this yet.
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="booking event-summary" aria-label="Your event request">
        {submitted ? (
          <div className="confirmation">
            <CircleCheckBig
              size={40}
              className="confirmation__icon"
              aria-hidden="true"
            />
            <h2>Event request sent</h2>
            <p>
              {submitted.borrowRequestIds.length}{" "}
              {submitted.borrowRequestIds.length === 1 ? "item" : "items"} for{" "}
              {formatRange({
                start: submitted.startDate,
                end: submitted.endDate,
              })}{" "}
              are <strong>pending approval</strong>. Each lender approves their
              own item.
            </p>
            <p className="muted small">
              No Switchies are spent until lenders approve.
            </p>
            <div className="confirmation__actions">
              <a className="btn btn--primary" href={paths.requests}>
                View my requests
              </a>
            </div>
          </div>
        ) : (
          <>
            <h2>Your event request</h2>
            <DateRangeFields
              start={startDate}
              end={endDate}
              min={today}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />
            {dateError && <p className="form-error">{dateError}</p>}

            {selectedItems.length === 0 ? (
              <p className="muted small">
                Select listings from the checklist to add them here.
              </p>
            ) : (
              <ul className="summary-list">
                {selectedItems.map((item) => {
                  const quote = quotes.get(item.id);
                  return (
                    <li key={item.id}>
                      <div className="summary-list__text">
                        <strong>{item.title}</strong>
                        <span className="muted">
                          {getUserName(item.lenderId)}
                        </span>
                        {quote && !quote.ok && !dateError && (
                          <span className="form-error">{quote.error}</span>
                        )}
                      </div>
                      <span className="summary-list__price">
                        {quote?.ok ? `${quote.totalSwitchies} swi` : "—"}
                      </span>
                      <button
                        className="icon-btn"
                        aria-label={`Remove ${item.title}`}
                        onClick={() => toggle(item.id)}
                      >
                        <X size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <dl className="quote">
              <div>
                <dt>Lenders</dt>
                <dd>{lenderCount}</dd>
              </div>
              <div className="quote__total">
                <dt>Total</dt>
                <dd>
                  <Coins size={18} aria-hidden="true" /> {total} Switchies
                </dd>
              </div>
            </dl>

            <button
              className="btn btn--primary btn--block"
              disabled={!valid}
              onClick={handleSubmit}
            >
              Send event request
            </button>
            <p className="muted small booking__note">
              Each lender approves separately. Nothing is charged until they do.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

interface MatchRowProps {
  item: Item;
  checked: boolean;
  onToggle: () => void;
}

function MatchRow({ item, checked, onToggle }: MatchRowProps) {
  return (
    <li className={`match${checked ? " match--selected" : ""}`}>
      <label className="match__label">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <ItemIllustration item={item} size={24} className="match__thumb" />
        <span className="match__text">
          <strong>{item.title}</strong>
          <span className="muted">
            {item.location} · {getUserName(item.lenderId)}
          </span>
          <AvailabilityBadge summary={getAvailability(item)} />
        </span>
        <span className="match__price">
          <strong>{item.switchiesPerDay}</strong> swi / day
        </span>
      </label>
      <a className="match__link" href={paths.item(item.id)}>
        Details
      </a>
    </li>
  );
}
