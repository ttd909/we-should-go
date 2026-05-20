'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteReel(reelId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await supabase
    .from('reel_submissions')
    .delete()
    .eq('id', reelId)

  revalidatePath('/')
}

export const rejectReel = deleteReel

export async function softRejectReel(reelId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await supabase
    .from('reel_submissions')
    .update({ status: 'rejected' })
    .eq('id', reelId)

  revalidatePath('/')
}

export async function unrejectReel(reelId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await supabase
    .from('reel_submissions')
    .update({ status: 'inbox' })
    .eq('id', reelId)

  revalidatePath('/')
}

export async function toggleFavourite(reelId: string, currentValue: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await supabase
    .from('reel_submissions')
    .update({ is_favourite: !currentValue })
    .eq('id', reelId)

  revalidatePath('/')
}

export async function resolveNeedsReview(reelId: string, placeName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await supabase
    .from('reel_submissions')
    .update({ place_name: placeName.trim(), status: 'inbox' })
    .eq('id', reelId)

  revalidatePath('/')
}

export async function copyIdeaToDreamlist(reelId: string, targetDreamlistId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: targetMembership } = await supabase
    .from('dreamlist_members')
    .select('id')
    .eq('dreamlist_id', targetDreamlistId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!targetMembership) {
    throw new Error('You can only copy ideas to Dreamlists you belong to')
  }

  const { data: source, error: sourceError } = await supabase
    .from('reel_submissions')
    .select('*')
    .eq('id', reelId)
    .single()

  if (sourceError || !source) {
    throw new Error(sourceError?.message ?? 'Idea not found')
  }

  const copiedStatus = source.status === 'needs_review' ? 'needs_review' : 'saved'
  const { error: insertError } = await supabase
    .from('reel_submissions')
    .insert({
      dreamlist_id: targetDreamlistId,
      submitted_by_user_id: user.id,
      submitted_by_label: source.submitted_by_label,
      platform: source.platform,
      url: source.url,
      url_hash: source.url_hash,
      caption_text: source.caption_text,
      notes: source.notes,
      place_name: source.place_name,
      google_place_id: source.google_place_id,
      google_photo_name: source.google_photo_name,
      address: source.address,
      latitude: source.latitude,
      longitude: source.longitude,
      destination_city: source.destination_city,
      destination_country: source.destination_country,
      destination_region: source.destination_region,
      place_type: source.place_type,
      tags: source.tags ?? [],
      is_favourite: source.is_favourite,
      confidence: source.confidence,
      priority: source.priority ?? 'normal',
      trip_id: null,
      status: copiedStatus,
      thumbnail_url: source.thumbnail_url,
      source_idea_id: source.id,
      copied_from_dreamlist_id: source.dreamlist_id,
      copied_by_user_id: user.id,
    })

  if (insertError) throw new Error(insertError.message)

  revalidatePath('/')
}
