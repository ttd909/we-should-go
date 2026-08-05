'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ListChecks } from 'lucide-react'
import type { ItineraryBlock, Trip } from '@/lib/types'
import { datesBetween } from '@/lib/itinerary/time'
import { cn } from '@/lib/utils'

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}

export function DayNavigator({ trip, blocks }: { trip: Trip; blocks: ItineraryBlock[] }) {
  const days = useMemo(() => {
    const tripDays = trip.start_date && trip.end_date ? datesBetween(trip.start_date, trip.end_date) : []
    return [...new Set([...tripDays, ...blocks.map((block) => block.day_date)])].sort()
  }, [blocks, trip.end_date, trip.start_date])
  const [activeDay, setActiveDay] = useState(days[0] ?? null)
  const lockedCount = blocks.filter((block) => block.is_locked).length

  useEffect(() => {
    const sections = days.flatMap((day) => {
      const element = document.getElementById(`day-${day}`)
      return element ? [element] : []
    })
    if (!sections.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveDay(visible[0].target.id.replace('day-', ''))
      },
      { rootMargin: '-18% 0px -70% 0px', threshold: 0 },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [days])

  function jumpTo(day: string) {
    const element = document.getElementById(`day-${day}`)
    if (!element) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    window.history.replaceState(null, '', `#day-${day}`)
    setActiveDay(day)
  }

  return (
    <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-white/80 shadow-sm backdrop-blur xl:flex print:hidden">
      <div className="border-b p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Trip overview</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-sky-50 px-1 py-2"><CalendarDays className="mx-auto size-4 text-sky-600" /><p className="mt-1 text-sm font-semibold">{days.length}</p><p className="text-[9px] uppercase text-muted-foreground">Days</p></div>
          <div className="rounded-lg bg-sky-50 px-1 py-2"><ListChecks className="mx-auto size-4 text-sky-600" /><p className="mt-1 text-sm font-semibold">{blocks.length}</p><p className="text-[9px] uppercase text-muted-foreground">Plans</p></div>
          <div className="rounded-lg bg-amber-50 px-1 py-2"><CheckCircle2 className="mx-auto size-4 text-amber-600" /><p className="mt-1 text-sm font-semibold">{lockedCount}</p><p className="text-[9px] uppercase text-muted-foreground">Booked</p></div>
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Navigate itinerary days">
        {days.map((day, index) => {
          const dayBlocks = blocks.filter((block) => block.day_date === day)
          const confirmed = dayBlocks.filter((block) => block.is_locked).length
          return (
            <button
              key={day}
              type="button"
              onClick={() => jumpTo(day)}
              className={cn(
                'mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors',
                activeDay === day ? 'bg-sky-100 text-sky-950' : 'hover:bg-sky-50',
              )}
            >
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold', activeDay === day ? 'bg-sky-600 text-white' : 'bg-muted text-muted-foreground')}>{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{dayLabel(day)}</span><span className="block text-[10px] text-muted-foreground">{dayBlocks.length ? `${dayBlocks.length} item${dayBlocks.length === 1 ? '' : 's'}` : 'Open day'}</span></span>
              {confirmed > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700" title={`${confirmed} confirmed`}>{confirmed}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
