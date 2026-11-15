import { useSyncExternalStore } from 'react'
import { getRequestState, subscribeToRequests } from '../services/requestStore'

export function useRequests() {
  return useSyncExternalStore(subscribeToRequests, getRequestState)
}
