import type { PlaceType } from '@/lib/types'

export const PLACE_TYPE_LABEL: Record<string, string> = {
  cafe: 'Café',
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  viewpoint: 'Viewpoint',
  experience: 'Experience',
  other: 'Place',
}

export const PLACE_TYPE_GRADIENT: Record<PlaceType | 'unknown', string> = {
  cafe:        'bg-gradient-to-br from-amber-50 to-orange-100',
  restaurant:  'bg-gradient-to-br from-red-50 to-rose-100',
  hotel:       'bg-gradient-to-br from-sky-50 to-blue-100',
  viewpoint:   'bg-gradient-to-br from-cyan-50 to-teal-100',
  experience:  'bg-gradient-to-br from-violet-50 to-purple-100',
  other:       'bg-gradient-to-br from-stone-50 to-zinc-100',
  unknown:     'bg-gradient-to-br from-stone-50 to-zinc-100',
}

export function placeGradient(type: PlaceType | null | undefined): string {
  return PLACE_TYPE_GRADIENT[type ?? 'unknown']
}

export function googleMapsUrl(reel: {
  place_name: string | null
  address: string | null
  google_place_id: string | null
  latitude: number | null
  longitude: number | null
}): string | null {
  const query = reel.place_name ?? reel.address ?? null
  if (query && reel.google_place_id) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(reel.google_place_id)}`
  }
  if (reel.latitude !== null && reel.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${reel.latitude},${reel.longitude}`
  }
  return null
}
