'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Dreamlist } from '@/lib/types'

interface DreamlistSwitcherProps {
  dreamlists: Dreamlist[]
}

export function DreamlistSwitcher({ dreamlists }: DreamlistSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeId = searchParams.get('dreamlist') ?? dreamlists[0]?.id ?? ''

  if (dreamlists.length === 0) return null

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="hidden sm:inline">Dreamlist</span>
      <select
        value={activeId}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams)
          params.set('dreamlist', event.target.value)
          router.push(`${pathname}?${params.toString()}`)
        }}
        className="h-8 max-w-[170px] rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
