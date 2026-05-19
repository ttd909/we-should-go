'use client'

import { useTransition } from 'react'
import { rejectReel } from '@/lib/actions/reels'

export function DeleteReelButton({ reelId }: { reelId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => rejectReel(reelId))}
      disabled={isPending}
      className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      aria-label="Delete reel"
    >
      {isPending ? '…' : 'Delete'}
    </button>
  )
}
