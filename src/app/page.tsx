import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UrlInput } from '@/components/inbox/url-input'
import { InboxClient } from '@/components/inbox/inbox-client'
import { InboxPoller } from '@/components/inbox/inbox-poller'
import { DreamlistSwitcher } from '@/components/dreamlists/dreamlist-switcher'
import type { Dreamlist, ReelSubmission, Trip } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function IdeasPage({
  searchParams,
}: {
  searchParams?: Promise<{ dreamlist?: string; saved?: string; error?: string }>
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
  const shareMessage = params?.saved === 'true'
    ? { tone: 'success', text: 'Idea saved. Place details are being extracted.' }
    : params?.error === 'rate-limited'
      ? { tone: 'error', text: 'Too many new reels were saved recently. Please wait and try again.' }
      : params?.error === 'temporarily-unavailable'
        ? { tone: 'error', text: 'Saving is temporarily unavailable. Please try again shortly.' }
        : params?.error
          ? { tone: 'error', text: 'That shared item was not a supported public reel URL.' }
          : null

  return (
    <main className="px-4 py-6 sm:py-9">
      <div className="mx-auto mb-5 max-w-2xl md:hidden">
        <DreamlistSwitcher dreamlists={dreamlists} variant="mobile" />
      </div>
      <div className="max-w-2xl mx-auto mb-5 space-y-1">
        <div className="mb-1 hidden items-center justify-between gap-3 md:flex">
          <p className="text-xs font-medium text-sky-700">{selectedDreamlist.name}</p>
          <DreamlistSwitcher dreamlists={dreamlists} />
        </div>
        <p className="text-xs font-medium text-sky-700 mb-1 md:hidden">{selectedDreamlist.name}</p>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--travel-ink)] sm:text-2xl">Ideas</h1>
            <p className="text-sm text-muted-foreground">Places you want to dream about later.</p>
          </div>
          <UrlInput dreamlistId={selectedDreamlist.id} dreamlistName={selectedDreamlist.name} />
        </div>
      </div>

      {hasProcessing && <InboxPoller />}

      {shareMessage && (
        <p
          className={
            shareMessage.tone === 'success'
              ? 'mx-auto mb-4 max-w-2xl rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
              : 'mx-auto mb-4 max-w-2xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'
          }
          role={shareMessage.tone === 'error' ? 'alert' : 'status'}
        >
          {shareMessage.text}
        </p>
      )}

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
