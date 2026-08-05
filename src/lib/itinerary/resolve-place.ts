import type { OpeningHours } from '@/lib/types'

export interface ResolvedPlace {
  google_place_id: string | null
  opening_hours: OpeningHours | null
  address: string | null
  latitude: number | null
  longitude: number | null
}

interface GooglePeriodPoint { day?: number; hour?: number; minute?: number }
interface GooglePeriod { open?: GooglePeriodPoint; close?: GooglePeriodPoint }

function pointTime(point: GooglePeriodPoint): string {
  return `${String(point.hour ?? 0).padStart(2, '0')}:${String(point.minute ?? 0).padStart(2, '0')}`
}

function normalizeHours(periods: GooglePeriod[] | undefined): OpeningHours | null {
  if (!periods?.length) return null
  if (periods.length === 1 && periods[0].open?.day === 0 && !periods[0].close) {
    return { always_open: true, periods: [] }
  }
  return {
    periods: periods.flatMap((period) => period.open && period.close ? [{
      open_day: period.open.day ?? 0,
      open: pointTime(period.open),
      close_day: period.close.day ?? period.open.day ?? 0,
      close: pointTime(period.close),
    }] : []),
  }
}

export async function resolvePlace(query: string, destination: string): Promise<ResolvedPlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.formattedAddress,places.location,places.regularOpeningHours',
    },
    body: JSON.stringify({ textQuery: [query, destination].filter(Boolean).join(', '), maxResultCount: 1 }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return null
  const payload = await response.json() as {
    places?: Array<{
      id?: string
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
      regularOpeningHours?: { periods?: GooglePeriod[] }
    }>
  }
  const place = payload.places?.[0]
  if (!place) return null
  return {
    google_place_id: place.id ?? null,
    opening_hours: normalizeHours(place.regularOpeningHours?.periods),
    address: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
  }
}
