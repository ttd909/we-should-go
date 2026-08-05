import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  ExternalLink,
  Hotel,
  MapPin,
  Navigation,
  Plane,
  Sparkles,
  TrainFront,
} from 'lucide-react'
import type { PublicItineraryBlock } from '@/lib/itinerary/publication'
import { getPublicItinerary } from '@/lib/itinerary/public-data'
import { datesBetween } from '@/lib/itinerary/time'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ shareSlug: string }> }

function formatDay(day: string, long = true): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: long ? 'long' : 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}
function formatPublished(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function mapUrl(block: PublicItineraryBlock): string | null {
  const query = block.latitude !== null && block.longitude !== null
    ? `${block.latitude},${block.longitude}`
    : block.address ?? null
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}

function TypeIcon({ type }: { type: PublicItineraryBlock['type'] }) {
  const className = 'size-4'
  if (type === 'flight') return <Plane className={className} />
  if (type === 'transit') return <TrainFront className={className} />
  if (type === 'hotel') return <Hotel className={className} />
  if (type === 'meal') return <Coffee className={className} />
  if (type === 'place' || type === 'event') return <MapPin className={className} />
  return <Sparkles className={className} />
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareSlug } = await params
  const publication = await getPublicItinerary(shareSlug)
  if (!publication) return { title: 'Itinerary unavailable | We Should Go', robots: { index: false, follow: false } }
  const trip = publication.snapshot.trip
  const destination = [trip.destination_city, trip.destination_country].filter(Boolean).join(', ')
  return {
    title: `${trip.name} | We Should Go`,
    description: destination ? `Shared itinerary for ${destination}.` : 'A shared travel itinerary.',
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function PublicItineraryPage({ params }: Props) {
  const { shareSlug } = await params
  const publication = await getPublicItinerary(shareSlug)
  if (!publication) notFound()

  const { trip, blocks } = publication.snapshot
  const destination = [trip.destination_city, trip.destination_region, trip.destination_country].filter(Boolean).join(', ')
  const rangeDays = trip.start_date && trip.end_date ? datesBetween(trip.start_date, trip.end_date) : []
  const days = [...new Set([...rangeDays, ...blocks.map((block) => block.day_date)])].sort()

  return (
    <main className="-mb-24 min-h-screen bg-[linear-gradient(180deg,#e0f2fe_0,#f8fafc_22rem,#fff_100%)] pb-20 md:mb-0">
      <header className="overflow-hidden border-b border-sky-200/70 bg-sky-950 text-white">
        <div className="mx-auto max-w-3xl px-5 pb-8 pt-7 sm:px-8 sm:pb-10 sm:pt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Shared itinerary</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{trip.name}</h1>
          {destination && <p className="mt-3 flex items-start gap-2 text-sm text-sky-100"><MapPin className="mt-0.5 size-4 shrink-0" />{destination}</p>}
          {trip.start_date && trip.end_date && (
            <p className="mt-2 flex items-center gap-2 text-sm text-sky-100"><CalendarDays className="size-4" />{formatDay(trip.start_date)} – {formatDay(trip.end_date)}</p>
          )}
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-sky-100 ring-1 ring-white/15">
            <CheckCircle2 className="size-3.5 text-emerald-300" />Read-only snapshot · Published {formatPublished(publication.publishedAt)}
          </div>
        </div>
      </header>

      {days.length > 1 && (
        <nav className="sticky top-0 z-20 border-b border-sky-100 bg-white/90 shadow-sm backdrop-blur" aria-label="Itinerary days">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2.5 sm:px-8">
            {days.map((day, index) => (
              <a key={day} href={`#public-day-${day}`} className="shrink-0 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-100 hover:bg-sky-100">
                Day {index + 1} · {formatDay(day, false)}
              </a>
            ))}
          </div>
        </nav>
      )}

      <div className="mx-auto max-w-3xl space-y-9 px-4 py-7 sm:px-8 sm:py-10">
        {days.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-sky-300 bg-white/80 p-8 text-center text-sm text-muted-foreground">No itinerary items were included in this snapshot.</section>
        ) : days.map((day, dayIndex) => {
          const dayBlocks = blocks.filter((block) => block.day_date === day)
            .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') || a.sort_order - b.sort_order)
          return (
            <section key={day} id={`public-day-${day}`} className="scroll-mt-16">
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-sky-200 pb-2.5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Day {dayIndex + 1}</p>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">{formatDay(day)}</h2>
                </div>
                <span className="text-xs text-muted-foreground">{day}</span>
              </div>
              {dayBlocks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/65 px-5 py-6 text-center text-sm text-muted-foreground">Free day</div>
              ) : (
                <div className="space-y-3">
                  {dayBlocks.map((block, blockIndex) => {
                    const directions = mapUrl(block)
                    return (
                      <article key={`${day}-${block.start_time}-${block.title}-${blockIndex}`} className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                        <div className="flex items-stretch">
                          <div className="flex w-[4.75rem] shrink-0 flex-col items-center border-r border-sky-100 bg-sky-50/70 px-2 py-4 text-center">
                            <span className="text-sm font-bold text-sky-800">{block.start_time ?? 'Anytime'}</span>
                            {block.duration_min && <span className="mt-1 text-[10px] leading-4 text-sky-700/70">{durationLabel(block.duration_min)}</span>}
                          </div>
                          <div className="min-w-0 flex-1 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-xs font-medium text-sky-700"><TypeIcon type={block.type} /><span className="capitalize">{block.type}</span>{block.is_locked && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Booked</span>}</div>
                                <h3 className="mt-1.5 text-base font-semibold leading-6 text-slate-900">{block.title}</h3>
                              </div>
                              {directions && <a href={directions} target="_blank" rel="noreferrer" aria-label={`Open ${block.title} in maps`} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100"><Navigation className="size-4" /></a>}
                            </div>
                            <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                              {block.address && <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0" />{block.address}</p>}
                              {block.end_date && block.end_time && <p className="flex items-center gap-1.5"><Clock3 className="size-3.5" />Arrives {formatDay(block.end_date, false)} at {block.end_time}{block.end_timezone ? ` (${block.end_timezone})` : ''}</p>}
                              {block.timezone && <p>{block.timezone}</p>}
                            </div>
                            {block.notes && <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">{block.notes}</p>}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <footer className="border-t border-sky-100 bg-white/75 px-5 py-7 text-center text-xs text-muted-foreground">
        Shared from <span className="font-semibold text-slate-700">We Should Go</span> · This page updates only when the organiser publishes again.
        <a href="https://weshouldgo.app" className="ml-1 inline-flex items-center gap-0.5 text-sky-700 hover:underline">weshouldgo.app<ExternalLink className="size-3" /></a>
      </footer>
    </main>
  )
}
