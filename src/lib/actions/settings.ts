'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function regenerateToken(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const newToken = crypto.randomBytes(32).toString('hex')

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ personal_api_token: newToken })
    .eq('id', user.id)

  if (error) throw new Error('Failed to regenerate token')

  revalidatePath('/settings')
}
