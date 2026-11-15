import type { AvailabilitySummary } from '../lib/availability'

export default function AvailabilityBadge({ summary }: { summary: AvailabilitySummary }) {
  return (
    <span className={`availability availability--${summary.status}`}>
      <span className="availability__dot" aria-hidden="true" />
      {summary.label}
    </span>
  )
}
