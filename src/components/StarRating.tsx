import { Star } from "lucide-react";
import { useId, useState } from "react";

/** Read-only stars, e.g. ★★★★☆ for 4. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          aria-hidden="true"
          className={n <= Math.round(value) ? "stars__on" : "stars__off"}
        />
      ))}
    </span>
  );
}

/** Pick 1 to 5 stars. A radio group, so arrow keys work. */
export function StarInput({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (rating: number) => void;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const name = useId();
  const shown = hover ?? value ?? 0;
  const words = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <fieldset className="star-input" onMouseLeave={() => setHover(null)}>
      <legend className="field__label">{label}</legend>
      <div className="star-input__row">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="star-input__star"
            onMouseEnter={() => setHover(n)}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === n}
              onChange={() => onChange(n)}
            />
            <Star
              size={28}
              aria-hidden="true"
              className={n <= shown ? "stars__on" : "stars__off"}
            />
            <span className="sr-only">
              {n} {n === 1 ? "star" : "stars"}
            </span>
          </label>
        ))}
        <span className="star-input__word" aria-hidden="true">
          {words[shown]}
        </span>
      </div>
    </fieldset>
  );
}
