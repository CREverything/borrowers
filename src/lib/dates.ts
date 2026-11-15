import type { DateRange, ISODate } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return toISODate(parseISODate(value)) === value
}

export const todayISO = (): ISODate => toISODate(new Date())

export function addDays(iso: ISODate, days: number): ISODate {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

/** Number of calendar days covered by an inclusive range. Nov 14 to Nov 15 is 2 days. */
export function daysInclusive(start: ISODate, end: ISODate): number {
  return Math.round((parseISODate(end).getTime() - parseISODate(start).getTime()) / DAY_MS) + 1
}

/** ISO strings sort chronologically, so plain comparison works. */
export const rangesOverlap = (a: DateRange, b: DateRange) => a.start <= b.end && b.start <= a.end

export function formatShortDate(iso: ISODate): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatRange({ start, end }: DateRange): string {
  return start === end ? formatShortDate(start) : `${formatShortDate(start)} – ${formatShortDate(end)}`
}
