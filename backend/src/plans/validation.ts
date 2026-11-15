import { RequestError } from "../requests/repository.ts";

/**
 * Checks for saved event plans. Everything from the browser is untrusted:
 * text is bounded, quantities clamped, listing ids checked as integers.
 * Owners, prices and request statuses never come from the client.
 */
export type Importance = "essential" | "optional";

export interface PlanRequirement {
  /** Stable id within the plan, used to link requests to a requirement. */
  key: string;
  name: string;
  quantity: number;
  importance: Importance;
  reason: string;
  keywords: string[];
  /** Listing ids picked for this requirement (one unit each). */
  selected: number[];
}

export interface PlanInput {
  title?: string;
  description?: string;
  prompt?: string;
  eventDate?: string | null;
  startAt?: string | null;
  returnAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  requirements?: PlanRequirement[];
}

export const MAX_REQUIREMENTS = 20;
const MAX_SELECTED = 20;

const bad = (message: string) => new RequestError(400, message);

function text(value: unknown, max: number, field: string, required = false, min = 0): string {
  if (value === undefined || value === null) {
    if (required) throw bad(`Add ${field}.`);
    return "";
  }
  if (typeof value !== "string") throw bad(`${field} isn't valid.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw bad(`Add ${field}.`);
  if (trimmed && trimmed.length < min) throw bad(`Use at least ${min} characters for ${field}.`);
  if (trimmed.length > max) throw bad(`Keep ${field} under ${max} characters.`);
  return trimmed;
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function dateOrNull(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (!isISODate(value)) throw bad(`Choose a valid ${field}.`);
  return value;
}

function timeOrNull(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw bad(`Choose a valid ${field}.`);
  return new Date(value).toISOString();
}

const DAY_MS = 86_400_000;

/** A local calendar date must match its moment, give or take a time zone. */
function assertSameDay(date: string | null, iso: string | null, field: string) {
  if (!date || !iso) return;
  const utcDay = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Math.abs(Date.parse(`${date}T00:00:00Z`) - utcDay) > DAY_MS) throw bad(`The ${field} date and time don't match.`);
}

function parseRequirement(raw: unknown, index: number): PlanRequirement {
  if (!raw || typeof raw !== "object") throw bad("A checklist item isn't valid.");
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === "string" && /^[a-z0-9-]{1,64}$/.test(r.key) ? r.key : null;
  if (!key) throw bad("A checklist item isn't valid.");
  const quantity = typeof r.quantity === "number" && Number.isInteger(r.quantity) ? r.quantity : NaN;
  if (!(quantity >= 1 && quantity <= 100)) throw bad("Quantities must be between 1 and 100.");
  const keywords = (Array.isArray(r.keywords) ? r.keywords : [])
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim().toLowerCase().slice(0, 30))
    .filter(Boolean)
    .slice(0, 6);
  const selected = Array.isArray(r.selected)
    ? [...new Set(r.selected.filter((id): id is number => Number.isInteger(id) && id > 0 && id <= 2_147_483_647))]
    : [];
  if (selected.length > MAX_SELECTED) throw bad("That's too many listings for one item.");
  return {
    key,
    name: text(r.name, 60, `a name for item ${index + 1}`, true),
    quantity,
    importance: r.importance === "optional" ? "optional" : "essential",
    reason: text(r.reason, 200, "the reason"),
    keywords,
    selected,
  };
}

/** Parses a whole plan (create) or the fields being changed (update). */
export function parsePlanInput(body: unknown, creating: boolean): PlanInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("The plan couldn't be read.");
  const b = body as Record<string, unknown>;
  const out: PlanInput = {};
  // Same limits as the planner form (and the listing form's minimum).
  if (creating || "title" in b) out.title = text(b.title, 120, "the event name", true, 3);
  if ("description" in b) out.description = text(b.description, 1000, "the description", false, 10);
  if ("prompt" in b) out.prompt = text(b.prompt, 500, "the event description");
  if ("eventDate" in b) out.eventDate = dateOrNull(b.eventDate, "event date");
  if ("startAt" in b) out.startAt = timeOrNull(b.startAt, "borrowing start");
  if ("returnAt" in b) out.returnAt = timeOrNull(b.returnAt, "return time");
  if ("startDate" in b) out.startDate = dateOrNull(b.startDate, "start date");
  if ("endDate" in b) out.endDate = dateOrNull(b.endDate, "return date");
  if (out.startAt && out.returnAt && Date.parse(out.returnAt) <= Date.parse(out.startAt)) {
    throw bad("The return time must be after the borrowing start.");
  }
  if (out.startDate && out.endDate && out.endDate < out.startDate) throw bad("The return date must be after the start date.");
  assertSameDay(out.startDate ?? null, out.startAt ?? null, "start");
  assertSameDay(out.endDate ?? null, out.returnAt ?? null, "return");
  if (creating || "requirements" in b) {
    if (!Array.isArray(b.requirements)) throw bad("The checklist couldn't be read.");
    if (b.requirements.length > MAX_REQUIREMENTS) throw bad(`A plan can have up to ${MAX_REQUIREMENTS} items.`);
    const reqs = b.requirements.map(parseRequirement);
    if (new Set(reqs.map((r) => r.key)).size !== reqs.length) throw bad("The checklist has duplicate items.");
    out.requirements = reqs;
  }
  return out;
}

export interface Selection {
  requirementKey: string;
  itemId: number;
}

export function parseSelections(body: unknown): Selection[] {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).selections : null;
  if (!Array.isArray(raw) || raw.length === 0) throw bad("Choose at least one listing to request.");
  if (raw.length > MAX_SELECTED) throw bad(`Request up to ${MAX_SELECTED} listings at a time.`);
  const seen = new Set<number>();
  const out: Selection[] = [];
  for (const entry of raw) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const itemId = e.itemId;
    const key = e.requirementKey;
    if (!Number.isInteger(itemId) || (itemId as number) <= 0 || typeof key !== "string" || !/^[a-z0-9-]{1,64}$/.test(key)) {
      throw bad("A selected listing isn't valid.");
    }
    // One request per listing, even if it was picked for two items.
    if (seen.has(itemId as number)) continue;
    seen.add(itemId as number);
    out.push({ requirementKey: key, itemId: itemId as number });
  }
  return out;
}
