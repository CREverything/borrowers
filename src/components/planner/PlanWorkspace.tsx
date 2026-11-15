import {
  CalendarClock,
  CircleAlert,
  CircleCheckBig,
  Circle,
  Clock,
  Coins,
  Lightbulb,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuthState } from "../../auth/AuthContext";
import { lenderNameOf } from "../../data/users";
import { useItems } from "../../hooks/useItems";
import { useOverdueLoans } from "../../hooks/useOverdue";
import { useBalance, useRequests } from "../../hooks/useRequests";
import { quoteBorrow, type BorrowQuote } from "../../lib/borrowing";
import {
  addDays,
  formatShortDate,
  localInputToISO,
  parseISODate,
  todayISO,
} from "../../lib/dates";

/** "Fri, Nov 20" in the viewer's locale. */
const formatDayLong = (iso: string) =>
  parseISODate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
import {
  complementsFor,
  coverageOf,
  isLive,
  localMoment,
  matchRequirement,
  requirementKey,
  type Coverage,
  type Importance,
  type PlanDraft,
  type PlanLink,
  type PlanRequirement,
} from "../../lib/planning";
import { paths } from "../../router";
import { eventPlanner } from "../../services/eventPlanner";
import {
  createPlan,
  submitPlanRequests,
  updatePlan,
  type PlanError,
  type PlanFields,
  type SavedPlan,
  type SubmitResult,
} from "../../services/plansApi";
import type { BorrowRequest, Item } from "../../types";
import { TimeSelect } from "../DateTimeField";
import Dropdown from "../Dropdown";
import ItemIllustration from "../ItemIllustration";
import RangeCalendar from "../RangeCalendar";
import ItemsStatus from "../ItemsStatus";
import RequestReviewDialog, { type ReviewRow } from "./RequestReviewDialog";

/** Turns the workspace into what the API stores. */
export function draftToFields(d: PlanDraft): PlanFields {
  return {
    title: d.title.trim() || "Untitled event",
    description: d.description,
    prompt: d.prompt,
    eventDate: d.eventDate || null,
    startAt: localInputToISO(localMoment(d.startDate, d.startTime)),
    returnAt: localInputToISO(localMoment(d.endDate, d.returnTime)),
    startDate: d.startDate || null,
    endDate: d.endDate || null,
    requirements: d.requirements,
  };
}

/** Same rules as the listing form: every text field has a minimum and a maximum. */
export const PLAN_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 1000 },
};

const counter = (text: string, { min, max }: { min: number; max: number }) => {
  const length = text.trim().length;
  return length < min
    ? `${length}/${max} · at least ${min}`
    : `${length}/${max}`;
};

/** Problems with the event name or description, or null. */
function detailsIssue(
  d: PlanDraft,
): { field: "title" | "description"; message: string } | null {
  if (d.title.trim().length < PLAN_LIMITS.title.min) {
    return {
      field: "title",
      message: `Give the event a name of at least ${PLAN_LIMITS.title.min} characters.`,
    };
  }
  if (d.description.trim().length < PLAN_LIMITS.description.min) {
    return {
      field: "description",
      message: `Add a description of at least ${PLAN_LIMITS.description.min} characters.`,
    };
  }
  return null;
}

/**
 * Where a checklist item stands. "Selected" means you've ticked a listing but
 * haven't sent a request; "requested" means the lender hasn't answered yet;
 * only "confirmed" means a lender has said yes.
 */
const STATE_LABEL: Record<Coverage["state"], string> = {
  confirmed: "Confirmed",
  requested: "Requested",
  selected: "Selected",
  partial: "Partly selected",
  attention: "Needs attention",
  missing: "Nothing selected",
};

const LINK_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  returned: "Returned",
  declined: "Declined",
  cancelled: "Cancelled",
};

const MATCHES_SHOWN = 4;

/**
 * The planning workspace: event details and dates, the checklist with real
 * matching listings, readiness, and saving / requesting. Statuses of sent
 * requests come from My requests (kept fresh on focus and new notifications),
 * so lender replies show up without regenerating anything.
 */
