import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DreamlistSwitcher } from '@/components/dreamlists/dreamlist-switcher'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import type { Dreamlist } from '@/lib/types'

export async function Nav() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: dreamlists } = await supabase
    .from('dreamlists')
    .select('*')
    .order('created_at', { ascending: true })

  const userDreamlists = (dreamlists ?? []) as Dreamlist[]

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-sky-100/80 bg-white/75 backdrop-blur-xl">
        <nav className="mx-auto flex min-h-12 max-w-4xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--travel-ink)] sm:text-base">
            We Should Go
          </Link>
          <div className="hidden items-center gap-3 md:flex">
            <DreamlistSwitcher dreamlists={userDreamlists} />
            <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Ideas
            </Link>
            <Link href="/trips" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Trips
            </Link>
            <Link href="/dreamlists" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Dreamlists
            </Link>
            <Link href="/settings" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Settings
            </Link>
          </div>
        </nav>
        <div className="mx-auto px-4 pb-3 md:hidden">
          <DreamlistSwitcher dreamlists={userDreamlists} variant="mobile" />
        </div>
      </header>
      <MobileBottomNav />
    </>
  )
}
