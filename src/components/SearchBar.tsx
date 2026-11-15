import { Search } from 'lucide-react'
import type { FormEvent } from 'react'

interface SearchBarProps {
  query: string
  onQueryChange: (value: string) => void
}

export default function SearchBar({ query, onQueryChange }: SearchBarProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <form className="search" role="search" onSubmit={handleSubmit}>
      <label className="search__field">
        <Search size={20} className="search__icon" />
        <span className="sr-only">What do you need?</span>
        <input
          type="search"
          placeholder="Search textbooks, calculators, mini fridges..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      <button type="submit" className="btn btn--primary btn--lg">
        Search
      </button>
    </form>
  )
}
