import { getCategoryLabel } from "../data/categories";
import { eventTemplates, fallbackTemplate } from "../data/eventTemplates";
import { items } from "../data/items";
import type { EventItemRequirement, EventPlan } from "../types";

/**
 * Turns a free-text event description into a list of things to borrow.
 * The UI only depends on this interface.
 */
export interface EventPlanner {
  plan(description: string): Promise<EventPlan>;
}

const DEFAULT_GUESTS = 10;
const PLAN_ENDPOINT = "/api/plan-event";

export function extractGuestCount(description: string): number {
  const match = description.match(
    /(\d{1,4})\s*(?:\+\s*)?(people|guests|friends|students|persons|of us)/i,
  );
  const count = match ? Number(match[1]) : NaN;
  return Number.isFinite(count) && count > 0 ? count : DEFAULT_GUESTS;
}

/** Keyword templates. Used when Gemini is unavailable. */
export const templateEventPlanner: EventPlanner = {
  async plan(description) {
    const text = description.toLowerCase();
    const template =
      eventTemplates.find((t) => t.triggers.some((trigger) => text.includes(trigger))) ??
      fallbackTemplate;
    const guestCount = extractGuestCount(description);

    return {
      eventType: template.type,
      title: `${template.title} for ${guestCount} people`,
      summary: template.summary,
      guestCount,
      source: "mock",
      requirements: template.requirements.map((r) => ({
        id: r.id,
        name: r.name,
        reason: r.reason,
        keywords: r.keywords,
        quantity: r.guestsPerUnit ? Math.max(1, Math.ceil(guestCount / r.guestsPerUnit)) : 1,
      })),
    };
  },
};

function isRequirement(value: unknown): value is EventItemRequirement {
  const r = value as EventItemRequirement;
  return (
    !!r &&
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.quantity === "number" &&
    typeof r.reason === "string" &&
    Array.isArray(r.keywords)
  );
}

function isPlan(value: unknown): value is EventPlan {
  const p = value as EventPlan;
  return (
    !!p &&
    typeof p.title === "string" &&
    typeof p.summary === "string" &&
    Array.isArray(p.requirements) &&
    p.requirements.length > 0 &&
    p.requirements.every(isRequirement)
  );
}

/**
 * Asks the server to plan with Gemini. The server holds the API key; the
 * browser only ever talks to our own endpoint.
 */
export const geminiEventPlanner: EventPlanner = {
  async plan(description) {
    // Until listings live in the database, send the catalog so Gemini can
    // name items that actually exist on the marketplace.
    const catalog = items.map((item) => ({
      title: item.title,
      category: getCategoryLabel(item.category),
    }));

    const response = await fetch(PLAN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, catalog }),
    });
    if (!response.ok) throw new Error(`Planner returned ${response.status}`);

    const plan: unknown = await response.json();
    if (!isPlan(plan)) throw new Error("Planner returned an unexpected shape");
    return plan;
  },
};

/** Gemini first, falling back to templates so planning always works. */
export const eventPlanner: EventPlanner = {
  async plan(description) {
    try {
      return await geminiEventPlanner.plan(description);
    } catch (error) {
      console.warn("Falling back to template event planning:", (error as Error).message);
      return templateEventPlanner.plan(description);
    }
  },
};
