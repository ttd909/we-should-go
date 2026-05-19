import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export async function Nav() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  return (
    <header className="border-b border-border">
      <nav className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          We Should Go
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Inbox
          </Link>
          <Link href="/trips" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Trips
          </Link>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Settings
          </Link>
        </div>
      </nav>
    </header>
  )
}
