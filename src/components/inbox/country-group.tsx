'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { countryFlag } from '@/lib/country-flag'
import { PlaceCard } from './place-card'
import type { ReelSubmission, Trip } from '@/lib/types'

const NUDGE_THRESHOLD = 5

interface CountryGroupProps {
  country: string
  reels: ReelSubmission[]
  trips: Trip[]
  onReject: (id: string) => void
  onFavourite: (id: string) => void
  onOpen: (reel: ReelSubmission) => void
}

export function CountryGroup({
  country,
  reels,
  trips,
  onReject,
  onFavourite,
  onOpen,
}: CountryGroupProps) {
  const [open, setOpen] = useState(true)

  const flag = countryFlag(country)
  const hasTrip = trips.some(
    t => t.destination_country?.toLowerCase() === country.toLowerCase(),
  )
  const showNudge = reels.length >= NUDGE_THRESHOLD && !hasTrip

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Header trigger */}
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            'bg-sky-50 border-b border-sky-100',
            !open && 'border-b-0',
          )}
        >
          <Collapsible.Trigger
            className={cn(
              'w-full flex items-center gap-2 px-4 py-3',
              'cursor-pointer select-none',
              'hover:bg-sky-100 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <span className="text-lg leading-none" aria-hidden>{flag}</span>
            <span className="text-sm font-semibold font-serif text-foreground">
              {country}
            </span>
            <span className="text-xs text-muted-foreground ml-0.5">
              ({reels.length})
            </span>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground ml-auto shrink-0',
                'transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </Collapsible.Trigger>

          {/* Ready-to-plan nudge — always visible when conditions are met */}
          {showNudge && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700">
                {reels.length} {country} saves — start a trip?
              </p>
              <Link
                href={`/trips/new?destination_country=${encodeURIComponent(country)}`}
                className={cn(
                  'flex items-center gap-0.5 text-xs font-semibold',
                  'text-amber-700 hover:text-amber-900 transition-colors',
                  'bg-amber-100 hover:bg-amber-200 rounded-full px-2 py-1',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                aria-label={`Start a trip to ${country}`}
              >
                <Plus className="size-3" />
                Trip
              </Link>
            </div>
          )}
        </div>

        <Collapsible.Panel className="collapsible-panel">
          <div className="p-3 grid grid-cols-2 lg:grid-cols-3 gap-3">
            {reels.map((reel, i) => (
              <PlaceCard
                key={reel.id}
                reel={reel}
                index={i}
                onReject={() => onReject(reel.id)}
                onFavourite={() => onFavourite(reel.id)}
                onOpen={() => onOpen(reel)}
              />
            ))}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  )
}
