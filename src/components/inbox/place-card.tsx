'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { countryFlag } from '@/lib/country-flag'
import { PLACE_TYPE_LABEL, googlePlacePhotoUrl, placeGradient } from './card-utils'
import type { ReelSubmission } from '@/lib/types'

const SWIPE_THRESHOLD = 80

interface SwipeState {
  offset: number
  isDragging: boolean
  exitDir: 'left' | 'right' | null
}

function useSwipeGesture(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
) {
  const [state, setState] = useState<SwipeState>({ offset: 0, isDragging: false, exitDir: null })

  const startX     = useRef(0)
  const startY     = useRef(0)
  const axisLocked = useRef<'h' | 'v' | null>(null)
  const currOffset = useRef(0)
  const dragging   = useRef(false)
  const exiting    = useRef(false)
  // Refs updated via effect so they're never written during render
  const cbLeft     = useRef(onSwipeLeft)
  const cbRight    = useRef(onSwipeRight)

  useEffect(() => {
    cbLeft.current  = onSwipeLeft
    cbRight.current = onSwipeRight
  })

  const start = useCallback((x: number, y: number) => {
    if (exiting.current) return
    startX.current     = x
    startY.current     = y
    axisLocked.current = null
    currOffset.current = 0
    dragging.current   = true
    setState(s => ({ ...s, isDragging: true, exitDir: null, offset: 0 }))
  }, [])

  const move = useCallback((x: number, y: number) => {
    if (!dragging.current || exiting.current) return
    const dx = x - startX.current
    const dy = y - startY.current

    if (axisLocked.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisLocked.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
      }
      return
    }
    if (axisLocked.current === 'v') return

    currOffset.current = dx
    setState(s => ({ ...s, offset: dx }))
  }, [])

  const end = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setState(s => ({ ...s, isDragging: false }))

    const d = currOffset.current
    if (d < -SWIPE_THRESHOLD) {
      exiting.current = true
      setState(s => ({ ...s, exitDir: 'left' }))
      setTimeout(() => cbLeft.current(), 250)
    } else if (d > SWIPE_THRESHOLD) {
      exiting.current = true
      setState(s => ({ ...s, exitDir: 'right' }))
      setTimeout(() => cbRight.current(), 200)
    } else {
      currOffset.current = 0
      setState(s => ({ ...s, offset: 0 }))
    }
  }, [])

  useEffect(() => {
    const mm = (e: MouseEvent) => move(e.clientX, e.clientY)
    const mu = () => end()
    document.addEventListener('mousemove', mm)
    document.addEventListener('mouseup',   mu)
    return () => {
      document.removeEventListener('mousemove', mm)
      document.removeEventListener('mouseup',   mu)
    }
  }, [move, end])

  return {
    ...state,
    onTouchStart: (e: React.TouchEvent) => start(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove:  (e: React.TouchEvent) => move(e.touches[0].clientX,  e.touches[0].clientY),
    onTouchEnd:   end,
    onMouseDown:  (e: React.MouseEvent) => { e.preventDefault(); start(e.clientX, e.clientY) },
  }
}

interface PlaceCardProps {
  reel: ReelSubmission
  index?: number
  onReject: () => void
  onFavourite: () => void
  onDelete: () => void
  onOpen: () => void
}

