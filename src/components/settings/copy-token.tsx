'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { regenerateToken } from '@/lib/actions/settings'

export function CopyToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function copy() {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleRegenerate() {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 5000)
      return
    }
    setConfirming(false)
    startTransition(async () => {
      await regenerateToken()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted px-3 py-2.5 rounded-md font-mono break-all leading-relaxed">
          {token}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={copy}
          className="shrink-0 min-h-[44px] min-w-[72px]"
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      <Button
        variant={confirming ? 'destructive' : 'ghost'}
        onClick={handleRegenerate}
        disabled={isPending}
        className="w-full min-h-[44px] text-sm font-normal"
      >
        {isPending
          ? 'Regenerating…'
          : confirming
          ? 'Tap again to confirm — old token stops working immediately'
          : 'Regenerate token'}
      </Button>
    </div>
  )
}
