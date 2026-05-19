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
