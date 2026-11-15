import { Coins, ImagePlus, Map as MapIcon, MapPin, Type } from "lucide-react";
import {
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { findCampusPlace } from "../data/campusPlaces";
import { categories } from "../data/categories";
import type {
  FieldErrors,
  ListingFields,
  ListingStatus,
} from "../services/listingsApi";
import type { CategoryId, Item, ItemCondition } from "../types";
import CampusMap from "./CampusMap";
import ItemCard from "./ItemCard";
import { iconChoices } from "./ItemIllustration";

/** Same limits as the server's validation (backend/src/items/validation.ts). */
export const LIMITS = {
  /** Every text field needs at least this many characters. */
  minText: 10,
  title: 120,
  description: 1000,
  location: 80,
  switchiesPerDay: { min: 1, max: 100 },
  maxBorrowDays: { min: 1, max: 45 },
  keywords: 10,
  keywordLength: 30,
};

const CONDITIONS: ItemCondition[] = ["Like new", "Good", "Fair"];
const listingCategories = categories.filter(
  (c): c is (typeof categories)[number] & { id: CategoryId } => c.id !== "all",
);
const MAX_KEYWORDS_INPUT_LENGTH =
  LIMITS.keywords * LIMITS.keywordLength + (LIMITS.keywords - 1) * 2;

/** What the form edits. Numbers stay as text while typing. */
export interface ListingDraft {
  title: string;
  description: string;
  category: CategoryId | "";
  condition: ItemCondition | "";
  location: string;
  switchiesPerDay: string;
  maxBorrowDays: string;
  iconKey: string;
  keywords: string;
  status: ListingStatus;
}

export const emptyDraft: ListingDraft = {
  title: "",
  description: "",
  category: "",
  condition: "",
  location: "",
  switchiesPerDay: "",
  maxBorrowDays: "7",
  iconKey: "box",
  keywords: "",
  status: "active",
};

export const draftFromItem = (item: Item): ListingDraft => ({
  title: item.title,
  description: item.description,
  category: item.category,
  condition: item.condition,
  location: item.location,
  switchiesPerDay: String(item.switchiesPerDay),
  maxBorrowDays: String(item.availability.maxBorrowDays),
  iconKey: item.iconKey,
  keywords: item.keywords.join(", "),
  status: item.status === "hidden" ? "hidden" : "active",
});

/**
 * Keeps a whole-number field within its limit as the user types or pastes:
 * only digits are kept and anything over the maximum becomes the maximum.
 */
function clampWhole(text: string, max: number): string {
  // Leading whole number only, so a pasted "1.5" becomes 1, not 15.
  const digits = (text.trim().match(/^\d+/)?.[0] ?? "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 4);
  if (!digits) return "";
  return Number(digits) > max ? String(max) : digits;
}

/** Arrow keys step the value within its limits. */
function stepWhole(
  e: KeyboardEvent<HTMLInputElement>,
  value: string,
  { min, max }: { min: number; max: number },
  update: (next: string) => void,
) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const n = Number(value) || 0;
  update(
    String(Math.min(max, Math.max(min, n + (e.key === "ArrowUp" ? 1 : -1)))),
  );
}

/** "4/120 · at least 10" until the minimum is met, then just "12/120". */
function charCount(text: string, max: number) {
  const length = text.trim().length;
  return length < LIMITS.minText
    ? `${length}/${max} · at least ${LIMITS.minText}`
    : `${length}/${max}`;
}

const parseKeywords = (text: string) => [
  ...new Set(
    text
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
  ),
];

function wholeNumber(
  text: string,
  label: string,
  { min, max }: { min: number; max: number },
) {
  const n = Number(text);
  if (!text.trim() || !Number.isInteger(n))
    return `${label} must be a whole number.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/** Client-side checks, mirroring the server so most mistakes are caught early. */
export function validateDraft(draft: ListingDraft): {
  errors: FieldErrors;
  fields: ListingFields | null;
} {
  const errors: FieldErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "Give your item a name.";
  else if (title.length < LIMITS.minText)
    errors.title = `Use at least ${LIMITS.minText} characters, like "Graphing calculator".`;
  else if (title.length > LIMITS.title)
    errors.title = `Keep the name to ${LIMITS.title} characters.`;
  const description = draft.description.trim();
  if (!description) errors.description = "Describe your item.";
  else if (description.length < LIMITS.minText)
    errors.description = `Add a bit more detail (at least ${LIMITS.minText} characters).`;
  else if (description.length > LIMITS.description)
    errors.description = `Keep the description to ${LIMITS.description} characters.`;
  if (!draft.category) errors.category = "Choose a category.";
  if (!draft.condition) errors.condition = "Choose the item's condition.";
  const location = draft.location.trim();
  if (!location) errors.location = "Pick a spot on the map or type one.";
  else if (location.length < LIMITS.minText)
    errors.location = `Use at least ${LIMITS.minText} characters, like "North Hall lobby".`;
  else if (location.length > LIMITS.location)
    errors.location = `Keep the location to ${LIMITS.location} characters.`;
  const price = wholeNumber(
    draft.switchiesPerDay,
    "Switchies per day",
    LIMITS.switchiesPerDay,
  );
  if (price) errors.switchiesPerDay = price;
  const days = wholeNumber(
    draft.maxBorrowDays,
    "Maximum days",
    LIMITS.maxBorrowDays,
  );
  if (days) errors.maxBorrowDays = days;
  const keywords = parseKeywords(draft.keywords);
  if (keywords.length > LIMITS.keywords)
    errors.keywords = `Use up to ${LIMITS.keywords} keywords.`;
  else if (keywords.some((k) => k.length > LIMITS.keywordLength))
    errors.keywords = `Keep each keyword under ${LIMITS.keywordLength} characters.`;

  if (Object.keys(errors).length) return { errors, fields: null };
  return {
    errors,
    fields: {
      title,
      description: draft.description.trim(),
      category: draft.category as CategoryId,
      condition: draft.condition as ItemCondition,
      location,
      switchiesPerDay: Number(draft.switchiesPerDay),
      maxBorrowDays: Number(draft.maxBorrowDays),
      iconKey: draft.iconKey,
      keywords,
    },
  };
}

interface ListingFormProps {
  initial: ListingDraft;
  mode: "create" | "edit";
  /** Called with validated fields. Throw a ListingError to show server errors. */
  onSubmit: (fields: ListingFields, status: ListingStatus) => Promise<void>;
  onCancel: () => void;
  /** Errors from the server, keyed by field. */
  serverErrors?: FieldErrors;
  formError?: string | null;
  /** Shown above the form fields, e.g. the owner's lender name for the preview. */
  lenderName: string;
  previewId?: number;
}

export default function ListingForm({
  initial,
  mode,
  onSubmit,
  onCancel,
  serverErrors = {},
  formError,
  lenderName,
  previewId = 0,
}: ListingFormProps) {
  const [draft, setDraft] = useState(initial);
  // Start on the map unless an existing location was typed by hand.
  const [locationMode, setLocationMode] = useState<"map" | "text">(() =>
    !initial.location.trim() || findCampusPlace(initial.location) ? "map" : "text",
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const { errors: clientErrors, fields } = validateDraft(draft);
  const errors: FieldErrors = {
    ...serverErrors,
    ...(touched ? clientErrors : {}),
  };

  const set =
    <K extends keyof ListingDraft>(key: K) =>
    (value: ListingDraft[K]) =>
      setDraft((d) => ({ ...d, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!fields) {
      // Move focus to the first problem so keyboard and screen reader users find it.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(),
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit(fields, draft.status);
    } finally {
      setSaving(false);
    }
  };

  const preview: Item = {
    id: previewId,
    title: draft.title.trim() || "Your item",
    description: draft.description,
    category: (draft.category || "study") as CategoryId,
    condition: (draft.condition || "Good") as ItemCondition,
    lenderId: "preview",
    lenderName,
    location: draft.location.trim() || "Pickup spot",
    switchiesPerDay: Number(draft.switchiesPerDay) || 0,
    iconKey: draft.iconKey,
    keywords: [],
    availability: {
      bookedRanges: [],
      maxBorrowDays: Number(draft.maxBorrowDays) || 1,
    },
  };

  return (
    <form className="listing-form" onSubmit={handleSubmit} noValidate>
      <div className="listing-form__fields">
        {formError && (
          <p className="form-alert" role="alert">
            {formError}
          </p>
        )}

        <Field
          id="title"
          label="Item name"
          error={errors.title}
          hint={charCount(draft.title, LIMITS.title)}
        >
          <input
            id="title"
            type="text"
            value={draft.title}
            maxLength={LIMITS.title}
            placeholder="E.g., Graphing calculator (TI-84)"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "title-error" : undefined}
            onChange={(e) => set("title")(e.target.value)}
          />
        </Field>

        <Field
          id="description"
          label="Description"
          error={errors.description}
          hint={charCount(draft.description, LIMITS.description)}
        >
          <textarea
            id="description"
            rows={4}
            value={draft.description}
            maxLength={LIMITS.description}
            placeholder="What's included, any quirks, how to pick it up..."
            aria-invalid={!!errors.description}
            aria-describedby={
              errors.description ? "description-error" : undefined
            }
            onChange={(e) => set("description")(e.target.value)}
          />
        </Field>

        <ChoiceGroup id="category" label="Category" error={errors.category}>
          {listingCategories.map(({ id, label, icon: Icon }) => (
            <Choice
              key={id}
              name="category"
              checked={draft.category === id}
              invalid={!!errors.category}
              onChange={() => set("category")(id)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Choice>
          ))}
        </ChoiceGroup>

        <ChoiceGroup id="condition" label="Condition" error={errors.condition}>
          {CONDITIONS.map((c) => (
            <Choice
              key={c}
              name="condition"
              checked={draft.condition === c}
              invalid={!!errors.condition}
              onChange={() => set("condition")(c)}
            >
              {c}
            </Choice>
          ))}
        </ChoiceGroup>

        <fieldset
          className="form-field choice-group"
          aria-describedby={errors.location ? "location-error" : "location-hint"}
        >
          <legend className="field__label">Pickup spot</legend>
          <div className="segmented" role="group" aria-label="How to choose the pickup spot">
            <button
              type="button"
              className={locationMode === "map" ? "segmented__on" : undefined}
              aria-pressed={locationMode === "map"}
              onClick={() => setLocationMode("map")}
            >
              <MapIcon size={16} aria-hidden="true" />
              Campus map
            </button>
            <button
              type="button"
              className={locationMode === "text" ? "segmented__on" : undefined}
              aria-pressed={locationMode === "text"}
              onClick={() => setLocationMode("text")}
            >
              <Type size={16} aria-hidden="true" />
              Type a spot
            </button>
          </div>

          {locationMode === "map" ? (
            <>
              <CampusMap
                value={draft.location}
                invalid={!!errors.location}
                onChange={(name) => set("location")(name)}
              />
              <ul className="map-legend" aria-hidden="true">
                <li><i className="map-legend__road" /> Road</li>
                <li><i className="map-legend__walk" /> Walkway</li>
                <li><i className="map-legend__rail" /> Trolley</li>
                <li><i className="map-legend__green" /> Green space</li>
              </ul>
              <p className="campus-map__chosen" aria-live="polite">
                {findCampusPlace(draft.location) ? (
                  <>
                    <MapPin size={16} aria-hidden="true" />
                    Pickup at <strong>{draft.location}</strong>
                  </>
                ) : (
                  "Tap the spot closest to where you'll hand it over."
                )}
              </p>
            </>
          ) : (
            <div className="field">
              <label className="sr-only" htmlFor="location">
                Pickup spot
              </label>
              <input
                id="location"
                type="text"
                value={draft.location}
                maxLength={LIMITS.location}
                placeholder="E.g., Dirty Birds"
                aria-invalid={!!errors.location}
                onChange={(e) => set("location")(e.target.value)}
              />
            </div>
          )}

          {errors.location ? (
            <p className="form-error" id="location-error">
              {errors.location}
            </p>
          ) : (
            <p className="field__hint" id="location-hint">
              Approximate only, like a building or lobby. Never your room number.
            </p>
          )}
        </fieldset>

        <div className="listing-form__row">
          <Field
            id="switchiesPerDay"
            label="Switchies per day"
            error={errors.switchiesPerDay}
            hint={`Up to ${LIMITS.switchiesPerDay.max}`}
          >
            <div className="input-affix">
              <Coins size={18} aria-hidden="true" />
              <input
                id="switchiesPerDay"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft.switchiesPerDay}
                placeholder="E.g., 4"
                aria-invalid={!!errors.switchiesPerDay}
                aria-describedby={
                  errors.switchiesPerDay
                    ? "switchiesPerDay-error"
                    : "switchiesPerDay-hint"
                }
                onChange={(e) =>
                  set("switchiesPerDay")(
                    clampWhole(e.target.value, LIMITS.switchiesPerDay.max),
                  )
                }
                onKeyDown={(e) =>
                  stepWhole(
                    e,
                    draft.switchiesPerDay,
                    LIMITS.switchiesPerDay,
                    set("switchiesPerDay"),
                  )
                }
              />
            </div>
          </Field>
          <Field
            id="maxBorrowDays"
            label="Lend for up to"
            error={errors.maxBorrowDays}
            hint={`Up to ${LIMITS.maxBorrowDays.max} days`}
          >
            <div className="input-affix input-affix--end">
              <input
                id="maxBorrowDays"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft.maxBorrowDays}
                aria-invalid={!!errors.maxBorrowDays}
                aria-describedby={
                  errors.maxBorrowDays
                    ? "maxBorrowDays-error"
                    : "maxBorrowDays-hint"
                }
                onChange={(e) =>
                  set("maxBorrowDays")(
                    clampWhole(e.target.value, LIMITS.maxBorrowDays.max),
                  )
                }
                onKeyDown={(e) =>
                  stepWhole(
                    e,
                    draft.maxBorrowDays,
                    LIMITS.maxBorrowDays,
                    set("maxBorrowDays"),
                  )
                }
              />
              <span>days</span>
            </div>
          </Field>
        </div>

        <ChoiceGroup id="iconKey" label="Picture" bare>
          <p className="photo-note">
            <ImagePlus size={18} aria-hidden="true" />
            Photo uploads are coming soon. For now, pick the icon that fits your
            item best.
          </p>
          <div className="icon-picker">
            {iconChoices.map(({ key, label, icon: Icon }) => (
              <label key={key} className="icon-picker__option" title={label}>
                <input
                  type="radio"
                  name="iconKey"
                  className="sr-only"
                  checked={draft.iconKey === key}
                  onChange={() => set("iconKey")(key)}
                />
                <Icon size={22} aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </label>
            ))}
          </div>
        </ChoiceGroup>

        <Field
          id="keywords"
          label="Keywords"
          optional
          error={errors.keywords}
          hint="Separate with commas. Helps people (and the event planner) find your item."
        >
          <input
            id="keywords"
            type="text"
            value={draft.keywords}
            maxLength={MAX_KEYWORDS_INPUT_LENGTH}
            placeholder="E.g., math, calculator, ti-84"
            aria-invalid={!!errors.keywords}
            aria-describedby={
              errors.keywords ? "keywords-error" : "keywords-hint"
            }
            onChange={(e) => set("keywords")(e.target.value)}
          />
        </Field>

        {mode === "edit" && (
          <ChoiceGroup id="status" label="Visibility" error={errors.status}>
            <Choice
              name="status"
              checked={draft.status === "active"}
              onChange={() => set("status")("active")}
            >
              Show in marketplace
            </Choice>
            <Choice
              name="status"
              checked={draft.status === "hidden"}
              onChange={() => set("status")("hidden")}
            >
              Hidden
            </Choice>
          </ChoiceGroup>
        )}

        <div className="listing-form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving
              ? "Saving..."
              : mode === "create"
                ? "Publish listing"
                : "Save changes"}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>

      <aside className="listing-form__preview" aria-label="Preview">
        <p className="field__label">Preview</p>
        <div
          className="listing-preview"
          aria-hidden="true"
          // Display only: inert keeps the card's links and buttons out of reach.
          ref={(el) => el?.setAttribute("inert", "")}
        >
          <ItemCard item={preview} />
        </div>
        <p className="muted small">
          This is how your listing will look in the marketplace.
        </p>
      </aside>
    </form>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field form-field">
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <span className="field__optional"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p className="form-error" id={`${id}-error`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function ChoiceGroup({
  id,
  label,
  error,
  bare,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  /** Render children as-is instead of in a row of chips. */
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset
      className="form-field choice-group"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="field__label">{label}</legend>
      {bare ? (
        children
      ) : (
        <div className="choice-group__options">{children}</div>
      )}
      {error && (
        <p className="form-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Choice({
  name,
  checked,
  invalid,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  invalid?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className={`chip choice${checked ? " chip--active" : ""}`}>
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        aria-invalid={invalid}
        onChange={onChange}
      />
      {children}
    </label>
  );
}
