'use client'

import { cn } from '@/lib/utils'

export type FilterValue = 'all' | 'favourites' | 'needs_review' | string

interface FilterChipsProps {
  active: FilterValue
  submitters: string[]
  onSelect: (value: FilterValue) => void
  needsReviewCount: number
}

export function FilterChips({ active, submitters, onSelect, needsReviewCount }: FilterChipsProps) {
  const chips: { value: FilterValue; label: string }[] = [
    { value: 'all',          label: 'All' },
    ...submitters.map(s => ({ value: s, label: s })),
    { value: 'favourites',   label: '★ Favourites' },
    ...(needsReviewCount > 0
      ? [{ value: 'needs_review' as FilterValue, label: `Needs review (${needsReviewCount})` }]
      : []),
  ]

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none"
      role="group"
      aria-label="Filter saved ideas"
    >
      {chips.map(chip => (
        <button
          key={chip.value}
          type="button"
          onClick={() => onSelect(chip.value)}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
            'min-h-[36px] whitespace-nowrap transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active === chip.value
              ? 'bg-sky-600 text-white border border-sky-600 shadow-sm shadow-sky-600/20'
              : 'bg-white/80 text-slate-600 border border-slate-200 hover:bg-sky-50 hover:text-sky-800',
          )}
          aria-pressed={active === chip.value}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
