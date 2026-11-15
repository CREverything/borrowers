import { Star } from 'lucide-react'
import type { Rating } from '../types'

export default function RatingInline({ rating }: { rating?: Rating }) {
  if (!rating) return <span className="rating rating--new">New</span>

  return (
    <span className="rating" aria-label={`Rated ${rating.average.toFixed(1)} out of 5 from ${rating.count} reviews`}>
      <Star size={14} aria-hidden="true" />
      {rating.average.toFixed(1)}
      <span className="muted">({rating.count})</span>
    </span>
  )
}
