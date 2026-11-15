import { Clock } from "lucide-react";
import { useId } from "react";
import type { ISODate } from "../types";
import Dropdown, { type DropdownOption } from "./Dropdown";
import RangeCalendar from "./RangeCalendar";

/** Every half hour, labelled in the viewer's own clock style ("6:30 PM" or "18:30"). */
const HALF_HOURS: string[] = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);

export const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

/** A time of day ("HH:MM"), picked from the app's styled dropdown. */
export function TimeSelect({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  // Keep an existing off-grid time (e.g. 6:07 PM) selectable rather than losing it.
  const times = value && !HALF_HOURS.includes(value) ? [...HALF_HOURS, value].sort() : HALF_HOURS;
  const options: DropdownOption<string>[] = times.map((t) => ({ value: t, label: timeLabel(t) }));
  return (
    <Dropdown
      id={id}
      variant="field"
      icon={Clock}
      label={label}
      value={value}
      options={options}
      placeholder="Choose a time"
      onChange={onChange}
      invalid={invalid}
    />
  );
}

/**
 * One date and a time, using the same month calendar as the item page.
 * Used wherever a single moment is chosen (return deadlines, extensions).
 */
export default function DateTimeField({
  label,
  timeLabel: timeFieldLabel = "Time",
  date,
  time,
  min,
  max,
  onChange,
}: {
  label: string;
  timeLabel?: string;
  date: ISODate;
  time: string;
  min: ISODate;
  max: ISODate;
  onChange: (date: ISODate, time: string) => void;
}) {
  const timeId = useId();
  return (
    <div className="date-time">
      <span className="field__label">{label}</span>
      <RangeCalendar
        single
        label={label}
        start={date}
        end={date}
        min={min}
        max={max}
        booked={[]}
        maxDays={1}
        onChange={(day) => onChange(day, time)}
      />
      <div className="field date-time__time">
        <label className="field__label" htmlFor={timeId}>
          {timeFieldLabel}
        </label>
        <TimeSelect id={timeId} label={timeFieldLabel} value={time} onChange={(t) => onChange(date, t)} />
      </div>
    </div>
  );
}
