import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DreamlistSwitcher } from '@/components/dreamlists/dreamlist-switcher'
import type { Dreamlist } from '@/lib/types'

export async function Nav() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: dreamlists } = await supabase
    .from('dreamlists')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <header className="border-b border-border">
      <nav className="max-w-4xl mx-auto px-4 min-h-12 py-2 flex items-center justify-between gap-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          We Should Go
        </Link>
        <div className="flex items-center gap-3">
          <DreamlistSwitcher dreamlists={(dreamlists ?? []) as Dreamlist[]} />
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Ideas
          </Link>
          <Link href="/trips" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Trips
          </Link>
          <Link href="/dreamlists" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Dreamlists
          </Link>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Settings
          </Link>
        </div>
      </nav>
    </header>
  )
}
