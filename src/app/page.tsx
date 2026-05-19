import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UrlInput } from '@/components/inbox/url-input'
import { InboxClient } from '@/components/inbox/inbox-client'
import { InboxPoller } from '@/components/inbox/inbox-poller'
import type { ReelSubmission, Trip } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [reelsResult, tripsResult] = await Promise.all([
    supabase
      .from('reel_submissions')
      .select('*')
      .eq('submitted_by_user_id', user.id)
      .is('trip_id', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('trips')
      .select('*')
      .eq('created_by_user_id', user.id),
  ])

  const reels = (reelsResult.data ?? []) as ReelSubmission[]
  const trips = (tripsResult.data ?? []) as Trip[]

  const hasProcessing = reels.some(r => r.confidence === null)

  return (
    <main className="px-4 py-7 sm:py-9">
      <div className="max-w-2xl mx-auto mb-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-4 text-[var(--travel-ink)]">Inbox</h1>
        <UrlInput />
      </div>

      {hasProcessing && <InboxPoller />}

      <div className="max-w-4xl mx-auto">
        <InboxClient reels={reels} trips={trips} userId={user.id} />
      </div>
    </main>
  )
}
