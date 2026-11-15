import type { AvailabilityStatus, DateRange, ISODate, Item } from '../types'
import { addDays, formatShortDate, todayISO } from './dates'

/** An item booked within this many days counts as limited. */
const LIMITED_WINDOW_DAYS = 7

export interface AvailabilitySummary {
  status: AvailabilityStatus
  label: string
}

export function upcomingBookings(item: Item, today: ISODate = todayISO()): DateRange[] {
  return item.availability.bookedRanges
    .filter((range) => range.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** Derives a status from the item's mock bookings. Nothing here is live data. */
export function getAvailability(item: Item, today: ISODate = todayISO()): AvailabilitySummary {
  const upcoming = upcomingBookings(item, today)

  const current = upcoming.find((range) => range.start <= today)
  if (current) {
    return { status: 'unavailable', label: `Booked until ${formatShortDate(current.end)}` }
  }

  const soon = upcoming.find((range) => range.start <= addDays(today, LIMITED_WINDOW_DAYS))
  if (soon) {
    const lastFreeDay = addDays(soon.start, -1)
    return {
      status: 'limited',
      label: lastFreeDay === today ? 'Available today only' : `Available until ${formatShortDate(lastFreeDay)}`,
    }
  }

  return { status: 'available', label: 'Available now' }
}
