'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function createDreamlist(name: string) {
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Dreamlist name is required')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: dreamlist, error } = await admin
    .from('dreamlists')
    .insert({
      name: cleanName,
      type: 'shared',
      owner_id: user.id,
    })
    .select('id')
    .single()

  if (error || !dreamlist) throw new Error(error?.message ?? 'Failed to create Dreamlist')

  const { error: memberError } = await admin
    .from('dreamlist_members')
    .insert({
      dreamlist_id: dreamlist.id,
      user_id: user.id,
      role: 'owner',
    })

  if (memberError) throw new Error(memberError.message)

  revalidatePath('/')
  revalidatePath('/dreamlists')
}

export async function createDreamlistInvite(dreamlistId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: membership } = await supabase
    .from('dreamlist_members')
    .select('role')
    .eq('dreamlist_id', dreamlistId)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (!membership) {
    throw new Error('Only the Dreamlist owner can create invite links')
  }

  const token = crypto.randomBytes(24).toString('hex')
  const { error } = await supabase
    .from('dreamlist_invites')
    .insert({
      dreamlist_id: dreamlistId,
      token,
      invited_by_user_id: user.id,
    })

  if (error) throw new Error(error.message)

  revalidatePath('/dreamlists')
  return token
}

export async function joinDreamlistByToken(token: string) {
  const cleanToken = token.trim()
  if (!cleanToken) throw new Error('Invite token is required')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: invite, error: inviteError } = await admin
    .from('dreamlist_invites')
    .select('id, dreamlist_id, expires_at, used_at')
    .eq('token', cleanToken)
    .maybeSingle()

  if (inviteError || !invite) throw new Error('Invite link not found')
  if (invite.used_at) throw new Error('This invite link has already been used')
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error('This invite link has expired')
  }

  const { error: memberError } = await admin
    .from('dreamlist_members')
    .upsert(
      {
        dreamlist_id: invite.dreamlist_id,
        user_id: user.id,
        role: 'member',
      },
      { onConflict: 'dreamlist_id,user_id' },
    )

  if (memberError) throw new Error(memberError.message)

  await admin
    .from('dreamlist_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id)

  revalidatePath('/')
  revalidatePath('/dreamlists')
  return invite.dreamlist_id as string
}
