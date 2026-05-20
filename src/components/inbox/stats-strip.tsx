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
      className="flex items-center gap-1.5 text-xs font-medium text-slate-600 flex-wrap"
      aria-label="Dreamlist idea statistics"
    >
      <button
        type="button"
        onClick={() => onFilterClick('all')}
        className="text-sky-700 hover:text-sky-900 transition-colors underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
      >
        {total} {total === 1 ? 'idea' : 'ideas'}
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
