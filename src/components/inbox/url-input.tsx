'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function UrlInput() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

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
      setErrorMsg('Network error — check your connection')
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Input
        type="url"
        placeholder="Paste a TikTok or Instagram reel URL…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
        className="text-sm"
      />
      <div className="flex gap-2">
        <Input
          placeholder='Optional note (e.g. "Susan really wants this")'
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="text-sm"
        />
        <Button type="submit" disabled={loading} className="shrink-0">
          {loading ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {status === 'saved' && (
        <p className="text-xs text-muted-foreground">Saved — enriching in the background…</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}
    </form>
  )
}