export default function PlanWorkspace({
  initial,
  saved,
  onSaved,
  onSignInNeeded,
}: {
  initial: PlanDraft;
  saved: SavedPlan | null;
  /** Called after the plan is first saved or updated. */
  onSaved: (plan: SavedPlan) => void;
  /** True if signed in; otherwise remembers the workspace and opens the login prompt. */
  onSignInNeeded: (draft: PlanDraft) => { allowed: boolean };
}) {
  const { user, getToken } = useAuthState();
  const { items, getItem, status: itemsStatus, reload } = useItems();
  const { borrowRequests } = useRequests();
  const balance = useBalance();
  // While something you borrowed is overdue, new requests are blocked (the server checks too).
  const overdue = useOverdueLoans();

  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [plan, setPlan] = useState<SavedPlan | null>(saved);
  const [dirty, setDirty] = useState(!saved);
  const [busy, setBusy] = useState<"save" | "regenerate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const update = (change: (d: PlanDraft) => PlanDraft) => {
    setDraft(change);
    setDirty(true);
    setNotice(null);
  };
  const setReqs = (change: (reqs: PlanRequirement[]) => PlanRequirement[]) =>
    update((d) => ({ ...d, requirements: change(d.requirements) }));

  // --- Dates ---------------------------------------------------------------
  const today = todayISO();
  const { startDate, endDate } = draft;
  const startTime = localInputToISO(
    localMoment(draft.startDate, draft.startTime),
  );
  const returnTime = localInputToISO(
    localMoment(draft.endDate, draft.returnTime),
  );
  const dateIssue =
    !startDate || !endDate
      ? "Choose a pick-up and return day. Availability and prices depend on it."
      : !draft.startTime || !draft.returnTime
        ? "Now choose a pick-up time and a return time."
        : !startTime || !returnTime
          ? "One of the times isn't valid."
          : Date.parse(returnTime) <= Date.parse(startTime)
            ? "The return time must be after the pick-up time."
            : Date.parse(startTime) < Date.now() - 5 * 60_000
              ? "Pick-up can't be in the past."
              : null;
  const [attempted, setAttempted] = useState(false);
  const details = detailsIssue(draft);
  const datesReady = dateIssue === null;
  const eventOutside =
    datesReady &&
    draft.eventDate &&
    (draft.eventDate < startDate || draft.eventDate > endDate);

  // --- Requests already sent from this plan (live statuses) -----------------
  const requestsById = useMemo(
    () => new Map(borrowRequests.map((r) => [r.id, r])),
    [borrowRequests],
  );
  const links: PlanLink[] = useMemo(
    () =>
      (plan?.links ?? []).map((l) => ({
        ...l,
        status: requestsById.get(l.requestId)?.status ?? l.status,
      })),
    [plan, requestsById],
  );
  const linkedItems = new Set(links.map((l) => l.itemId));
  const liveLinkFor = (itemId: number) =>
    [...links].reverse().find((l) => l.itemId === itemId);

  // --- Matching and availability --------------------------------------------
  const quotes = useMemo(() => {
    const map = new Map<number, BorrowQuote>();
    if (!datesReady) return map;
    for (const item of items)
      map.set(item.id, quoteBorrow(item, startDate, endDate, today));
    return map;
  }, [items, datesReady, startDate, endDate, today]);
  const isAvailable = (id: number) => {
    if (!getItem(id)) return false;
    return !datesReady || quotes.get(id)?.ok === true;
  };

  const rows = draft.requirements.map((req) => {
    const matches = matchRequirement(req, items, user?.id ?? null);
    // Free listings first once dates are set; the order within stays by relevance.
    const ranked = datesReady
      ? [...matches].sort(
          (a, b) => Number(quotes.get(b.id)?.ok) - Number(quotes.get(a.id)?.ok),
        )
      : matches;
    const coverage = coverageOf(req, links, isAvailable);
    // Units not yet confirmed, requested or selected.
    const short = Math.max(
      0,
      coverage.needed -
        coverage.confirmed -
        coverage.pending -
        coverage.selected,
    );
    return {
      req,
      matches: ranked,
      coverage,
      short,
      // How many real listings in the database fit this item at all. Each is one unit.
      supply: matches.length,
    };
  });

  // A listing counts once in the plan: picked for one requirement means not for another.
  const pickedFor = new Map<number, string>();
  for (const req of draft.requirements)
    for (const id of req.selected)
      if (!pickedFor.has(id)) pickedFor.set(id, req.key);
  for (const link of links)
    if (isLive(link.status) && !pickedFor.has(link.itemId))
      pickedFor.set(link.itemId, link.requirementKey);

  const toRequest: ReviewRow[] = [];
  for (const req of draft.requirements) {
    for (const id of req.selected) {
      if (linkedItems.has(id) || pickedFor.get(id) !== req.key) continue;
      const item = getItem(id);
      const quote = quotes.get(id);
      if (item && quote?.ok)
        toRequest.push({ req, item, totalSwitchies: quote.totalSwitchies });
    }
  }
  // Selected listings that can't be requested for these dates, with the reason.
  const blocked: { req: PlanRequirement; title: string; reason: string }[] = [];
  let unsent = 0;
  for (const req of draft.requirements) {
    for (const id of req.selected) {
      if (linkedItems.has(id) || pickedFor.get(id) !== req.key) continue;
      unsent++;
      const item = getItem(id);
      const quote = quotes.get(id);
      if (!item)
        blocked.push({
          req,
          title: "A listing",
          reason: "It's no longer on Borrowers.",
        });
      else if (datesReady && quote && !quote.ok)
        blocked.push({ req, title: item.title, reason: quote.error });
    }
  }
  // Days when at least one selected (not yet requested) listing is booked.
  const partialRanges = draft.requirements.flatMap((req) =>
    req.selected
      .filter((id) => !linkedItems.has(id) && pickedFor.get(id) === req.key)
      .flatMap((id) => getItem(id)?.availability.bookedRanges ?? []),
  );
  const estimated = toRequest.reduce((sum, r) => sum + r.totalSwitchies, 0);
  // Before dates are set there's no total yet, so show what the selection costs per day.
  const perDay = draft.requirements.reduce(
    (sum, req) =>
      sum +
      req.selected
        .filter((id) => !linkedItems.has(id) && pickedFor.get(id) === req.key)
        .reduce((s, id) => s + (getItem(id)?.switchiesPerDay ?? 0), 0),
    0,
  );
  const linkedRequests = links
    .map((l) => requestsById.get(l.requestId))
    .filter((r): r is BorrowRequest => Boolean(r));
  const pendingSwitchies = linkedRequests
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + r.totalSwitchies, 0);
  const committedSwitchies = linkedRequests
    .filter((r) => r.status === "approved" || r.status === "returned")
    .reduce((s, r) => s + r.totalSwitchies, 0);

  // Progress counts essential items; if everything is optional, it counts everything.
  const essentialOnly = rows.filter((r) => r.req.importance === "essential");
  const essential = essentialOnly.length > 0 ? essentialOnly : rows;
  const essentialConfirmed = essential.filter(
    (r) => r.coverage.state === "confirmed",
  ).length;
  const counts = {
    selected: rows.reduce((s, r) => s + r.coverage.selected, 0),
    pending: rows.reduce((s, r) => s + r.coverage.pending, 0),
    confirmed: rows.reduce(
      (s, r) => s + Math.min(r.coverage.confirmed, r.coverage.needed),
      0,
    ),
  };
  const shortRows = rows.filter((r) => r.short > 0);

  /** A quantity can't be more than the number of matching listings (each is one unit). */
  const capQuantity = (
    req: Pick<PlanRequirement, "name" | "keywords" | "quantity">,
  ) => {
    const supply = matchRequirement(req, items, user?.id ?? null).length;
    return supply > 0 ? Math.min(req.quantity, supply) : req.quantity;
  };
  // Once listings have loaded, bring AI quantities down to what's actually lendable.
  const capped = useRef(false);
  useEffect(() => {
    if (capped.current || items.length === 0) return;
    capped.current = true;
    setDraft((d) => {
      const requirements = d.requirements.map((r) => ({
        ...r,
        quantity: capQuantity(r),
      }));
      return requirements.some(
        (r, i) => r.quantity !== d.requirements[i].quantity,
      )
        ? { ...d, requirements }
        : d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const suggestions = complementsFor(
    draft.requirements,
    `${draft.prompt} ${draft.title}`,
  )
    .map((s) => ({
      ...s,
      available: matchRequirement(s, items, user?.id ?? null).filter(
        (i) => !datesReady || quotes.get(i.id)?.ok,
      ).length,
    }))
    // Only suggest things someone on campus actually lends.
    .filter((s) => s.available > 0)
    .slice(0, 3);

  // --- Actions ----------------------------------------------------------------
  const toggle = (reqKey: string, itemId: number) =>
    setReqs((reqs) =>
      reqs.map((r) =>
        r.key !== reqKey
          ? r
          : {
              ...r,
              selected: r.selected.includes(itemId)
                ? r.selected.filter((x) => x !== itemId)
                : [...r.selected, itemId],
            },
      ),
    );

  const addRequirement = (
    name: string,
    quantity: number,
    importance: Importance,
    keywords?: string[],
    reason = "",
  ) =>
    setReqs((reqs) => [
      ...reqs,
      {
        key: requirementKey(name, new Set(reqs.map((r) => r.key))),
        name,
        quantity: capQuantity({
          name,
          keywords: keywords ?? [name.toLowerCase()],
          quantity,
        }),
        importance,
        reason,
        keywords: keywords ?? [name.toLowerCase()],
        selected: [],
      },
    ]);

  /** Saves (creating the plan the first time). Returns the saved plan, or null. */
  const save = async (): Promise<SavedPlan | null> => {
    setAttempted(true);
    if (details) {
      setError(details.message);
      document
        .getElementById(
          details.field === "title" ? "plan-title" : "plan-description",
        )
        ?.focus();
      return null;
    }
    // Guests are asked to log in; their workspace comes back afterwards.
    if (!onSignInNeeded(draft).allowed) return null;
    setBusy("save");
    setError(null);
    try {
      const fields = draftToFields(draft);
      const result = plan
        ? await updatePlan(getToken, plan.id, fields)
        : await createPlan(getToken, fields);
      setPlan(result);
      setDirty(false);
      setNotice("Saved.");
      onSaved(result);
      return result;
    } catch (e) {
      setError((e as PlanError).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** Asks the AI again, keeping anything already picked or requested. */
  const regenerate = async () => {
    if (!draft.prompt.trim() || busy) return;
    setBusy("regenerate");
    setError(null);
    try {
      const fresh = await eventPlanner.plan(draft.prompt);
      setReqs((reqs) => {
        const keep = reqs.filter(
          (r) =>
            r.selected.length > 0 ||
            links.some((l) => l.requirementKey === r.key),
        );
        const names = new Set(keep.map((r) => r.name.toLowerCase()));
        const taken = new Set(keep.map((r) => r.key));
        const added = fresh.requirements
          .filter((r) => !names.has(r.name.toLowerCase()))
          .map((r) => {
            const key = requirementKey(r.name, taken);
            taken.add(key);
            return {
              key,
              name: r.name,
              quantity: capQuantity(r),
              importance: r.importance ?? ("essential" as const),
              reason: r.reason,
              keywords: r.keywords,
              selected: [],
            };
          });
        return [...keep, ...added];
      });
      setNotice(
        "New suggestions added. Anything you'd selected or requested was kept.",
      );
    } catch {
      setError("Couldn't get new suggestions right now.");
    } finally {
      setBusy(null);
    }
  };

  const openReview = () => {
    setError(null);
    setAttempted(true);
    if (overdue.length > 0) {
      setError(
        `${overdue[0].itemTitle || "An item you borrowed"} is overdue. Return it before requesting anything new.`,
      );
      return;
    }
    if (!datesReady) {
      setError(dateIssue ?? "Choose your borrowing days and times first.");
      document
        .getElementById("dates-title")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (toRequest.length === 0) {
      setError(
        "None of your selected listings are free on these dates. Try other dates or listings.",
      );
      return;
    }
    if (details) {
      setError(details.message);
      document
        .getElementById(
          details.field === "title" ? "plan-title" : "plan-description",
        )
        ?.focus();
      return;
    }
    if (!onSignInNeeded(draft).allowed) return;
    setReviewing(true);
  };

  /** Saves the latest changes, then sends the requests. Used by the review dialog. */
  const send = async (): Promise<SubmitResult[]> => {
    const current = dirty || !plan ? await save() : plan;
    if (!current)
      throw new Error(
        error ?? "The plan couldn't be saved, so nothing was sent.",
      );
    const { results, plan: updated } = await submitPlanRequests(
      getToken,
      current.id,
      toRequest.map((r) => ({ requirementKey: r.req.key, itemId: r.item.id })),
    );
    setPlan(updated);
    onSaved(updated);
    return results;
  };

  /** Days in the borrowing period (plus a known event date outside it, so it isn't lost). */
  const eventDayOptions: { value: string; label: string }[] = [];
  if (startDate && endDate) {
    for (
      let day = startDate;
      day <= endDate && eventDayOptions.length < 46;
      day = addDays(day, 1)
    ) {
      eventDayOptions.push({ value: day, label: formatDayLong(day) });
    }
  }
  if (
    draft.eventDate &&
    !eventDayOptions.some((o) => o.value === draft.eventDate)
  ) {
    eventDayOptions.unshift({
      value: draft.eventDate,
      label: `${formatDayLong(draft.eventDate)}${startDate && endDate ? " (outside the period)" : ""}`,
    });
  }

  /** Date guidance and warnings, shown with the time fields. */
  const dateHints = (
    <div className="workspace__date-hints">
      {draft.eventDate && !draft.startDate && !draft.endDate && (
        <button
          type="button"
          className="link-btn"
          onClick={() =>
            update((d) => ({
              ...d,
              startDate: d.eventDate,
              startTime: d.startTime || "10:00",
              endDate: addDays(d.eventDate, 1),
              returnTime: d.returnTime || "12:00",
            }))
          }
        >
          Borrow from 10am on the event day until noon the next day
        </button>
      )}
      {dateIssue && (
        <p className="workspace__hint" role="status">
          <CircleAlert size={16} aria-hidden="true" /> {dateIssue}
        </p>
      )}
      {eventOutside && (
        <p className="workspace__hint workspace__hint--warn">
          <TriangleAlert size={16} aria-hidden="true" /> The event date is
          outside the borrowing period.
        </p>
      )}
      {links.some((l) => isLive(l.status)) && (
        <p className="muted small">
          Requests you've already sent keep the dates they were sent with. New
          requests use the dates above.
        </p>
      )}
    </div>
  );

  // Matching needs the listings; without them everything would look unmatched.
  if (items.length === 0 && itemsStatus !== "ready") {
    return <ItemsStatus status={itemsStatus} onRetry={reload} />;
  }

  return (
    <div className="planner-layout">
      <div className="workspace">
        <section
          className="plan-summary workspace__details"
          aria-label="Event details"
        >
          <div className="field">
            <label className="field__label" htmlFor="plan-title">
              Event name
            </label>
            <input
              id="plan-title"
              className="workspace__title"
              value={draft.title}
              maxLength={PLAN_LIMITS.title.max}
              aria-invalid={attempted && details?.field === "title"}
              aria-describedby="plan-title-hint"
              onChange={(e) => update((d) => ({ ...d, title: e.target.value }))}
            />
            <span id="plan-title-hint" className="field__hint">
              {counter(draft.title, PLAN_LIMITS.title)}
            </span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="plan-description">
              Description
            </label>
            <textarea
              id="plan-description"
              className="workspace__description"
              rows={3}
              maxLength={PLAN_LIMITS.description.max}
              value={draft.description}
              aria-invalid={attempted && details?.field === "description"}
              aria-describedby="plan-description-hint"
              onChange={(e) =>
                update((d) => ({ ...d, description: e.target.value }))
              }
            />
            <span id="plan-description-hint" className="field__hint">
              {counter(draft.description, PLAN_LIMITS.description)}
            </span>
          </div>
          {attempted && details && (
            <p className="form-error" role="alert">
              {details.message}
            </p>
          )}
        </section>

        <section className="workspace__dates" aria-labelledby="dates-title">
          <h3 id="dates-title">
            <CalendarClock size={18} aria-hidden="true" /> When
          </h3>
          <div className="workspace__date-grid">
            <div className="workspace__calendar">
              <span className="field__label">Borrowing period</span>
              <span className="field__hint">
                Tap the pick-up day, then the return day.
              </span>
              <RangeCalendar
                label="Borrowing period"
                start={draft.startDate}
                end={draft.endDate}
                min={today}
                max={addDays(today, 365)}
                booked={[]}
                partial={partialRanges}
                partialLabel="Some selected items booked"
                maxDays={45}
                onChange={(start, end) =>
                  update((d) => ({ ...d, startDate: start, endDate: end }))
                }
              />
            </div>
            <div className="workspace__calendar workspace__date-side">
              <div className="field">
                <label className="field__label" htmlFor="plan-start-time">
                  Pick-up time
                  {draft.startDate
                    ? `, ${formatShortDate(draft.startDate)}`
                    : ""}
                </label>
                <TimeSelect
                  id="plan-start-time"
                  label="Pick-up time"
                  value={draft.startTime}
                  onChange={(t) => update((d) => ({ ...d, startTime: t }))}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="plan-return-time">
                  Return time
                  {draft.endDate ? `, ${formatShortDate(draft.endDate)}` : ""}
                </label>
                <TimeSelect
                  id="plan-return-time"
                  label="Return time"
                  value={draft.returnTime}
                  onChange={(t) => update((d) => ({ ...d, returnTime: t }))}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="plan-event-date">
                  Event date
                </label>
                {eventDayOptions.length > 0 ? (
                  <Dropdown
                    id="plan-event-date"
                    variant="field"
                    icon={CalendarClock}
                    label="Event date"
                    value={draft.eventDate}
                    options={eventDayOptions}
                    placeholder="Choose the event day"
                    onChange={(day) =>
                      update((d) => ({ ...d, eventDate: day }))
                    }
                  />
                ) : (
                  <p id="plan-event-date" className="muted small">
                    Choose your borrowing days first.
                  </p>
                )}
              </div>
              {dateHints}
            </div>
          </div>
        </section>

        <div className="workspace__list-head">
          <h3>What you need</h3>
          {draft.prompt.trim() && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy !== null}
              onClick={() => void regenerate()}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={busy === "regenerate" ? "spin" : undefined}
              />
              {busy === "regenerate" ? "Thinking..." : "Suggest again"}
            </button>
          )}
        </div>

        {rows.length === 0 && (
          <p className="matches__none muted">
            The checklist is empty. Add what you need below.
          </p>
        )}

        <ol className="checklist">
          {rows.map(({ req, matches, coverage, supply }) => {
            const hasLive = links.some(
              (l) => l.requirementKey === req.key && isLive(l.status),
            );
            const shown = expanded.has(req.key)
              ? matches
              : matches.slice(0, MATCHES_SHOWN);
            const alternatives = matches.filter(
              (m) =>
                !pickedFor.has(m.id) &&
                !linkedItems.has(m.id) &&
                isAvailable(m.id),
            ).length;
            return (
              <li
                key={req.key}
                className={`checklist__item req req--${coverage.state}`}
              >
                <div className="checklist__head">
                  {coverage.state === "confirmed" ? (
                    <CircleCheckBig
                      size={22}
                      className="checklist__mark"
                      aria-hidden="true"
                    />
                  ) : coverage.state === "attention" ? (
                    <TriangleAlert
                      size={22}
                      className="checklist__mark"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      size={22}
                      className="checklist__mark"
                      aria-hidden="true"
                    />
                  )}
                  <div className="req__info">
                    <h3>
                      {req.name}
                      <span
                        className={`tag req__importance req__importance--${req.importance}`}
                      >
                        {req.importance === "essential"
                          ? "Essential"
                          : "Optional"}
                      </span>
                    </h3>
                    {req.reason && <p className="muted">{req.reason}</p>}
                    <p className="req__status">
                      <strong>{STATE_LABEL[coverage.state]}</strong> · Need{" "}
                      {coverage.needed} items:{" "}
                      {Math.min(coverage.confirmed, coverage.needed)} confirmed
                      {coverage.pending > 0 &&
                        `, ${coverage.pending} requested and awaiting reply`}
                      {coverage.selected > 0 &&
                        `, ${coverage.selected} selected`}
                    </p>
                    {supply > 0 && supply < coverage.needed && (
                      <p className="req__supply">
                        Only {supply} matching{" "}
                        {supply === 1 ? "listing is" : "listings are"} on
                        Borrowers right now, and each listing is one unit. Lower
                        the quantity if fewer will do.
                      </p>
                    )}
                  </div>
                  <div className="req__controls">
                    <div
                      className="stepper"
                      aria-label={`How many ${req.name}`}
                    >
                      <button
                        type="button"
                        aria-label="Fewer"
                        disabled={req.quantity <= 1}
                        onClick={() =>
                          setReqs((reqs) =>
                            reqs.map((r) =>
                              r.key === req.key
                                ? { ...r, quantity: r.quantity - 1 }
                                : r,
                            ),
                          )
                        }
                      >
                        <Minus size={14} aria-hidden="true" />
                      </button>
                      <span aria-live="polite">{req.quantity}</span>
                      <button
                        type="button"
                        aria-label="More"
                        title={
                          req.quantity >= Math.max(1, supply)
                            ? `Only ${supply} matching ${supply === 1 ? "listing" : "listings"} on Borrowers`
                            : undefined
                        }
                        disabled={
                          req.quantity >= Math.min(100, Math.max(1, supply))
                        }
                        onClick={() =>
                          setReqs((reqs) =>
                            reqs.map((r) =>
                              r.key === req.key
                                ? { ...r, quantity: r.quantity + 1 }
                                : r,
                            ),
                          )
                        }
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${req.name}`}
                      title={
                        hasLive
                          ? "This has requests waiting or approved"
                          : `Remove ${req.name}`
                      }
                      disabled={hasLive}
                      onClick={() =>
                        setReqs((reqs) => reqs.filter((r) => r.key !== req.key))
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {coverage.state === "attention" && (
                  <p className="req__attention" role="status">
                    <TriangleAlert size={16} aria-hidden="true" />
                    <span>
                      <strong>
                        {coverage.problems === 1
                          ? "1 item needs attention"
                          : `${coverage.problems} items need attention`}
                      </strong>
                      <br />
                      Some items were declined or are no longer available for
                      your dates.{" "}
                      {alternatives > 0
                        ? `We found ${alternatives} alternative ${alternatives === 1 ? "listing" : "listings"} below to help complete your plan.`
                        : "No alternatives are currently available. Try adjusting your dates or checking back later."}
                    </span>
                  </p>
                )}

                {matches.length > 0 ? (
                  <ul className="matches">
                    {shown.map((item) => (
                      <MatchRow
                        key={item.id}
                        item={item}
                        quote={
                          datesReady ? (quotes.get(item.id) ?? null) : null
                        }
                        checked={
                          req.selected.includes(item.id) ||
                          links.some(
                            (l) =>
                              l.itemId === item.id &&
                              l.requirementKey === req.key,
                          )
                        }
                        link={
                          liveLinkFor(item.id)?.requirementKey === req.key
                            ? liveLinkFor(item.id)
                            : undefined
                        }
                        elsewhere={
                          pickedFor.has(item.id) &&
                          pickedFor.get(item.id) !== req.key
                            ? draft.requirements.find(
                                (r) => r.key === pickedFor.get(item.id),
                              )?.name
                            : undefined
                        }
                        onToggle={() => toggle(req.key, item.id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="matches__none muted">
                    No matching items available right now.
                  </p>
                )}
                {matches.length > MATCHES_SHOWN && (
                  <button
                    type="button"
                    className="link-btn req__more"
                    onClick={() =>
                      setExpanded((s) => {
                        const next = new Set(s);
                        if (next.has(req.key)) next.delete(req.key);
                        else next.add(req.key);
                        return next;
                      })
                    }
                  >
                    {expanded.has(req.key)
                      ? "Show fewer"
                      : `Show ${matches.length - MATCHES_SHOWN} more`}
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        {suggestions.length > 0 && (
          <div className="suggestions">
            <p className="muted small">
              <Lightbulb size={14} aria-hidden="true" /> Often useful with this:
            </p>
            <div className="examples__list">
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className="chip"
                  onClick={() =>
                    addRequirement(s.name, 1, "optional", s.keywords, s.reason)
                  }
                >
                  <Plus size={14} aria-hidden="true" /> {s.name} ({s.available}{" "}
                  available)
                </button>
              ))}
            </div>
          </div>
        )}

        <AddRequirement
          onAdd={(name, qty, importance) =>
            addRequirement(name, qty, importance)
          }
        />
      </div>

      <aside
        className="booking event-summary readiness"
        aria-label="Event readiness"
      >
        <h2>Readiness</h2>
        <div className="readiness__progress">
          <p>
            <strong>
              {essentialConfirmed} of {essential.length}
            </strong>{" "}
            essential {essential.length === 1 ? "item" : "items"} confirmed
          </p>
          <span className="readiness__bar" aria-hidden="true">
            <span
              style={{
                width: `${essential.length ? (essentialConfirmed / essential.length) * 100 : 0}%`,
              }}
            />
          </span>
        </div>

        <ul className="readiness__list">
          {rows.map(({ req, coverage }) => (
            <li key={req.key}>
              <span className="readiness__name">{req.name}</span>
              <span
                className={`status readiness__state readiness__state--${coverage.state}`}
              >
                {STATE_LABEL[coverage.state]}
              </span>
            </li>
          ))}
        </ul>

        {/* The three steps a listing goes through, in order. */}
        <ol className="readiness__steps">
          <li>
            <strong>{counts.selected}</strong>
            <span>
              <b>Selected</b> Ticked in your plan but not sent yet.
            </span>
          </li>
          <li>
            <strong>{counts.pending}</strong>
            <span>
              <b>Requested</b> Sent to the lender, waiting for their reply.
            </span>
          </li>
          <li>
            <strong>{counts.confirmed}</strong>
            <span>
              <b>Confirmed</b> The lender approved. It's booked for you.
            </span>
          </li>
        </ol>
        {shortRows.length > 0 && (
          <div className="readiness__short">
            <p className="readiness__short-title">Still to cover</p>
            <ul>
              {shortRows.map(({ req, short, supply, coverage }) => (
                <li key={req.key}>
                  <strong>{req.name}</strong>: {short} more needed
                  {supply === 0
                    ? " (no matching listings on Borrowers right now)"
                    : supply < coverage.needed
                      ? ` (only ${supply} matching ${supply === 1 ? "listing exists" : "listings exist"}; each is one unit)`
                      : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="quote">
          <div>
            <dt>Selected (estimate)</dt>
            <dd>
              <Coins size={16} aria-hidden="true" />{" "}
              {datesReady ? estimated : perDay > 0 ? `${perDay} / day` : 0}
            </dd>
          </div>
          <div>
            <dt>Requested</dt>
            <dd>{pendingSwitchies}</dd>
          </div>
          <div className="quote__total">
            <dt>Confirmed</dt>
            <dd>{committedSwitchies} Swi.</dd>
          </div>
        </dl>
        {balance !== null && estimated > balance && (
          <p className="form-error">
            Your selected listings cost {estimated} Switchies and you have{" "}
            {balance}. Requests are checked one by one, so some may not go
            through.
          </p>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="muted small" role="status">
            {notice}
          </p>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={unsent === 0 || busy !== null}
          onClick={openReview}
        >
          <Send size={16} aria-hidden="true" />
          Request selected items
          {unsent ? ` (${unsent})` : ""}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          disabled={busy !== null || (!dirty && !!plan)}
          onClick={() => void save()}
        >
          <Save size={16} aria-hidden="true" />
          {busy === "save"
            ? "Saving..."
            : plan && !dirty
              ? "Saved"
              : "Save draft"}
        </button>
        {!datesReady && toRequest.length === 0 && counts.selected === 0 && (
          <p className="muted small booking__note">
            Set your dates, then select listings to request.
          </p>
        )}
        <p className="muted small booking__note">
          Saving costs nothing. Each lender approves separately, and Switchies
          only move when if do.
          {plan && (
            <>
              {" "}
              <a className="link" href={paths.requests}>
                See requests
              </a>
            </>
          )}
        </p>
      </aside>

      {reviewing && (
        <RequestReviewDialog
          rows={toRequest}
          blocked={blocked.map((b) => ({
            title: b.title,
            forName: b.req.name,
            reason: b.reason,
          }))}
          startLocal={localMoment(draft.startDate, draft.startTime)}
          returnLocal={localMoment(draft.endDate, draft.returnTime)}
          balance={balance}
          onClose={() => setReviewing(false)}
          onSend={send}
        />
      )}
    </div>
  );
}

function MatchRow({
  item,
  quote,
  checked,
  link,
  elsewhere,
  onToggle,
}: {
  item: Item;
  quote: BorrowQuote | null;
  checked: boolean;
  link?: PlanLink;
  /** Name of the other checklist item this listing is picked for. */
  elsewhere?: string;
  onToggle: () => void;
}) {
  const unavailable = quote !== null && !quote.ok;
  // Once requested, the request status takes over; unpicking is done in My requests.
  const locked = !!link || !!elsewhere;
  return (
    <li
      className={`match${checked ? " match--selected" : ""}${unavailable ? " match--unavailable" : ""}`}
    >
      <label className="match__label">
        <input
          type="checkbox"
          checked={checked}
          disabled={locked || (unavailable && !checked)}
          onChange={onToggle}
        />
        <ItemIllustration item={item} size={24} className="match__thumb" />
        <span className="match__text">
          <strong>{item.title}</strong>
          <span className="muted">
            {item.location} · {lenderNameOf(item)}
          </span>
          {link ? (
            <span
              className={`status status--${link.status === "approved" || link.status === "returned" ? "approved" : link.status}`}
            >
              {LINK_LABEL[link.status] ?? link.status}
            </span>
          ) : elsewhere ? (
            <span className="muted small">
              Already selected for {elsewhere}
            </span>
          ) : quote === null ? (
            <span className="muted small">
              <Clock size={12} aria-hidden="true" /> Set dates to check
              availability
            </span>
          ) : quote.ok ? (
            <span className="avail avail--ok">Free on your dates</span>
          ) : (
            <span className="avail avail--off">{quote.error}</span>
          )}
        </span>
        <span className="match__price">
          {quote?.ok ? (
            <>
              <strong>{quote.totalSwitchies}</strong> Swi. total
            </>
          ) : (
            <>
              <strong>{item.switchiesPerDay}</strong> Swi. / day
            </>
          )}
        </span>
      </label>
      <a className="match__link" href={paths.item(item.id)}>
        Details
      </a>
    </li>
  );
}

function AddRequirement({
  onAdd,
}: {
  onAdd: (name: string, quantity: number, importance: Importance) => void;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [importance, setImportance] = useState<Importance>("essential");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed.slice(0, 60), quantity, importance);
    setName("");
    setQuantity(1);
  };

  return (
    <form className="add-req" onSubmit={submit}>
      <label className="field add-req__name">
        <span className="field__label">Add something else</span>
        <input
          value={name}
          maxLength={60}
          placeholder="E.g., Folding table"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field add-req__qty">
        <span className="field__label">How many</span>
        <input
          type="number"
          min={1}
          max={100}
          value={quantity}
          onChange={(e) =>
            setQuantity(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
          }
        />
      </label>
      <div className="field add-req__imp">
        <label className="field__label" htmlFor="add-req-importance">
          Needed?
        </label>
        <Dropdown
          id="add-req-importance"
          variant="field"
          label="Needed?"
          value={importance}
          options={[
            { value: "essential", label: "Essential" },
            { value: "optional", label: "Optional" },
          ]}
          onChange={setImportance}
        />
      </div>
      <button
        type="submit"
        className="btn btn--secondary"
        disabled={!name.trim()}
      >
        <Plus size={16} aria-hidden="true" /> Add
      </button>
    </form>
  );
}
