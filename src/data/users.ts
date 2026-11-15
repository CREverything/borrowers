/**
 * Names for the demo lenders behind the starter listings, used only if the
 * API hasn't sent a name. Matches backend/src/users/demoUsers.ts.
 */
const demoNames: Record<string, string> = {
  'u-maya': 'Maya R.',
  'u-jordan': 'Jordan K.',
  'u-priya': 'Priya S.',
  'u-sam': 'Sam T.',
  'u-leo': 'Leo M.',
  'u-aisha': 'Aisha B.',
  'u-chris': 'Chris D.',
  'u-nina': 'Nina W.',
  'u-omar': 'Omar F.',
}

/** The full name, tidied. Only shown on profile pages. */
export function fullName(name: string | null | undefined): string {
  return name?.trim().replace(/\s+/g, ' ') ?? ''
}

/**
 * First name and last initial ("Maya R." -> "Maya R."), used everywhere
 * except profile pages. Safe to apply twice: "Maya R." stays "Maya R.".
 */
export function shortName(name: string | null | undefined): string {
  const parts = fullName(name).split(' ').filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const initial = Array.from(parts[parts.length - 1])[0]?.toUpperCase() ?? ''
  return `${parts[0]} ${initial}.`
}

/** A first initial for avatar placeholders. */
export const initialOf = (name: string) => Array.from(fullName(name))[0]?.toUpperCase() ?? ''

/** The lender's short name: from the API, else the bundled demo name. */
export function lenderNameOf(item: { lenderId: string; lenderName?: string }): string {
  return shortName(item.lenderName) || getUserName(item.lenderId)
}

export function getUserName(id: string): string {
  return shortName(demoNames[id]) || 'A student'
}
