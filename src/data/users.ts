import type { User } from '../types'

export const users: User[] = [
  { id: 'u-maya', displayName: 'Maya', memberSince: 'Fall 2024', itemsLent: 41 },
  { id: 'u-jordan', displayName: 'Jordan', memberSince: 'Spring 2025', itemsLent: 63 },
  { id: 'u-priya', displayName: 'Priya', memberSince: 'Fall 2025', itemsLent: 15 },
  { id: 'u-sam', displayName: 'Sam', memberSince: 'Fall 2024', itemsLent: 12 },
  { id: 'u-leo', displayName: 'Leo', memberSince: 'Spring 2025', itemsLent: 24 },
  { id: 'u-aisha', displayName: 'Aisha', memberSince: 'Fall 2025', itemsLent: 26 },
  { id: 'u-chris', displayName: 'Chris', memberSince: 'Spring 2026', itemsLent: 17 },
  { id: 'u-nina', displayName: 'Nina', memberSince: 'Fall 2024', itemsLent: 46 },
  { id: 'u-omar', displayName: 'Omar', memberSince: 'Spring 2026', itemsLent: 39 },
]

export function firstNameOnly(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? ''
}

export function getUser(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

/** The lender's name: their profile name from the API, else the bundled demo name. */
export function lenderNameOf(item: { lenderId: string; lenderName?: string }): string {
  return firstNameOnly(item.lenderName) || getUserName(item.lenderId)
}

export function getUserName(id: string): string {
  return firstNameOnly(getUser(id)?.displayName) || 'A student'
}
