'use client'

import { useState, useTransition } from 'react'
import { createDreamlist } from '@/lib/actions/dreamlists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreateDreamlistForm() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        setMessage(null)
        startTransition(async () => {
          try {
            await createDreamlist(name)
            setName('')
            setMessage('Dreamlist created')
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not create Dreamlist')
          }
        })
      }}
    >
      <div className="flex-1 space-y-1">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Thien & Susan's Dreamlist"
          required
        />
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </Button>
    </form>
  )
}
