import type { User } from '../types'

export const users: User[] = [
  { id: 'u-maya', displayName: 'Maya R.', memberSince: 'Fall 2024', itemsLent: 41 },
  { id: 'u-jordan', displayName: 'Jordan K.', memberSince: 'Spring 2025', itemsLent: 63 },
  { id: 'u-priya', displayName: 'Priya S.', memberSince: 'Fall 2025', itemsLent: 15 },
  { id: 'u-sam', displayName: 'Sam T.', memberSince: 'Fall 2024', itemsLent: 12 },
  { id: 'u-leo', displayName: 'Leo M.', memberSince: 'Spring 2025', itemsLent: 24 },
  { id: 'u-aisha', displayName: 'Aisha B.', memberSince: 'Fall 2025', itemsLent: 26 },
  { id: 'u-chris', displayName: 'Chris D.', memberSince: 'Spring 2026', itemsLent: 17 },
  { id: 'u-nina', displayName: 'Nina W.', memberSince: 'Fall 2024', itemsLent: 46 },
  { id: 'u-omar', displayName: 'Omar F.', memberSince: 'Spring 2026', itemsLent: 39 },
]

export function getUser(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function getUserName(id: string): string {
  return getUser(id)?.displayName ?? 'A student'
}
