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

/** An account's public profile, from GET /api/users/:id. */
export interface PublicProfile {
  id: string
  /** Full name. Only profile pages show it; elsewhere use shortName(). */
  name: string
  avatarUrl: string | null
  memberSince: string
  /** Times they've lent something out (approved or returned requests). */
  itemsLent: number
  lenderRating: Rating | null
  borrowerScore: Rating | null
  listings: Item[]
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

/** active: in the marketplace. hidden: only the owner sees it. removed: soft-deleted. */
export type ItemStatus = 'active' | 'hidden' | 'removed'

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
  /** The lender's profile name from the API. Empty or missing for unnamed profiles. */
  lenderName?: string
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
  /** Hosted photo URL. Uploads aren't available yet, so this is always null for now. */
  imageUrl?: string | null
  status?: ItemStatus
  createdAt?: string
}

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'returned'

export interface BorrowRequest {
  id: string
  itemId: number
  /** Item title when the request was loaded, in case the listing is gone. */
  itemTitle?: string
  lenderName?: string
  borrowerName?: string
  lenderId: string
  borrowerId: string
  startDate: ISODate
  endDate: ISODate
  days: number
  totalSwitchies: number
  status: RequestStatus
  createdAt: string
  /** When the lender approved or declined. */
  decidedAt?: string | null
  /** When the lender wants it back (ISO time). Set on approval. */
  returnDueAt?: string | null
  /** When the lender confirmed it came back. */
  returnedAt?: string | null
  /** The lender's 1-5 score for the borrower on this request. */
  borrowerRating?: number | null
  borrowerRatingComment?: string | null
  /** Whether the borrower has already reviewed this listing (one per listing). */
  reviewed?: boolean
  /** The borrower's average score from lenders. */
  borrowerScore?: { average: number; count: number } | null
  /** Set when the request was created as part of an event request. */
  eventRequestId?: string
}

export type NotificationKind =
  | 'message_received'
  | 'request_received'
  | 'request_cancelled'
  | 'request_approved'
  | 'request_declined'
  | 'return_time_changed'
  | 'item_returned'
  | 'borrower_rated'
  | 'review_received'

/** Stores facts; the UI phrases them in the reader's time zone. */
export interface AppNotification {
  id: string
  kind: NotificationKind
  role: 'borrower' | 'lender'
  data: {
    conversationId?: string
    messageId?: string
    senderName?: string
    preview?: string
    itemTitle?: string
    borrowerName?: string
    lenderName?: string
    startDate?: ISODate
    endDate?: ISODate
    totalSwitchies?: number
    returnDueAt?: string | null
    returnedAt?: string | null
    rating?: number | null
    eventTitle?: string
  }
  requestId: string | null
  itemId: number | null
  read: boolean
  createdAt: string
}

export interface Review {
  id: string
  rating: number
  comment: string
  reviewerId?: string
  reviewerName: string
  createdAt: string
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
