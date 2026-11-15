/**
 * Event planning logic with no UI and no network: matching checklist items to
 * real listings, and working out how ready each requirement is. Only type
 * imports, so it can be unit-tested directly with Node.
 *
 * Matching is deterministic. Gemini only suggests what's needed (and a few
 * synonyms as keywords); which listings exist, what they cost and whether
 * they're free always comes from our own data.
 */
import type { Item, RequestStatus } from "../types";

export type Importance = "essential" | "optional";

export interface PlanRequirement {
  key: string;
  name: string;
  quantity: number;
  importance: Importance;
  reason: string;
  keywords: string[];
  /** Listing ids picked for this requirement. Each listing is one unit. */
  selected: number[];
}

/**
 * The planning workspace's editable state. Dates are local "YYYY-MM-DD" and
 * times local "HH:MM"; an empty string means not chosen yet.
 */
export interface PlanDraft {
  title: string;
  description: string;
  prompt: string;
  eventDate: string;
  startDate: string;
  startTime: string;
  endDate: string;
  returnTime: string;
  requirements: PlanRequirement[];
}

/** "YYYY-MM-DDTHH:MM" once both parts are chosen, else "". */
export const localMoment = (date: string, time: string) => (date && time ? `${date}T${time}` : "");

export interface PlanLink {
  requirementKey: string;
  itemId: number;
  requestId: string;
  status: RequestStatus;
}

const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "of", "for", "set", "pair", "some", "extra"]);

