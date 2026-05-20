import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { TripCard } from '@/components/trips/trip-card'
import { DreamlistSwitcher } from '@/components/dreamlists/dreamlist-switcher'
import type { Dreamlist, Trip } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TripsPage({
  searchParams,
}: {
  searchParams?: Promise<{ dreamlist?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: dreamlistsData } = await supabase
    .from('dreamlists')
    .select('*')
    .order('created_at', { ascending: true })

  const dreamlists = (dreamlistsData ?? []) as Dreamlist[]
  if (dreamlists.length === 0) redirect('/dreamlists')
  const selectedDreamlist =
    dreamlists.find((dreamlist) => dreamlist.id === params?.dreamlist) ?? dreamlists[0]

  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('*')
    .eq('dreamlist_id', selectedDreamlist.id)
    .order('created_at', { ascending: false })

  if (tripsError) console.error('[trips] query error:', tripsError.message, tripsError.code, tripsError.details, tripsError.hint)

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-5 md:hidden">
        <DreamlistSwitcher dreamlists={dreamlists} variant="mobile" />
      </div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
        <Link href={`/trips/new?dreamlist=${selectedDreamlist.id}`} className={buttonVariants({ size: 'sm' })}>
          New trip
        </Link>
      </div>
      <div className="mb-4 hidden items-center justify-between gap-3 md:flex">
        <p className="text-xs font-medium text-sky-700">{selectedDreamlist.name}</p>
        <DreamlistSwitcher dreamlists={dreamlists} />
      </div>
      <p className="text-xs font-medium text-sky-700 mb-4 md:hidden">{selectedDreamlist.name}</p>

      {trips && trips.length > 0 ? (
        <div className="space-y-3">
          {trips.map((trip: Trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No trips yet.{' '}
          <Link href="/trips/new" className="underline underline-offset-2">
            Create one
          </Link>{' '}
          to get started.
        </p>
      )}
    </main>
  )
}
