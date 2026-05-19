'use client'

import type { FilterValue } from './filter-chips'

interface StatsStripProps {
  total: number
  countries: number
  favourites: number
  onFilterClick: (filter: FilterValue) => void
}

export function StatsStrip({ total, countries, favourites, onFilterClick }: StatsStripProps) {
  if (total === 0) return null

  return (
    <div
      className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap"
      aria-label="Inbox statistics"
    >
      <button
        type="button"
        onClick={() => onFilterClick('all')}
        className="hover:text-foreground transition-colors underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
      >
        {total} {total === 1 ? 'place' : 'places'}
      </button>
      <span aria-hidden>·</span>
      <span>{countries} {countries === 1 ? 'country' : 'countries'}</span>
      {favourites > 0 && (
        <>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => onFilterClick('favourites')}
            className="hover:text-foreground transition-colors underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
          >
            {favourites} favourited
          </button>
        </>
      )}
    </div>
  )
}
