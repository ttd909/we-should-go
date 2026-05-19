import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { TripCard } from '@/components/trips/trip-card'
import type { Trip } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('*')
    .eq('created_by_user_id', user.id)
    .order('created_at', { ascending: false })

  if (tripsError) console.error('[trips] query error:', tripsError.message, tripsError.code, tripsError.details, tripsError.hint)

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
        <Link href="/trips/new" className={buttonVariants({ size: 'sm' })}>
          New trip
        </Link>
      </div>

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