/** Lowercase, letters only, roughly singular: "chairs" -> "chair", "batteries" -> "battery". */
export function normalizeWord(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

const words = (text: string) => text.split(/[^A-Za-z0-9]+/).map(normalizeWord).filter(Boolean);

/** The words a requirement is searched by: its keywords plus its own name. */
export function requirementTerms(req: Pick<PlanRequirement, "name" | "keywords">): string[] {
  const terms = [...req.keywords.flatMap(words), ...words(req.name)];
  return [...new Set(terms.filter((t) => t.length > 1 && !STOP_WORDS.has(t)))];
}

/**
 * How well a listing fits: 5 per term in its title, 3 per term in its own
 * keywords, 1 per term in its description. A listing must match on title or
 * keywords; a description mention alone ("comes with a chair") isn't enough.
 */
export function scoreListing(terms: string[], item: Item): number {
  const title = new Set(words(item.title));
  const keywords = new Set(item.keywords.flatMap(words));
  const description = new Set(words(item.description));
  let strong = 0;
  let weak = 0;
  for (const term of terms) {
    if (title.has(term)) strong += 5;
    else if (keywords.has(term)) strong += 3;
    else if (description.has(term)) weak += 1;
  }
  return strong > 0 ? strong + weak : 0;
}

/** Listings that fit a requirement, best first. Your own listings are left out. */
export function matchRequirement(
  req: Pick<PlanRequirement, "name" | "keywords">,
  items: Item[],
  excludeLenderId: string | null,
): Item[] {
  const terms = requirementTerms(req);
  return items
    .filter((item) => item.lenderId !== excludeLenderId && (item.status ?? "active") === "active")
    .map((item) => ({ item, score: scoreListing(terms, item) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.item.switchiesPerDay - b.item.switchiesPerDay || a.item.id - b.item.id)
    .map((m) => m.item);
}

/** A live request (waiting or agreed) for a listing. Declined or cancelled ones don't count. */
export const isLive = (status: RequestStatus) => status === "pending" || status === "approved";
/** The lender has agreed (returned loans count too: they happened). */
export const isConfirmed = (status: RequestStatus) => status === "approved" || status === "returned";

export type RequirementState = "confirmed" | "requested" | "selected" | "partial" | "attention" | "missing";

export interface Coverage {
  needed: number;
  confirmed: number;
  pending: number;
  /** Picked and available, not requested yet. */
  selected: number;
  /** Declined or cancelled requests, plus picked listings that aren't free on the dates. */
  problems: number;
  state: RequirementState;
}

/**
 * How far along a requirement is. Each listing is a single unit, so one
 * listing never covers more than one of the quantity needed, and a pick or a
 * pending request is never counted as confirmed.
 */
export function coverageOf(
  req: PlanRequirement,
  links: PlanLink[],
  isAvailable: (itemId: number) => boolean,
): Coverage {
  const mine = links.filter((l) => l.requirementKey === req.key);
  // A listing's most recent request is the one that counts.
  const latest = new Map<number, PlanLink>();
  for (const link of mine) latest.set(link.itemId, link);
  let confirmed = 0;
  let pending = 0;
  let problems = 0;
  for (const link of latest.values()) {
    if (isConfirmed(link.status)) confirmed++;
    else if (link.status === "pending") pending++;
    else problems++;
  }
  let selected = 0;
  for (const id of req.selected) {
    if (latest.has(id)) continue;
    if (isAvailable(id)) selected++;
    else problems++;
  }
  const needed = req.quantity;
  const state: RequirementState =
    confirmed >= needed
      ? "confirmed"
      : confirmed + pending >= needed
        ? "requested"
        : confirmed + pending + selected >= needed
          ? "selected"
          : problems > 0
            ? "attention"
            : confirmed + pending + selected > 0
              ? // Some units covered, not all (e.g. 1 of 2 calculators).
                "partial"
              : "missing";
  return { needed, confirmed, pending, selected, problems, state };
}

/** Things that often go with what's already on the list. Context only, never personal data. */
const COMPLEMENTS: { when: string[]; add: { name: string; keywords: string[]; reason: string }[] }[] = [
  {
    when: ["projector"],
    add: [
      { name: "Projector screen", keywords: ["screen"], reason: "A flat, bright surface for the picture." },
      { name: "Extension cable", keywords: ["extension", "cable"], reason: "Power where the projector sits." },
    ],
  },
  {
    when: ["speaker"],
    add: [
      { name: "Microphone", keywords: ["microphone", "mic"], reason: "For announcements or speeches." },
      { name: "Audio cable", keywords: ["aux", "cable"], reason: "Connects a laptop or phone to the speakers." },
    ],
  },
  {
    when: ["whiteboard"],
    add: [{ name: "Markers", keywords: ["marker"], reason: "Dry-erase markers for the board." }],
  },
  {
    when: ["outdoor", "picnic", "garden", "lawn"],
    add: [
      { name: "Lights", keywords: ["light", "lantern"], reason: "Lighting once it gets dark." },
      { name: "Chairs", keywords: ["chair"], reason: "Seating for guests." },
    ],
  },
];

/** Suggestions that fit the plan and aren't on the list already. */
export function complementsFor(
  requirements: Pick<PlanRequirement, "name" | "keywords">[],
  context: string,
): { name: string; keywords: string[]; reason: string }[] {
  const present = new Set(requirements.flatMap(requirementTerms));
  const contextWords = new Set(words(context));
  const out: { name: string; keywords: string[]; reason: string }[] = [];
  for (const rule of COMPLEMENTS) {
    if (!rule.when.some((w) => present.has(w) || contextWords.has(w))) continue;
    for (const suggestion of rule.add) {
      // Judge by what the suggestion is ("screen"), not words in its label ("Projector screen").
      if (suggestion.keywords.flatMap(words).some((t) => present.has(t))) continue;
      if (!out.some((o) => o.name === suggestion.name)) out.push(suggestion);
    }
  }
  return out;
}

/** A stable, URL-safe key for a new requirement. */
export function requirementKey(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "item";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
  return key;
}

/**
 * Listings related to `item`, best first: shared keywords (+3 each), the same
 * category (+3), shared title words (+2 each), then better rated. Only other
 * active listings. If fewer than `count` are related, it tops up with the
 * best-rated other listings so the row is never half empty.
 */
export function relatedItems(item: Item, items: Item[], count = 3): Item[] {
  const keywords = new Set(item.keywords.flatMap(words));
  const titleWords = new Set(words(item.title).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
  const candidates = items.filter((other) => other.id !== item.id && (other.status ?? "active") === "active");
  const scored = candidates.map((other) => {
    let score = 0;
    for (const k of other.keywords.flatMap(words)) if (keywords.has(k)) score += 3;
    if (other.category === item.category) score += 3;
    for (const w of words(other.title)) if (titleWords.has(w)) score += 2;
    return { other, score, rating: other.rating?.average ?? 0 };
  });
  const byRelevance = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.rating - a.rating || a.other.id - b.other.id);
  const fillers = scored
    .filter((s) => s.score === 0)
    .sort((a, b) => b.rating - a.rating || a.other.id - b.other.id);
  return [...byRelevance, ...fillers].slice(0, count).map((s) => s.other);
}
