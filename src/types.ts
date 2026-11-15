/**
 * Shared domain types. These mirror the shape the future Node.js backend
 * (backed by TigerData PostgreSQL) is expected to return, so mock data and
 * real API responses can be swapped without touching UI components.
 */

/** ISO calendar date, `YYYY-MM-DD`, interpreted in the viewer's local time zone. */
export type ISODate = string

export type CategoryId =
  | 'textbooks'
  | 'study'
  | 'tech'
  | 'dorm'
  | 'kitchen'
  | 'clothing'
  | 'events'
  | 'rec'

export type CategoryFilterId = CategoryId | 'all'

export interface User {
  id: string
  displayName: string
  memberSince: string
  itemsLent: number
}

/** Inclusive date range. */
export interface DateRange {
  start: ISODate
  end: ISODate
}

export interface Availability {
  /** Dates the item is already lent out. Mock data until the backend exists. */
  bookedRanges: DateRange[]
  /** Longest single borrow the lender allows. */
  maxBorrowDays: number
}

export type AvailabilityStatus = 'available' | 'limited' | 'unavailable'

export type ItemCondition = 'Like new' | 'Good' | 'Fair'

export interface Rating {
  average: number
  count: number
}

export interface Item {
  id: number
  title: string
  description: string
  category: CategoryId
  condition: ItemCondition
  lenderId: string
  /** Approximate campus spot, never an exact address. */
  location: string
  switchiesPerDay: number
  /** Missing when the item has never been borrowed. */
  rating?: Rating
  /** Key into the UI icon map, so item data stays free of React components. */
  iconKey: string
  /** Extra search terms, also used to match event planning suggestions. */
  keywords: string[]
  availability: Availability
}

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled'

export interface BorrowRequest {
  id: string
  itemId: number
  lenderId: string
  borrowerId: string
  startDate: ISODate
  endDate: ISODate
  days: number
  totalSwitchies: number
  status: RequestStatus
  createdAt: string
  /** Set when the request was created as part of an event request. */
  eventRequestId?: string
}

export interface EventItemRequirement {
  id: string
  name: string
  quantity: number
  reason: string
  /** Terms used to find matching marketplace listings. */
  keywords: string[]
}

export interface EventPlan {
  eventType: string
  title: string
  summary: string
  guestCount: number
  requirements: EventItemRequirement[]
  /** Where the plan came from. Only `mock` exists today. */
  source: 'mock' | 'gemini'
}

export interface EventRequest {
  id: string
  borrowerId: string
  description: string
  eventTitle: string
  startDate: ISODate
  endDate: ISODate
  borrowRequestIds: string[]
  totalSwitchies: number
  status: RequestStatus
  createdAt: string
}
