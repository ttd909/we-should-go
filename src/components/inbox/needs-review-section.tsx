'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronDown, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { googlePlacePhotoUrl, placeGradient } from './card-utils'
import type { ReelSubmission } from '@/lib/types'

interface NeedsReviewSectionProps {
  reels: ReelSubmission[]
  onResolve: (id: string, placeName: string) => void
  onDelete: (id: string) => void
}

function NeedsReviewCard({
  reel,
  onResolve,
  onDelete,
}: {
  reel: ReelSubmission
  onResolve: (placeName: string) => void
  onDelete: () => void
}) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setSubmitting(true)
    onResolve(trimmed)
  }

  const handleDelete = () => {
    if (window.confirm('Permanently delete this idea?')) {
      onDelete()
    }
  }

  const destination = [reel.destination_city, reel.destination_country]
    .filter(Boolean)
    .join(', ')
  const socialThumbnailUrl = reel.thumbnail_url
  const googleThumbnailUrl = googlePlacePhotoUrl(reel.google_photo_name, 160)
  const imageUrl =
    googleThumbnailUrl && failedThumbnailUrl !== googleThumbnailUrl
      ? googleThumbnailUrl
      : socialThumbnailUrl && failedThumbnailUrl !== socialThumbnailUrl
        ? socialThumbnailUrl
        : null

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-0">
      {/* Thumbnail */}
      <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="Place thumbnail"
            fill
            unoptimized
            className="object-cover"
            sizes="64px"
            onError={() => setFailedThumbnailUrl(imageUrl)}
          />
        ) : (
          <div className={cn('absolute inset-0', placeGradient(reel.place_type))} />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Meta */}
        <div>
          <div className="flex items-start justify-between gap-2">
            {destination && (
              <p className="text-xs text-muted-foreground">{destination}</p>
            )}
            <button
              type="button"
              onClick={handleDelete}
              className={cn(
                'flex items-center justify-center size-7 rounded-md -mt-1 -mr-1',
                'text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-label="Permanently delete idea"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          {reel.notes && (
            <p className="text-xs text-muted-foreground italic line-clamp-1">
              &ldquo;{reel.notes}&rdquo;
            </p>
          )}
          <a
            href={reel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-sky-600 hover:underline"
          >
            View original ↗
          </a>
        </div>

        {/* Inline place name input */}
        <form onSubmit={handleSubmit} className="flex gap-1.5">
          <input
            type="text"
            placeholder="Paste place name…"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={submitting}
            className={cn(
              'flex-1 min-w-0 h-8 rounded-md border border-input bg-background px-2.5',
              'text-xs placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50',
            )}
          />
          <button
            type="submit"
            disabled={!input.trim() || submitting}
            className={cn(
              'h-8 px-2.5 rounded-md text-xs font-medium shrink-0',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-40 disabled:pointer-events-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {submitting ? '…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function NeedsReviewSection({ reels, onResolve, onDelete }: NeedsReviewSectionProps) {
  const [open, setOpen] = useState(false)

  if (reels.length === 0) return null

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        className={cn(
          'w-full flex items-center justify-between gap-2',
          'rounded-xl px-4 py-3 cursor-pointer',
          'bg-amber-50 border border-amber-200',
          'hover:bg-amber-100 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-amber-800">Needs a place name</span>
          <span className={cn(
            'inline-flex items-center justify-center rounded-full px-2 py-0.5',
            'text-xs font-semibold bg-amber-200 text-amber-800 min-w-[22px]',
          )}>
            {reels.length}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'size-4 text-amber-600 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </Collapsible.Trigger>

      <Collapsible.Panel className="collapsible-panel">
        <div className="rounded-b-xl border border-t-0 border-amber-200 bg-background px-4">
          {reels.map(reel => (
            <NeedsReviewCard
              key={reel.id}
              reel={reel}
              onResolve={(placeName) => onResolve(reel.id, placeName)}
              onDelete={() => onDelete(reel.id)}
            />
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
