export interface Coordinates {
  latitude: number | null
  longitude: number | null
}

const EARTH_RADIUS_KM = 6371
const WALK_THRESHOLD_KM = 1

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(value))
}

export function estimateTravelMinutes(a: Coordinates, b: Coordinates): number | null {
  if (a.latitude === null || a.longitude === null) return null
  if (b.latitude === null || b.longitude === null) return null
  const km = haversineKm(
    { latitude: a.latitude, longitude: a.longitude },
    { latitude: b.latitude, longitude: b.longitude },
  )
  if (km <= WALK_THRESHOLD_KM) return Math.max(1, Math.round(km * 13))
  return Math.round(km * 3 + 8)
}
