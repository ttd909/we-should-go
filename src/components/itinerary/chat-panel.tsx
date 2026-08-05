'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { deleteItineraryImage, resolvePendingItineraryEdit, sendItineraryMessage } from '@/lib/actions/itinerary'
import type { TripChatMessage } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { PendingEditCard, type PendingEditView, type Resolution } from './pending-edit-card'
import { ImageUpload } from './image-upload'

export type ChatMessageView = TripChatMessage & { image_url?: string | null }

export function ChatPanel({
  tripId,
  version,
  messages,
  pendingEdits,
  currentUserId,
}: {
  tripId: string
  version: number
  messages: ChatMessageView[]
  pendingEdits: PendingEditView[]
  currentUserId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  function send(event: React.FormEvent) {
    event.preventDefault()
    const message = text.trim()
    if (!message || busy) return
    const requestId = crypto.randomUUID()
    setError(null)
    setOptimistic(message)
    startTransition(async () => {
      const result = await sendItineraryMessage({
        tripId, expectedVersion: version, clientRequestId: requestId, message,
      })
      setOptimistic(null)
      if (result.ok) {
        setText('')
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function resolve(editId: string, resolution: Resolution, selectedBlockIds?: string[]) {
    setError(null)
    startTransition(async () => {
      const result = await resolvePendingItineraryEdit({
        tripId, editId, expectedVersion: version,
        clientRequestId: crypto.randomUUID(), resolution, selectedBlockIds,
      })
      if (!result.ok) setError(result.message)
      router.refresh()
    })
  }

  function removeImage(path: string) {
    if (!window.confirm('Delete this private source image? Accepted itinerary items will stay.')) return
    startTransition(async () => {
      const result = await deleteItineraryImage({ tripId, imagePath: path })
      if (!result.ok) setError(result.message)
      router.refresh()
    })
  }

  const content = (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2"><Sparkles className="size-4 text-sky-600" /><div><h2 className="text-sm font-semibold">Plan with Claude</h2><p className="text-[11px] text-muted-foreground">Ask for one change or a whole day.</p></div></div>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close assistant"><X /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !optimistic && (
          <div className="rounded-xl bg-sky-50 p-3 text-sm text-slate-700">
            Try “Plan a relaxed first day” or “Move lunch to 1pm”. I’ll show conflicts before changing anything risky.
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${message.role === 'user' ? 'ml-auto bg-sky-600 text-white' : 'bg-muted text-foreground'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private signed URL */}
            {message.image_url && <img src={message.image_url} alt="Private itinerary upload" className="mb-2 max-h-44 w-full rounded-lg object-cover" />}
            {message.image_url && message.image_path?.startsWith(`${tripId}/${currentUserId}/`) && <button type="button" onClick={() => removeImage(message.image_path!)} className={`mb-1 text-[10px] underline ${message.role === 'user' ? 'text-white/80' : 'text-muted-foreground'}`}>Delete source image</button>}
            {message.error_message ? <span className="text-destructive">{message.error_message}</span> : message.content}
          </div>
        ))}
        {optimistic && <div className="ml-auto max-w-[92%] rounded-xl bg-sky-600/70 px-3 py-2 text-sm text-white">{optimistic}<span className="ml-2 animate-pulse">Sending…</span></div>}
        {pendingEdits.map((edit) => <PendingEditCard key={edit.id} edit={edit} busy={busy} onResolve={resolve} />)}
      </div>
      <form onSubmit={send} className="border-t p-3">
        <ImageUpload tripId={tripId} version={version} onComplete={() => router.refresh()} />
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="What should we change?" rows={3} maxLength={4000} className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50" />
        {error && <p className="mt-1 whitespace-pre-line text-xs text-destructive">{error}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">Review AI suggestions before confirming warnings.</p>
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>{busy ? 'Working…' : <><Send />Send</>}</Button>
        </div>
      </form>
    </div>
  )

  return (
    <>
      <div className="hidden h-[calc(100vh-6rem)] lg:sticky lg:top-20 lg:block">{content}</div>
      <Button className="fixed bottom-20 right-4 z-40 h-11 rounded-full px-4 shadow-lg lg:hidden" onClick={() => setOpen(true)}><MessageCircle />Plan with AI{pendingEdits.length > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] text-amber-950">{pendingEdits.length}</span>}</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden">
          <div className="absolute inset-x-0 bottom-0 h-[86vh] rounded-t-2xl bg-background p-2">{content}</div>
        </div>
      )}
    </>
  )
}
