import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateDreamlistForm } from '@/components/dreamlists/create-dreamlist-form'
import { InviteLinkButton } from '@/components/dreamlists/invite-link-button'
import type { Dreamlist } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DreamlistsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: dreamlists } = await supabase
    .from('dreamlists')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dreamlists</h1>
        <p className="text-sm text-muted-foreground">
          Create a shared Dreamlist, then copy the invite link and send it through WhatsApp,
          iMessage, or wherever you already chat.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Create shared Dreamlist</h2>
        <CreateDreamlistForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Your Dreamlists</h2>
        <div className="space-y-3">
          {((dreamlists ?? []) as Dreamlist[]).map((dreamlist) => (
            <div
              key={dreamlist.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div>
                <p className="text-sm font-medium">{dreamlist.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{dreamlist.type}</p>
              </div>
              {dreamlist.owner_id === user.id && dreamlist.type === 'shared' && (
                <div className="shrink-0 space-y-1">
                  <InviteLinkButton dreamlistId={dreamlist.id} />
                  <p className="text-[11px] text-muted-foreground text-right">
                    Anyone with the link can join
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
