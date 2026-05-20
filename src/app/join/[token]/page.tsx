import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { joinDreamlistByToken } from '@/lib/actions/dreamlists'
import { buttonVariants } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function JoinDreamlistPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`)
  }

  let dreamlistId: string | null = null
  let error: string | null = null

  try {
    dreamlistId = await joinDreamlistByToken(token)
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not join this Dreamlist'
  }

  return (
    <main className="max-w-md mx-auto px-4 py-12 space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        {dreamlistId ? 'You have joined this Dreamlist' : 'Invite link unavailable'}
      </h1>
      <p className="text-sm text-muted-foreground">
        {dreamlistId
          ? 'You can now see its saved Ideas and Trips.'
          : error}
      </p>
      <Link
        href={dreamlistId ? `/?dreamlist=${dreamlistId}` : '/'}
        className={buttonVariants()}
      >
        {dreamlistId ? 'Open Dreamlist' : 'Back to Ideas'}
      </Link>
    </main>
  )
}
