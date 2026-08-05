'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const requestSchema = z.object({ tripId: z.string().uuid() }).strict()

export type PublishItineraryResult =
  | { ok: true; shareSlug: string; publishedAt: string; sourceVersion: number }
  | { ok: false; message: string }

export async function publishItinerary(input: unknown): Promise<PublishItineraryResult> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Invalid publishing request.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }

  const { data, error } = await supabase.rpc('publish_itinerary_snapshot', {
    p_trip_id: parsed.data.tripId,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row?.share_slug || !row?.published_at) {
    console.error('Could not publish itinerary snapshot', { tripId: parsed.data.tripId, error })
    return { ok: false, message: 'Could not publish the itinerary. Make sure the public-itinerary migration has been run.' }
  }

  revalidatePath(`/trips/${parsed.data.tripId}`)
  revalidatePath(`/itinerary/${row.share_slug}`)
  return {
    ok: true,
    shareSlug: row.share_slug,
    publishedAt: row.published_at,
    sourceVersion: row.source_version,
  }
}
export async function unpublishItinerary(input: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Invalid unpublish request.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }

  const { data: existing } = await supabase.from('published_itineraries')
    .select('share_slug').eq('trip_id', parsed.data.tripId).maybeSingle()
  const { error } = await supabase.rpc('unpublish_itinerary_snapshot', {
    p_trip_id: parsed.data.tripId,
  })
  if (error) {
    console.error('Could not unpublish itinerary snapshot', { tripId: parsed.data.tripId, error })
    return { ok: false, message: 'Could not disable the public itinerary link.' }
  }

  revalidatePath(`/trips/${parsed.data.tripId}`)
  if (existing?.share_slug) revalidatePath(`/itinerary/${existing.share_slug}`)
  return { ok: true }
}
