'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import { cn } from '@/lib/utils'

const DESKTOP_LINKS = [
  { href: '/', label: 'Ideas', preserveDreamlist: true },
  { href: '/trips', label: 'Trips', preserveDreamlist: true },
  { href: '/dreamlists', label: 'Dreamlists', preserveDreamlist: false },
  { href: '/settings', label: 'Settings', preserveDreamlist: false },
]

function withDreamlist(href: string, dreamlist: string | null) {
  if (!dreamlist) return href
  return `${href}?dreamlist=${encodeURIComponent(dreamlist)}`
}

export function Nav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const dreamlist = searchParams.get('dreamlist')
  const hideChrome = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (hideChrome) return null

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-sky-100/80 bg-white/75 backdrop-blur-xl">
        <nav className="mx-auto flex min-h-12 max-w-4xl items-center justify-between gap-3 px-4 py-2">
          <Link href={withDreamlist('/', dreamlist)} className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--travel-ink)] sm:text-base">
            We Should Go
          </Link>
          <div className="hidden items-center gap-3 md:flex">
            {DESKTOP_LINKS.map((link) => {
              const href = link.preserveDreamlist ? withDreamlist(link.href, dreamlist) : link.href
              const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)

              return (
                <Link
                  key={link.href}
                  href={href}
                  className={cn(
                    'text-sm transition-colors hover:text-foreground',
                    active ? 'text-sky-700' : 'text-muted-foreground',
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </header>
      <MobileBottomNav />
    </>
  )
}
