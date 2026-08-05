'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@base-ui/react/drawer'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function UrlInput({
  dreamlistId,
  dreamlistName,
}: {
  dreamlistId: string
  dreamlistName: string
}) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status !== 'saved') return
    const timeout = setTimeout(() => {
      setStatus('idle')
      setOpen(false)
    }, 1200)
    return () => clearTimeout(timeout)
  }, [status])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setStatus('idle')

    try {
      const res = await fetch('/api/ingest-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          notes: notes.trim() || undefined,
          dreamlist_id: dreamlistId,
        }),
      })

      if (res.ok) {
        setUrl('')
        setNotes('')
        setStatus('saved')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.error ?? 'Something went wrong')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error - check your connection')
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="down">
      <Drawer.Trigger
        className={cn(
          'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3',
          'text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2',
        )}
      >
        <Plus className="size-4" />
        Add idea
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="drawer-backdrop fixed inset-0 z-40 bg-black/45" />
        <Drawer.Popup
          className={cn(
            'drawer-popup fixed bottom-0 left-0 right-0 z-50',
            'rounded-t-2xl bg-background shadow-2xl',
            'mx-auto max-h-[90dvh] max-w-lg',
            'md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:w-[min(92vw,30rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl',
          )}
        >
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>
          <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-3">
            <div>
              <Drawer.Title className="text-lg font-semibold tracking-tight">
                Add idea
              </Drawer.Title>
              <p className="text-xs font-medium text-sky-700">{dreamlistName}</p>
            </div>
            <Drawer.Close
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Close"
            >
              <X className="size-4" />
            </Drawer.Close>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3 px-4 pb-5">
            <Input
              type="url"
              placeholder="Paste a TikTok, Instagram, or Facebook reel"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              autoFocus
              className="h-11 bg-white/90 text-sm shadow-inner shadow-sky-950/[0.03]"
            />
            <Input
              placeholder='Optional note (e.g. "Susan really wants this")'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 bg-white/90 text-sm shadow-inner shadow-sky-950/[0.03]"
            />
            {status === 'saved' && (
              <p className="text-xs text-muted-foreground">Saved to this Dreamlist. Ideas will update automatically.</p>
            )}
            {status === 'error' && (
              <p className="text-xs text-destructive">{errorMsg}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-sky-600 hover:bg-sky-700">
                {loading ? 'Saving...' : 'Save idea'}
              </Button>
            </div>
          </form>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
