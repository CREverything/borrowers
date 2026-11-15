import type { BorrowRequest, EventRequest, ISODate, Item } from '../types'

/**
 * Demo persistence for borrow and event requests, kept in localStorage.
 * Each exported function maps to a future backend endpoint, so swapping this
 * file for API calls should not require UI changes.
 *
 * borrowerId is the signed-in Clerk user, used only to show each person their
 * own requests in this browser. The backend must never accept it from the
 * client; it will take the user from the verified session token instead.
 */
export interface RequestState {
  borrowRequests: BorrowRequest[]
  eventRequests: EventRequest[]
}

const STORAGE_KEY = 'borrowers.requests.v1'
const empty: RequestState = { borrowRequests: [], eventRequests: [] }

function load(): RequestState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<RequestState>
    return {
      borrowRequests: Array.isArray(parsed.borrowRequests) ? parsed.borrowRequests : [],
      eventRequests: Array.isArray(parsed.eventRequests) ? parsed.eventRequests : [],
    }
  } catch {
    return empty
  }
}

let state: RequestState = load()
const listeners = new Set<() => void>()

function commit(next: RequestState) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable (private mode). The demo keeps working in memory.
  }
  listeners.forEach((listener) => listener())
}

export const getRequestState = () => state

export function subscribeToRequests(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export interface BorrowRequestInput {
  item: Item
  startDate: ISODate
  endDate: ISODate
  days: number
  totalSwitchies: number
}

function buildBorrowRequest(
  input: BorrowRequestInput,
  borrowerId: string,
  eventRequestId?: string,
): BorrowRequest {
  return {
    id: newId('br'),
    itemId: input.item.id,
    lenderId: input.item.lenderId,
    borrowerId,
    startDate: input.startDate,
    endDate: input.endDate,
    days: input.days,
    totalSwitchies: input.totalSwitchies,
    // Switchies are not deducted here. That happens after lender approval.
    status: 'pending',
    createdAt: new Date().toISOString(),
    eventRequestId,
  }
}

export function createBorrowRequest(input: BorrowRequestInput, borrowerId: string): BorrowRequest {
  const request = buildBorrowRequest(input, borrowerId)
  commit({ ...state, borrowRequests: [request, ...state.borrowRequests] })
  return request
}

export interface EventRequestInput {
  description: string
  eventTitle: string
  startDate: ISODate
  endDate: ISODate
  items: BorrowRequestInput[]
}

/** Creates one event request plus a borrow request per item, since each lender approves separately. */
export function createEventRequest(input: EventRequestInput, borrowerId: string): EventRequest {
  const eventId = newId('ev')
  const borrowRequests = input.items.map((item) => buildBorrowRequest(item, borrowerId, eventId))
  const eventRequest: EventRequest = {
    id: eventId,
    borrowerId,
    description: input.description,
    eventTitle: input.eventTitle,
    startDate: input.startDate,
    endDate: input.endDate,
    borrowRequestIds: borrowRequests.map((r) => r.id),
    totalSwitchies: borrowRequests.reduce((sum, r) => sum + r.totalSwitchies, 0),
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  commit({
    borrowRequests: [...borrowRequests, ...state.borrowRequests],
    eventRequests: [eventRequest, ...state.eventRequests],
  })
  return eventRequest
}

export function cancelBorrowRequest(id: string) {
  commit({
    ...state,
    borrowRequests: state.borrowRequests.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)),
  })
}

export function cancelEventRequest(id: string) {
  commit({
    eventRequests: state.eventRequests.map((e) => (e.id === id ? { ...e, status: 'cancelled' } : e)),
    borrowRequests: state.borrowRequests.map((r) =>
      r.eventRequestId === id ? { ...r, status: 'cancelled' } : r,
    ),
  })
}
