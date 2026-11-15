import {
  CATEGORIES,
  CONDITIONS,
  ICON_KEYS,
  type CategoryId,
  type IconKey,
  type ItemCondition,
} from "./types.ts";

/**
 * Server-side validation for listing forms. Only the fields below are read
 * from the request body. Anything else, such as lenderId, rating or a
 * "removed" status, is ignored: ownership comes from the verified session.
 */
export const LIMITS = {
  title: 120,
  description: 1000,
  location: 80,
  switchiesPerDay: { min: 1, max: 100 },
  maxBorrowDays: { min: 1, max: 45 },
  keywords: 10,
  keywordLength: 30,
} as const;

export interface ListingInput {
  title: string;
  description: string;
  category: CategoryId;
  condition: ItemCondition;
  location: string;
  switchiesPerDay: number;
  maxBorrowDays: number;
  iconKey: IconKey;
  keywords: string[];
}

/** Owners may hide or re-show a listing; removing goes through DELETE. */
export type EditableStatus = "active" | "hidden";

export type ListingPatch = Partial<ListingInput> & { status?: EditableStatus };

export type FieldErrors = Partial<Record<keyof ListingPatch, string>>;

type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

type Check = (value: unknown) => { value?: unknown; error?: string };

const text =
  (label: string, max: number, required: boolean): Check =>
  (value) => {
    if (value === undefined || value === null) value = "";
    if (typeof value !== "string") return { error: `${label} must be text.` };
    const trimmed = value.trim();
    if (required && !trimmed) return { error: `${label} is required.` };
    if (trimmed.length > max) return { error: `${label} must be ${max} characters or fewer.` };
    return { value: trimmed };
  };

const integer =
  (label: string, { min, max }: { min: number; max: number }): Check =>
  (value) => {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isInteger(n)) return { error: `${label} must be a whole number.` };
    if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
    return { value: n };
  };

const oneOf =
  <T extends string>(label: string, list: readonly T[]): Check =>
  (value) =>
    isOneOf(list, value) ? { value } : { error: `Choose a valid ${label.toLowerCase()}.` };

const keywords: Check = (value) => {
  if (value === undefined || value === null) return { value: [] };
  const list = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(list) || list.some((k) => typeof k !== "string")) {
    return { error: "Keywords must be a list of words." };
  }
  const cleaned = [...new Set(list.map((k: string) => k.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length > LIMITS.keywords) return { error: `Use up to ${LIMITS.keywords} keywords.` };
  if (cleaned.some((k) => k.length > LIMITS.keywordLength)) {
    return { error: `Keep each keyword under ${LIMITS.keywordLength} characters.` };
  }
  return { value: cleaned };
};

const checks: Record<keyof ListingPatch, Check> = {
  title: text("Item name", LIMITS.title, true),
  description: text("Description", LIMITS.description, false),
  category: oneOf("Category", CATEGORIES),
  condition: oneOf("Condition", CONDITIONS),
  location: text("Location", LIMITS.location, true),
  switchiesPerDay: integer("Switchies per day", LIMITS.switchiesPerDay),
  maxBorrowDays: integer("Maximum borrowing days", LIMITS.maxBorrowDays),
  iconKey: oneOf("Picture", ICON_KEYS),
  keywords,
  status: oneOf("Status", ["active", "hidden"] as const),
};

const CREATE_FIELDS: (keyof ListingInput)[] = [
  "title",
  "description",
  "category",
  "condition",
  "location",
  "switchiesPerDay",
  "maxBorrowDays",
  "iconKey",
  "keywords",
];

function asObject(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Validates a new listing. Every field is checked; iconKey defaults to a generic box. */
export function parseNewListing(body: unknown): Result<ListingInput> {
  const input = asObject(body);
  if (!input) return { ok: false, errors: { title: "Send the listing as a JSON object." } };

  const value: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const field of CREATE_FIELDS) {
    const raw = field === "iconKey" && input.iconKey === undefined ? "box" : input[field];
    const result = checks[field](raw);
    if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: value as unknown as ListingInput };
}

/** Validates an edit. Only fields present in the body are checked and changed. */
export function parseListingPatch(body: unknown): Result<ListingPatch> {
  const input = asObject(body);
  if (!input) return { ok: false, errors: { title: "Send the changes as a JSON object." } };

  const value: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const field of Object.keys(checks) as (keyof ListingPatch)[]) {
    if (!(field in input)) continue;
    const result = checks[field](input[field]);
    if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }
  if (!Object.keys(errors).length && !Object.keys(value).length) {
    return { ok: false, errors: { title: "There are no changes to save." } };
  }
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: value as ListingPatch };
}