export function PlaceCard({ reel, index = 0, onReject, onFavourite, onDelete, onOpen }: PlaceCardProps) {
  const [starPulse, setStarPulse] = useState(false)
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const clickBlocked = useRef(false)

  const handleReject = useCallback(() => {
    clickBlocked.current = true
    onReject()
  }, [onReject])

  const handleFavourite = useCallback(() => {
    clickBlocked.current = true
    setStarPulse(true)
    setTimeout(() => setStarPulse(false), 400)
    onFavourite()
  }, [onFavourite])

  const { offset, isDragging, exitDir, onTouchStart, onTouchMove, onTouchEnd, onMouseDown } =
    useSwipeGesture(handleReject, handleFavourite)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    clickBlocked.current = true
    if (window.confirm('Permanently delete this saved place?')) {
      onDelete()
    }
  }

  const isProcessing  = reel.confidence === null
  const isNeedsReview = reel.status === 'needs_review'
  const destination   = [reel.destination_city, reel.destination_country].filter(Boolean).join(', ')
  const flag          = countryFlag(reel.destination_country)
  const socialThumbnailUrl = reel.thumbnail_url
  const googleThumbnailUrl = googlePlacePhotoUrl(reel.google_photo_name, 640)
  const imageUrl =
    socialThumbnailUrl && failedThumbnailUrl !== socialThumbnailUrl
      ? socialThumbnailUrl
      : googleThumbnailUrl && failedThumbnailUrl !== googleThumbnailUrl
        ? googleThumbnailUrl
        : null

  const absOffset  = Math.abs(offset)
  const revealRatio = Math.min(absOffset / SWIPE_THRESHOLD, 1)

  const cardStyle: React.CSSProperties = exitDir
    ? {
        transform: `translateX(${exitDir === 'left' ? '-150%' : '150%'})`,
        opacity: 0,
        transition: 'transform 250ms ease-in, opacity 250ms ease-in',
      }
    : {
        transform: `translateX(${offset}px)`,
        transition: isDragging
          ? 'none'
          : 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }

  const hintBg = offset < -20
    ? `rgba(239,68,68,${revealRatio * 0.15})`
    : offset > 20
    ? `rgba(249,115,22,${revealRatio * 0.15})`
    : 'transparent'

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Swipe hint background */}
      <div
        className="absolute inset-0 rounded-xl flex items-center pointer-events-none"
        style={{ backgroundColor: hintBg }}
      >
        {offset < -20 && (
          <Trash2
            className="absolute right-3 text-red-500 size-5"
            style={{ opacity: revealRatio }}
            aria-hidden
          />
        )}
        {offset > 20 && (
          <Star
            className="absolute left-3 text-orange-500 size-5 fill-orange-400"
            style={{ opacity: revealRatio }}
            aria-hidden
          />
        )}
      </div>

      {/* Card */}
      <div
        className={cn(
          'relative bg-card border border-border rounded-xl overflow-hidden shadow-sm',
          'hover:shadow-lg hover:border-sky-200 transition-all duration-200 cursor-pointer select-none',
          'animate-in fade-in zoom-in-95 duration-300',
        )}
        style={{ ...cardStyle, boxShadow: 'var(--travel-card-shadow)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onClick={() => {
          if (clickBlocked.current) { clickBlocked.current = false; return }
          if (Math.abs(offset) > 5) return
          onOpen()
        }}
        role="button"
        tabIndex={0}
        aria-label={reel.place_name ?? 'Place'}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={reel.place_name ?? 'Place photo'}
              fill
              unoptimized
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 33vw"
              onError={() => setFailedThumbnailUrl(imageUrl)}
            />
          ) : (
            <div className={cn('absolute inset-0', placeGradient(reel.place_type))} />
          )}

          {isNeedsReview && (
            <span
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400 ring-1 ring-white"
              aria-label="Needs review"
            />
          )}
          {isProcessing && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              'absolute left-1.5 top-1.5 flex items-center justify-center',
              'size-8 rounded-full bg-black/45 text-white shadow-sm backdrop-blur',
              'transition-colors hover:bg-red-600',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            )}
            aria-label="Permanently delete saved place"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {/* Metadata */}
        <div className="p-2.5 space-y-1">
          <div className="flex items-center justify-between gap-1">
            {reel.place_type ? (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {PLACE_TYPE_LABEL[reel.place_type] ?? reel.place_type}
              </Badge>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setStarPulse(true)
                setTimeout(() => setStarPulse(false), 400)
                onFavourite()
              }}
              className={cn(
                'flex items-center justify-center -m-1 p-1 rounded-md',
                'min-w-[44px] min-h-[44px] shrink-0',
                'hover:bg-muted/60 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-label={reel.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={reel.is_favourite}
            >
              <Star
                className={cn(
                  'size-4 transition-colors',
                  reel.is_favourite ? 'fill-orange-400 text-orange-400' : 'text-muted-foreground',
                  starPulse && 'star-pulse',
                )}
              />
            </button>
          </div>

          {isProcessing ? (
            <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
          ) : (
            <p className="text-sm font-semibold font-serif leading-tight line-clamp-2 text-foreground">
              {reel.place_name ?? reel.destination_city ?? 'Unknown place'}
            </p>
          )}

          {destination && (
            <p className="text-xs text-muted-foreground leading-tight">
              {destination} {flag !== '🌍' ? flag : ''}
            </p>
          )}

          {reel.submitted_by_label && (
            <p className="text-[10px] text-muted-foreground/70 leading-tight">
              {reel.submitted_by_label}
            </p>
          )}

          {reel.notes && (
            <p className="text-xs text-muted-foreground italic line-clamp-1">
              &ldquo;{reel.notes}&rdquo;
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
