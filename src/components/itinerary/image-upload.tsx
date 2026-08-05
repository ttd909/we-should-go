'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendItineraryPhoto } from '@/lib/actions/itinerary'
import { Button } from '@/components/ui/button'

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const AUTH_TIMEOUT_MS = 10_000
const UPLOAD_TIMEOUT_MS = 30_000
const REVIEW_TIMEOUT_MS = 60_000

type UploadPhase = 'preparing' | 'uploading' | 'reviewing'

interface PreparedImage {
  blob: Blob
  url: string
  requestId: string
  uploadedPath: string | null
}

function withTimeout<T>(promise: PromiseLike<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds)
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (reason) => {
        window.clearTimeout(timer)
        reject(reason)
      },
    )
  })
}

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
  const [prepared, setPrepared] = useState<PreparedImage | null>(null)
  const [instruction, setInstruction] = useState('')
  const [phase, setPhase] = useState<UploadPhase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = phase !== null

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    setPhase('preparing')
    try {
      const blob = await prepareImage(file)
      if (prepared) URL.revokeObjectURL(prepared.url)
      setPrepared({
        blob,
        url: URL.createObjectURL(blob),
        requestId: crypto.randomUUID(),
        uploadedPath: null,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare that image.')
    } finally {
      setPhase(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function submit() {
    if (!prepared || busy) return
    const current = prepared
    setPhase(current.uploadedPath ? 'reviewing' : 'uploading')
    setError(null)
    const supabase = createClient()
    let path = current.uploadedPath

    try {
      if (!path) {
        const { data: { user } } = await withTimeout(
          supabase.auth.getUser(),
          AUTH_TIMEOUT_MS,
          'Sign-in verification took too long. Check your connection and try again.',
        )
        if (!user) throw new Error('Please sign in again.')

        path = `${tripId}/${user.id}/${current.requestId}.jpg`
        const { error: uploadError } = await withTimeout(
          supabase.storage.from('trip-chat-images').upload(path, current.blob, {
            contentType: 'image/jpeg',
            upsert: false,
          }),
          UPLOAD_TIMEOUT_MS,
          'The photo upload took too long. Check your connection and try again.',
        )
        if (uploadError) throw new Error(uploadError.message)

        const uploadedPath = path
        setPrepared((value) => value?.requestId === current.requestId
          ? { ...value, uploadedPath }
          : value)
      }

      setPhase('reviewing')
      const result = await withTimeout(
        sendItineraryPhoto({
          tripId,
          expectedVersion: version,
          clientRequestId: current.requestId,
          imagePath: path,
          instruction: instruction.trim() || 'Extract the travel or booking details and propose itinerary items.',
        }),
        REVIEW_TIMEOUT_MS,
        'Photo review took too long. The photo is saved, so you can safely try again.',
      )
      if (!result.ok) {
        if (['rate_limited', 'validation', 'database'].includes(result.code)) {
          await supabase.storage.from('trip-chat-images').remove([path])
          setPrepared((value) => value?.requestId === current.requestId
            ? { ...value, uploadedPath: null }
            : value)
        }
        throw new Error(result.message)
      }

      URL.revokeObjectURL(current.url)
      setPrepared(null)
      setInstruction('')
      onComplete()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review that photo. Please try again.')
    } finally {
      setPhase(null)
    }
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
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Review before sending</p>
            <Button type="button" variant="ghost" size="icon-xs" disabled={busy} onClick={() => { URL.revokeObjectURL(prepared.url); setPrepared(null) }}><X /></Button>
          </div>
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} disabled={busy} placeholder="Optional: This is our flight booking…" rows={2} className="mt-1 w-full resize-none rounded-lg border bg-background px-2 py-1.5 text-xs" />
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" className="mt-2 w-full" onClick={submit} disabled={busy}>
        <ImagePlus />
        {phase === 'uploading' ? 'Uploading photo…' : phase === 'reviewing' ? 'Reviewing photo…' : 'Send photo for review'}
      </Button>
      {phase === 'reviewing' && <p className="mt-1 text-center text-[11px] text-muted-foreground" aria-live="polite">This can take up to a minute.</p>}
    </div>
  )
}
