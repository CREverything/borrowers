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
/** Longest name shown anywhere, in characters. Matches the backend. */
export const MAX_NAME_LENGTH = 70

/** Cuts text to `max` characters without splitting an emoji or accented letter. */
const capChars = (text: string, max: number) => Array.from(text).slice(0, max).join('').trim()

export function fullName(name: string | null | undefined): string {
  return capChars(name?.trim().replace(/\s+/g, ' ') ?? '', MAX_NAME_LENGTH)
}

/**
 * First name and last initial ("Maya R." -> "Maya R."), used everywhere
 * except profile pages. Safe to apply twice: "Maya R." stays "Maya R.".
 */
export function shortName(name: string | null | undefined): string {
  // Split the whole name (not the capped one) so a long first name can't hide the surname.
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return capChars(parts[0], MAX_NAME_LENGTH)
  const initial = Array.from(parts[parts.length - 1])[0]?.toUpperCase() ?? ''
  // Keep room for the initial so "First L." stays within the cap.
  return `${capChars(parts[0], MAX_NAME_LENGTH - 3)} ${initial}.`
}

/**
 * A class that shrinks a profile heading for long names, so up to 70
 * characters still fit in one or two lines instead of a tall wall of text.
 */
export function nameSizeClass(name: string): string {
  const length = Array.from(name).length
  const longestWord = Math.max(0, ...name.split(/\s+/).map((w) => Array.from(w).length))
  if (length > 45 || longestWord > 22) return 'profile__name profile__name--xl'
  if (length > 26 || longestWord > 14) return 'profile__name profile__name--l'
  return 'profile__name'
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
