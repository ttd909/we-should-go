'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { travelPreferencesSchema } from '@/lib/itinerary/schemas'
import type { PreferencesActionResult } from '@/lib/itinerary/action-types'

const requestSchema = z.object({
  tripId: z.string().uuid(),
  preferences: travelPreferencesSchema,
}).strict()

export async function saveTravelPreferences(input: unknown): Promise<PreferencesActionResult> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Check the travel preferences and try again.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }

  const { error } = await supabase.from('trips')
    .update({ travel_preferences: parsed.data.preferences })
    .eq('id', parsed.data.tripId)
  if (error) return { ok: false, message: 'Could not save the travel preferences.' }
  revalidatePath(`/trips/${parsed.data.tripId}`)
  return { ok: true }
}

const dreamlistRequestSchema = z.object({
  dreamlistId: z.string().uuid(),
  preferences: travelPreferencesSchema,
}).strict()

export async function saveDreamlistTravelPreferences(input: unknown): Promise<PreferencesActionResult> {
  const parsed = dreamlistRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Check the family preferences and try again.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }
  const { error } = await supabase.from('dreamlists')
    .update({ travel_preferences: parsed.data.preferences })
    .eq('id', parsed.data.dreamlistId)
    .eq('owner_id', user.id)
  if (error) return { ok: false, message: 'Could not save the family preferences.' }
  revalidatePath('/dreamlists')
  revalidatePath('/trips')
  return { ok: true }
}
