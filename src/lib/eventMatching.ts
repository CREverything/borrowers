import type { EventItemRequirement, Item } from '../types'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Finds marketplace listings that satisfy an event requirement. This stays on
 * our side even after Gemini writes the plan: the model suggests what is
 * needed, and real listings come from our own data.
 *
 * Keywords must start a word in the title, so "table" matches "Folding table"
 * but not "portable projector".
 */
export function matchListings(requirement: EventItemRequirement, items: Item[]): Item[] {
  const patterns = requirement.keywords.map((k) => new RegExp(`\\b${escapeRegExp(k)}`, 'i'))
  return items.filter((item) => patterns.some((pattern) => pattern.test(item.title)))
}
