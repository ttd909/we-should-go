'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Dreamlist } from '@/lib/types'

interface DreamlistSwitcherProps {
  dreamlists: Dreamlist[]
  variant?: 'header' | 'mobile'
}

export function DreamlistSwitcher({ dreamlists, variant = 'header' }: DreamlistSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeId = searchParams.get('dreamlist') ?? dreamlists[0]?.id ?? ''

  if (dreamlists.length === 0) return null
  const isMobile = variant === 'mobile'

  return (
    <label
      className={
        isMobile
          ? 'flex w-full items-center gap-2 rounded-2xl border border-sky-100 bg-white/80 px-3 py-2 text-sm shadow-sm shadow-sky-950/[0.03] backdrop-blur'
          : 'flex items-center gap-1.5 text-xs text-muted-foreground'
      }
    >
      <span className={isMobile ? 'shrink-0 font-medium text-sky-800' : 'hidden sm:inline'}>
        Dreamlist:
      </span>
      <select
        value={activeId}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams)
          params.set('dreamlist', event.target.value)
          router.push(`${pathname}?${params.toString()}`)
        }}
        className={
          isMobile
            ? 'h-9 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'h-8 max-w-[170px] rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
        }
        aria-label="Switch Dreamlist"
      >
        {dreamlists.map((dreamlist) => (
          <option key={dreamlist.id} value={dreamlist.id}>
            {dreamlist.name}
          </option>
        ))}
      </select>
    </label>
  )
}
