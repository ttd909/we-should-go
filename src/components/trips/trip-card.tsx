import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Trip, TripStatus } from '@/lib/types'

const STATUS_LABEL: Record<TripStatus, string> = {
  idea: 'Idea',
  planning: 'Planning',
  booked: 'Booked',
  completed: 'Completed',
}

export function TripCard({ trip }: { trip: Trip }) {
  const destination = [trip.destination_city, trip.destination_country]
    .filter(Boolean)
    .join(', ')

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium">{trip.name}</CardTitle>
          <Badge variant="secondary" className="shrink-0">
            {STATUS_LABEL[trip.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-0.5">
        {destination && <p>{destination}</p>}
        {trip.destination_region && !destination && <p>{trip.destination_region}</p>}
        {trip.start_date && trip.end_date ? (
          <p>
            {trip.start_date} → {trip.end_date}
          </p>
        ) : (
          <p>No dates yet</p>
        )}
      </CardContent>
    </Card>
  )
}
