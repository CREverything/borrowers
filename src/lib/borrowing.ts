import type { ISODate, Item } from '../types'
import { daysInclusive, formatRange, isValidISODate, rangesOverlap, todayISO } from './dates'

export type BorrowQuote =
  | { ok: true; days: number; totalSwitchies: number }
  | { ok: false; error: string }

export const calculateCost = (item: Item, days: number) => item.switchiesPerDay * days

/**
 * Checks a requested borrow period against the item's mock availability and
 * prices it. The backend should repeat this check before a lender approves.
 */
export function quoteBorrow(
  item: Item,
  startDate: ISODate,
  endDate: ISODate,
  today: ISODate = todayISO(),
): BorrowQuote {
  if (!startDate || !endDate) return { ok: false, error: 'Choose a start and end date.' }
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
    return { ok: false, error: 'One of the dates is not valid.' }
  }
  if (startDate < today) return { ok: false, error: 'The start date cannot be in the past.' }
  if (endDate < startDate) return { ok: false, error: 'The end date must be on or after the start date.' }

  const days = daysInclusive(startDate, endDate)
  const { maxBorrowDays, bookedRanges } = item.availability
  if (days > maxBorrowDays) {
    return { ok: false, error: `This lender allows up to ${maxBorrowDays} days per borrow.` }
  }

  const clash = bookedRanges.find((range) => rangesOverlap(range, { start: startDate, end: endDate }))
  if (clash) {
    return { ok: false, error: `Already booked ${formatRange(clash)}. Pick dates outside that range.` }
  }

  return { ok: true, days, totalSwitchies: calculateCost(item, days) }
}
