'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function rejectReel(reelId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await supabase
    .from('reel_submissions')
    .delete()
    .eq('id', reelId)
    .eq('submitted_by_user_id', user.id)

  revalidatePath('/')
}

export async function softRejectReel(reelId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await supabase
    .from('reel_submissions')
    .update({ status: 'rejected' })
    .eq('id', reelId)
    .eq('submitted_by_user_id', user.id)

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
    .eq('submitted_by_user_id', user.id)

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
    .eq('submitted_by_user_id', user.id)

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
    .eq('submitted_by_user_id', user.id)

  revalidatePath('/')
}
