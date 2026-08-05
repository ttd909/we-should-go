'use client'

import { useState, useTransition } from 'react'
import { LinkIcon } from 'lucide-react'
import { createDreamlistInvite } from '@/lib/actions/dreamlists'
import { Button } from '@/components/ui/button'

export function InviteLinkButton({ dreamlistId }: { dreamlistId: string }) {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setMessage(null)
          startTransition(async () => {
            try {
              const token = await createDreamlistInvite(dreamlistId)
              const url = `${window.location.origin}/join/${token}`
              await navigator.clipboard.writeText(url)
              setMessage('Link copied — anyone with it can join')
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Could not copy invite link')
            }
          })
        }}
      >
        <LinkIcon className="size-3.5" />
        {isPending ? 'Creating...' : 'Copy invite link'}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
