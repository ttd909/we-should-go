'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Drawer } from '@base-ui/react/drawer'
import { X, MapPin, ExternalLink, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { countryFlag } from '@/lib/country-flag'
import { PLACE_TYPE_LABEL, placeGradient, googleMapsUrl } from './card-utils'
import type { ReelSubmission } from '@/lib/types'

interface DetailDrawerProps {
  reel: ReelSubmission | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFavourite?: () => void
}

export function DetailDrawer({ reel, open, onOpenChange, onFavourite }: DetailDrawerProps) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)

  if (!reel) return null

  const destination = [reel.destination_city, reel.destination_country].filter(Boolean).join(', ')
  const flag = countryFlag(reel.destination_country)
  const mapsUrl = googleMapsUrl(reel)
  const thumbnailUrl = reel.thumbnail_url
  const showThumbnail = thumbnailUrl && failedThumbnailUrl !== thumbnailUrl

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop className="drawer-backdrop fixed inset-0 bg-black/50 z-40" />
        <Drawer.Popup
          className={cn(
            'drawer-popup fixed bottom-0 left-0 right-0 z-50',
            'bg-background rounded-t-2xl shadow-2xl',
            'max-h-[90dvh] flex flex-col',
            'focus:outline-none',
          )}
        >
          {/* Drag handle */}
          <div className="shrink-0 flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Close button */}
          <div className="flex justify-end px-4 pb-1 shrink-0">
            <Drawer.Close
              className="flex items-center justify-center size-8 rounded-full hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="size-4 text-muted-foreground" />
            </Drawer.Close>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 pb-8">
            {/* Thumbnail */}
            <div className="relative aspect-video mx-4 rounded-xl overflow-hidden mb-4">
              {showThumbnail ? (
                <Image
                  src={thumbnailUrl}
                  alt={reel.place_name ?? 'Place photo'}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="100vw"
                  onError={() => setFailedThumbnailUrl(thumbnailUrl)}
                />
              ) : (
                <div className={cn('absolute inset-0', placeGradient(reel.place_type))} />
              )}
            </div>

            <div className="px-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Drawer.Title
                    className="text-xl font-semibold font-serif leading-snug text-foreground"
                  >
                    {reel.place_name ?? reel.destination_city ?? 'Unknown place'}
                  </Drawer.Title>
                  {reel.place_type && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {PLACE_TYPE_LABEL[reel.place_type] ?? reel.place_type}
                    </Badge>
                  )}
                </div>

                {/* Star */}
                <button
                  type="button"
                  onClick={onFavourite}
                  className={cn(
                    'shrink-0 flex items-center justify-center size-11 rounded-full',
                    'hover:bg-muted transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                  aria-label={reel.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
                  aria-pressed={reel.is_favourite}
                >
                  <Star
                    className={cn(
                      'size-5 transition-colors',
                      reel.is_favourite ? 'fill-orange-400 text-orange-400' : 'text-muted-foreground',
                    )}
                  />
                </button>
              </div>

              {/* Destination */}
              {destination && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" />
                  {destination}
                  {flag !== '🌍' && <span>{flag}</span>}
                </p>
              )}

              {/* Address */}
              {reel.address && (
                <p className="text-sm text-muted-foreground">{reel.address}</p>
              )}

              {/* Who saved it */}
              {reel.submitted_by_label && (
                <p className="text-xs text-muted-foreground">
                  Saved by <span className="font-medium text-foreground">{reel.submitted_by_label}</span>
                </p>
              )}

              {/* Note */}
              {reel.notes && (
                <div className="bg-muted/50 rounded-lg px-3 py-2.5">
                  <p className="text-sm italic text-muted-foreground">&ldquo;{reel.notes}&rdquo;</p>
                </div>
              )}

              {/* Tags */}
              {reel.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {reel.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action links */}
              <div className="flex gap-3 pt-1">
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'flex items-center gap-1.5 text-sm text-sky-600 font-medium',
                      'hover:text-sky-700 transition-colors',
                    )}
                  >
                    <MapPin className="size-3.5" />
                    Google Maps
                    <ExternalLink className="size-3" />
                  </a>
                )}
                <a
                  href={reel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-1.5 text-sm text-sky-600 font-medium',
                    'hover:text-sky-700 transition-colors',
                  )}
                >
                  View original
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
