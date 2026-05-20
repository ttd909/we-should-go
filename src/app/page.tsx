import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UrlInput } from '@/components/inbox/url-input'
import { InboxClient } from '@/components/inbox/inbox-client'
import { InboxPoller } from '@/components/inbox/inbox-poller'
import type { Dreamlist, ReelSubmission, Trip } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function IdeasPage({
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

  const [reelsResult, tripsResult] = await Promise.all([
    supabase
      .from('reel_submissions')
      .select('*')
      .eq('dreamlist_id', selectedDreamlist.id)
      .is('trip_id', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('trips')
      .select('*')
      .eq('dreamlist_id', selectedDreamlist.id),
  ])

  const reels = (reelsResult.data ?? []) as ReelSubmission[]
  const trips = (tripsResult.data ?? []) as Trip[]

  const hasProcessing = reels.some(r => r.confidence === null)

  return (
    <main className="px-4 py-7 sm:py-9">
      <div className="max-w-2xl mx-auto mb-6">
        <p className="text-xs font-medium text-sky-700 mb-1">{selectedDreamlist.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight mb-4 text-[var(--travel-ink)]">Ideas</h1>
        <UrlInput dreamlistId={selectedDreamlist.id} />
      </div>

      {hasProcessing && <InboxPoller />}

      <div className="max-w-4xl mx-auto">
        <InboxClient
          reels={reels}
          trips={trips}
          dreamlists={dreamlists}
          currentDreamlist={selectedDreamlist}
        />
      </div>
    </main>
  )
}
