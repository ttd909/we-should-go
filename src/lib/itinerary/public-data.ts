import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { publicItinerarySnapshotSchema } from './publication'

export const getPublicItinerary = cache(async (shareSlug: string) => {
  if (!/^[a-f0-9]{32}$/.test(shareSlug)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_public_itinerary_snapshot', {
    p_share_slug: shareSlug,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row) return null
  const snapshot = publicItinerarySnapshotSchema.safeParse(row.snapshot)
  if (!snapshot.success) {
    console.error('Invalid public itinerary snapshot', { shareSlug, issues: snapshot.error.issues })
    return null
  }
  return {
    snapshot: snapshot.data,
    publishedAt: String(row.published_at),
    sourceVersion: Number(row.source_version),
  }
})
