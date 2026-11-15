import type { CategoryFilterId, Item } from '../types'
import { getAvailability } from './availability'

export type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'name'
export type AvailabilityFilter = 'any' | 'available' | 'hide-unavailable'

export interface MarketplaceFilters {
  query: string
  category: CategoryFilterId
  availability: AvailabilityFilter
  sort: SortOption
}

export const defaultFilters: MarketplaceFilters = {
  query: '',
  category: 'all',
  availability: 'any',
  sort: 'recommended',
}

export const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'name', label: 'Name: A to Z' },
]

export const availabilityOptions: { value: AvailabilityFilter; label: string }[] = [
  { value: 'any', label: 'Any availability' },
  { value: 'available', label: 'Available now' },
  { value: 'hide-unavailable', label: 'Hide unavailable' },
]

export const hasActiveFilters = (f: MarketplaceFilters) =>
  f.query.trim() !== '' || f.category !== 'all' || f.availability !== 'any'

function matchesQuery(item: Item, query: string): boolean {
  if (!query) return true
  const haystack = [item.title, item.description, ...item.keywords].join(' ').toLowerCase()
  return query.split(/\s+/).every((word) => haystack.includes(word))
}

function matchesAvailability(item: Item, filter: AvailabilityFilter): boolean {
  if (filter === 'any') return true
  const { status } = getAvailability(item)
  return filter === 'available' ? status === 'available' : status !== 'unavailable'
}

const comparators: Record<SortOption, ((a: Item, b: Item) => number) | null> = {
  recommended: null,
  'price-asc': (a, b) => a.switchiesPerDay - b.switchiesPerDay,
  'price-desc': (a, b) => b.switchiesPerDay - a.switchiesPerDay,
  // Unrated items sort last.
  rating: (a, b) => (b.rating?.average ?? -1) - (a.rating?.average ?? -1),
  name: (a, b) => a.title.localeCompare(b.title),
}

/** Client-side stand-in for a future search endpoint. */
export function filterItems(items: Item[], filters: MarketplaceFilters): Item[] {
  const query = filters.query.trim().toLowerCase()
  const result = items.filter(
    (item) =>
      (filters.category === 'all' || item.category === filters.category) &&
      matchesQuery(item, query) &&
      matchesAvailability(item, filters.availability),
  )
  const compare = comparators[filters.sort]
  return compare ? [...result].sort(compare) : result
}
