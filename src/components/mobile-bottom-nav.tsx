'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Lightbulb, Map, Settings, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/', label: 'Ideas', icon: Lightbulb },
  { href: '/trips', label: 'Trips', icon: Map },
  { href: '/dreamlists', label: 'Dreamlists', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const dreamlist = searchParams.get('dreamlist')

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-100 bg-white/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 shadow-[0_-12px_30px_rgba(15,39,66,0.08)] backdrop-blur-xl md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const href = dreamlist && (item.href === '/' || item.href === '/trips')
            ? `${item.href}?dreamlist=${dreamlist}`
            : item.href

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-1.5 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
              )}
            >
              <Icon className="size-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
