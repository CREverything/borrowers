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

/** A moment in the viewer's time zone, e.g. "Nov 19, 6:00 PM". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function formatRelative(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatShortDate(toISODate(new Date(iso)))
}

/** Value for a datetime-local input: that day at `hour`:00 local time. */
export const localDateTimeInput = (date: ISODate, hour = 18) => `${date}T${String(hour).padStart(2, '0')}:00`

/** A datetime-local value as an ISO instant (interpreted in the viewer's time zone). */
export function localInputToISO(value: string): string | null {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/** An ISO instant as a datetime-local value in the viewer's time zone. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
