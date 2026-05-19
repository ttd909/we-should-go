import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UrlInput } from '@/components/inbox/url-input'
import { ReelCard } from '@/components/inbox/reel-card'
import { InboxPoller } from '@/components/inbox/inbox-poller'
import type { ReelSubmission } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reels } = await supabase
    .from('reel_submissions')
    .select('*')
    .eq('submitted_by_user_id', user.id)
    .neq('status', 'rejected')
    .is('trip_id', null)
    .order('created_at', { ascending: false })

  const list = (reels ?? []) as ReelSubmission[]

  // confidence is null until the enrichment update runs (even failed enrichment sets it to 0)
  const hasProcessing = list.some((r) => r.confidence === null)

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-4">Inbox</h1>
        <UrlInput />
      </div>

      {hasProcessing && <InboxPoller />}

      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((reel) => (
            <ReelCard key={reel.id} reel={reel} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No reels yet. Paste a TikTok or Instagram URL above to save your first one.
        </p>
      )}
    </main>
  )
}
