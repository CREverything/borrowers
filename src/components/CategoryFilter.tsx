import { categories } from '../data/categories'
import type { CategoryFilterId } from '../types'

interface CategoryFilterProps {
  active: CategoryFilterId
  onChange: (id: CategoryFilterId) => void
}

export default function CategoryFilter({ active, onChange }: CategoryFilterProps) {
  return (
    <div className="categories" role="tablist" aria-label="Filter by category">
      {categories.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          className={`chip${active === id ? ' chip--active' : ''}`}
          onClick={() => onChange(id)}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  )
}
