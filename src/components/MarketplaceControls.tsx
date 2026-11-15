import { ArrowUpDown, CalendarCheck } from 'lucide-react'
import {
  availabilityOptions,
  sortOptions,
  type AvailabilityFilter,
  type SortOption,
} from '../lib/marketplace'

interface MarketplaceControlsProps {
  availability: AvailabilityFilter
  sort: SortOption
  onAvailabilityChange: (value: AvailabilityFilter) => void
  onSortChange: (value: SortOption) => void
}

export default function MarketplaceControls({
  availability,
  sort,
  onAvailabilityChange,
  onSortChange,
}: MarketplaceControlsProps) {
  return (
    <div className="controls">
      <label className="select">
        <CalendarCheck size={16} aria-hidden="true" />
        <span className="sr-only">Availability</span>
        <select value={availability} onChange={(e) => onAvailabilityChange(e.target.value as AvailabilityFilter)}>
          {availabilityOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="select">
        <ArrowUpDown size={16} aria-hidden="true" />
        <span className="sr-only">Sort by</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as SortOption)}>
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
