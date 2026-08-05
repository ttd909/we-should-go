'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendItineraryPhoto } from '@/lib/actions/itinerary'
import { Button } from '@/components/ui/button'

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function prepareImage(file: File): Promise<Blob> {
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    throw new Error('HEIC photos are not supported yet. Save or share it as JPEG first.')
  }
  if (!ACCEPTED.has(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not prepare the image.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84))
  if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('The prepared image is still too large.')
  return blob
}

export function ImageUpload({ tripId, version, onComplete }: {
  tripId: string
  version: number
  onComplete: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<{ blob: Blob; url: string } | null>(null)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const blob = await prepareImage(file)
      if (prepared) URL.revokeObjectURL(prepared.url)
      setPrepared({ blob, url: URL.createObjectURL(blob) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare that image.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function submit() {
    if (!prepared || busy) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Please sign in again.')
      setBusy(false)
      return
    }
    const requestId = crypto.randomUUID()
    const path = `${tripId}/${user.id}/${requestId}.jpg`
    const { error: uploadError } = await supabase.storage.from('trip-chat-images').upload(path, prepared.blob, {
      contentType: 'image/jpeg', upsert: false,
    })
    if (uploadError) {
      setError(uploadError.message)
      setBusy(false)
      return
    }
    const result = await sendItineraryPhoto({
      tripId, expectedVersion: version, clientRequestId: requestId,
      imagePath: path,
      instruction: instruction.trim() || 'Extract the travel or booking details and propose itinerary items.',
    })
    if (!result.ok) {
      if (['rate_limited', 'validation', 'database'].includes(result.code)) {
        await supabase.storage.from('trip-chat-images').remove([path])
      }
      setError(result.message)
      setBusy(false)
      return
    }
    URL.revokeObjectURL(prepared.url)
    setPrepared(null)
    setInstruction('')
    setBusy(false)
    onComplete()
  }

  if (!prepared) {
    return (
      <div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.heic,.heif" onChange={(event) => void choose(event.target.files?.[0])} className="sr-only" />
        <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}><Camera />{busy ? 'Preparing…' : 'Add photo'}</Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-2.5">
      <div className="flex gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
        <img src={prepared.url} alt="Prepared upload" className="size-20 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between"><p className="text-xs font-medium">Review before sending</p><Button type="button" variant="ghost" size="icon-xs" onClick={() => { URL.revokeObjectURL(prepared.url); setPrepared(null) }}><X /></Button></div>
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Optional: This is our flight booking…" rows={2} className="mt-1 w-full resize-none rounded-lg border bg-background px-2 py-1.5 text-xs" />
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" className="mt-2 w-full" onClick={submit} disabled={busy}><ImagePlus />{busy ? 'Reading photo…' : 'Send photo for review'}</Button>
    </div>
  )
}
