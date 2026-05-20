'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function UrlInput({ dreamlistId }: { dreamlistId: string }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (status !== 'saved') return
    const timeout = setTimeout(() => setStatus('idle'), 8000)
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
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-[var(--travel-card-shadow)] backdrop-blur"
    >
      <Input
        type="url"
        placeholder="Paste a TikTok or Instagram reel"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
        className="h-10 bg-white/90 text-sm shadow-inner shadow-sky-950/[0.03]"
      />
      <div className="flex gap-2">
        <Input
          placeholder='Optional note (e.g. "Susan really wants this")'
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-10 bg-white/90 text-sm shadow-inner shadow-sky-950/[0.03]"
        />
        <Button type="submit" disabled={loading} className="h-10 shrink-0 bg-sky-600 px-4 shadow-sm hover:bg-sky-700">
          {loading ? 'Saving...' : 'Save idea'}
        </Button>
      </div>
      {status === 'saved' && (
        <p className="text-xs text-muted-foreground">Saved to this Dreamlist. The idea will update automatically.</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}
    </form>
  )
}
