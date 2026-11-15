import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { addDays, daysInclusive, parseISODate, toISODate } from "../lib/dates";
import type { DateRange, ISODate } from "../types";

interface RangeCalendarProps {
  start: ISODate;
  end: ISODate;
  onChange: (start: ISODate, end: ISODate) => void;
  /** First selectable day (usually today). */
  min: ISODate;
  /** Last selectable day. */
  max: ISODate;
  /** Dates the item is already lent out. They can't be picked or spanned. */
  booked: DateRange[];
  /** Longest range the lender allows, in days. */
  maxDays: number;
  /** Pick one day instead of a range (start and end are the same day). */
  single?: boolean;
  /**
   * Days when some (not all) of several items are booked. Shown with a
   * marker but still selectable, so the borrower can decide whether to go
   * ahead with just the free items.
   */
  partial?: DateRange[];
  /** Legend text for `partial` days. */
  partialLabel?: string;
  /** Accessible name for the day grid, e.g. "Event date". */
  label?: string;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const monthStart = (iso: ISODate) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: ISODate, n: number) => {
  const d = parseISODate(monthStart(iso));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
};
const monthLabel = (iso: ISODate) =>
  parseISODate(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const dayLabel = (iso: ISODate) =>
  parseISODate(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/**
 * A month calendar for picking a borrowing period. Pick a start day, then an
 * end day; picking the same day twice borrows for one day.
 */
export default function RangeCalendar({
  start,
  end,
  onChange,
  min,
  max,
  booked,
  maxDays,
  single = false,
  partial = [],
  partialLabel = "Some items booked",
  label = "Choose dates",
}: RangeCalendarProps) {
  const [month, setMonth] = useState(() => monthStart(start || min));
  const [focused, setFocused] = useState<ISODate>(start || min);
  const [hovered, setHovered] = useState<ISODate | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  const isBooked = useMemo(() => {
    return (day: ISODate) => booked.some((r) => r.start <= day && day <= r.end);
  }, [booked]);
  const spansBooking = (a: ISODate, b: ISODate) =>
    booked.some((r) => r.start <= b && a <= r.end);
  const selectable = (day: ISODate) => day >= min && day <= max && !isBooked(day);

  // Days shown: Monday-first weeks covering the month.
  const days = useMemo(() => {
    const first = parseISODate(month);
    const lead = (first.getDay() + 6) % 7;
    const gridStart = addDays(month, -lead);
    const nextMonth = addMonths(month, 1);
    const count = Math.ceil((lead + daysInclusive(month, addDays(nextMonth, -1))) / 7) * 7;
    return Array.from({ length: count }, (_, i) => addDays(gridStart, i));
  }, [month]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused, month]);

  const choose = (day: ISODate) => {
    if (!selectable(day)) return;
    if (single) return onChange(day, day);
    if (!start || end) return onChange(day, "");
    if (day < start || spansBooking(start, day)) return onChange(day, "");
    onChange(start, day);
  };

  // While choosing the end, preview the range under the pointer or focus.
  const previewEnd = !single && start && !end ? hovered : null;
  const rangeEnd = end || (previewEnd && previewEnd >= start && !spansBooking(start, previewEnd) ? previewEnd : "");
  const tooLong = !!start && !!rangeEnd && daysInclusive(start, rangeEnd) > maxDays;

  const onKey = (e: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: ISODate | null = null;
    if (e.key in steps) next = addDays(focused, steps[e.key]);
    else if (e.key === "PageUp") next = addMonths(focused, -1).slice(0, 8) + focused.slice(8);
    else if (e.key === "PageDown") next = addMonths(focused, 1).slice(0, 8) + focused.slice(8);
    else if (e.key === "Home") next = addDays(focused, -((parseISODate(focused).getDay() + 6) % 7));
    else if (e.key === "End") next = addDays(focused, 6 - ((parseISODate(focused).getDay() + 6) % 7));
    if (!next) return;
    e.preventDefault();
    // PageUp/Down can land on an invalid date (Feb 31); clamp to the month.
    if (toISODate(parseISODate(next)) !== next) next = addDays(addMonths(next, 1), -1);
    moveFocus.current = true;
    setFocused(next);
    setHovered(next);
    if (monthStart(next) !== month) setMonth(monthStart(next));
  };

  const canGoBack = month > monthStart(min);
  const canGoForward = month < monthStart(max);
  const focusTarget = days.includes(focused) && monthStart(focused) === month ? focused : null;

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="calendar__month" aria-live="polite">
          {monthLabel(month)}
        </h3>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next month"
          disabled={!canGoForward}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div
        className="calendar__grid"
        role="group"
        aria-label={`${label}, ${monthLabel(month)}`}
        ref={gridRef}
        onKeyDown={onKey}
        onMouseLeave={() => setHovered(null)}
      >
        {days.map((day) => {
          const outside = monthStart(day) !== month;
          const bookedDay = isBooked(day);
          const disabled = !selectable(day);
          const isStart = day === start;
          const isEnd = day === (end || "");
          const inRange = !!start && !!rangeEnd && day > start && day < rangeEnd;
          const isPreviewEnd = !end && day === rangeEnd && day !== start;
          const classes = [
            "calendar__day",
            outside && "calendar__day--outside",
            bookedDay && "calendar__day--booked",
            !bookedDay && partial.some((r) => r.start <= day && day <= r.end) && "calendar__day--partial",
            day === min && "calendar__day--today",
            (isStart || isEnd) && "calendar__day--selected",
            isStart && rangeEnd && rangeEnd !== start && "calendar__day--range-start",
            (isEnd || isPreviewEnd) && start !== day && "calendar__day--range-end",
            inRange && "calendar__day--in-range",
            isPreviewEnd && "calendar__day--preview",
            inRange && tooLong && "calendar__day--too-long",
          ]
            .filter(Boolean)
            .join(" ");
          const tabbable = focusTarget ? day === focusTarget : day === month;
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              className={classes}
              // aria-disabled (not disabled) keeps arrow-key focus moving through blocked days.
              aria-disabled={disabled}
              tabIndex={tabbable ? 0 : -1}
              aria-pressed={isStart || isEnd}
              aria-label={`${dayLabel(day)}${bookedDay ? ", already booked" : ""}${
                !bookedDay && partial.some((r) => r.start <= day && day <= r.end) ? `, ${partialLabel.toLowerCase()}` : ""
              }${
                single ? (isStart ? ", selected" : "") : `${isStart ? ", start date" : ""}${isEnd ? ", end date" : ""}`
              }`}
              onClick={() => choose(day)}
              onMouseEnter={() => setHovered(day)}
              onFocus={() => {
                setFocused(day);
                setHovered(day);
              }}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>

      {/* The legend only matters when there's a range or booked days to explain. */}
      {(!single || booked.length > 0 || partial.length > 0) && (
        <div className="calendar__legend" aria-hidden="true">
          <span>
            <i className="calendar__swatch calendar__swatch--selected" /> Your dates
          </span>
          {booked.length > 0 && (
            <span>
              <i className="calendar__swatch calendar__swatch--booked" /> Booked
            </span>
          )}
          {partial.length > 0 && (
            <span>
              <i className="calendar__swatch calendar__swatch--partial" /> {partialLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
