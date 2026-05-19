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
  cafe:        'bg-[linear-gradient(135deg,#fff7ed_0%,#fed7aa_48%,#f97316_130%)]',
  restaurant:  'bg-[linear-gradient(135deg,#fff1f2_0%,#fecdd3_52%,#ef4444_130%)]',
  hotel:       'bg-[linear-gradient(135deg,#eff6ff_0%,#bae6fd_50%,#0284c7_130%)]',
  viewpoint:   'bg-[linear-gradient(135deg,#ecfeff_0%,#99f6e4_48%,#0f766e_130%)]',
  experience:  'bg-[linear-gradient(135deg,#faf5ff_0%,#ddd6fe_50%,#7c3aed_130%)]',
  other:       'bg-[linear-gradient(135deg,#f8fafc_0%,#e2e8f0_50%,#64748b_130%)]',
  unknown:     'bg-[linear-gradient(135deg,#f8fafc_0%,#e2e8f0_50%,#64748b_130%)]',
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
