import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DeleteReelButton } from './delete-reel-button'
import type { ReelSubmission } from '@/lib/types'

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  other: 'Other',
}

const PLACE_TYPE_LABEL: Record<string, string> = {
  cafe: 'Café',
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  viewpoint: 'Viewpoint',
  experience: 'Experience',
  other: 'Place',
}

export function ReelCard({ reel }: { reel: ReelSubmission }) {
  // confidence is null only while enrichment is still in flight
  const isProcessing = reel.confidence === null
  const destination = [reel.destination_city, reel.destination_country].filter(Boolean).join(', ')
  const needsReview = reel.confidence !== null && reel.confidence < 0.6

  return (
    <Card className={needsReview && !isProcessing ? 'border-amber-200 dark:border-amber-800' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {isProcessing ? (
              <p className="text-sm text-muted-foreground animate-pulse">Enriching…</p>
            ) : (
              <p className="text-sm font-medium truncate">
                {reel.place_name ?? reel.destination_city ?? 'Unknown place'}
              </p>
            )}
            {destination && (
              <p className="text-xs text-muted-foreground mt-0.5">{destination}</p>
            )}
            {!destination && reel.destination_region && (
              <p className="text-xs text-muted-foreground mt-0.5">{reel.destination_region}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0 flex-wrap justify-end">
            {reel.place_type && (
              <Badge variant="secondary" className="text-xs">
                {PLACE_TYPE_LABEL[reel.place_type] ?? reel.place_type}
              </Badge>
            )}
            {needsReview && !isProcessing && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Review
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {reel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {reel.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {reel.notes && (
          <p className="text-xs text-muted-foreground italic">&ldquo;{reel.notes}&rdquo;</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {PLATFORM_LABEL[reel.platform] ?? reel.platform}
          </span>
          <div className="flex items-center gap-3">
            <a
              href={reel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline underline-offset-2"
            >
              View original ↗
            </a>
            <DeleteReelButton reelId={reel.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
