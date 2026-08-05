import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItineraryBlock } from '@/lib/types'
import type { ItineraryIssue } from './validate'
import type { ItineraryPatch } from './patch'

interface CommitInput {
  tripId: string
  expectedVersion: number
  clientRequestId: string
  summary: string
  patches: ItineraryPatch[]
  inversePatches: ItineraryPatch[]
  removedIds: string[]
  blocks: ItineraryBlock[]
  warningOverrides: ItineraryIssue[]
  sourceMessageId?: string | null
  undoesEditId?: string | null
}

function databaseBlock(block: ItineraryBlock) {
  return {
    id: block.id,
    day_date: block.day_date,
    start_time: block.start_time,
    duration_min: block.duration_min,
    sort_order: block.sort_order,
    time_source: block.time_source,
    title: block.title,
    type: block.type,
    notes: block.notes,
    is_locked: block.is_locked,
    confirmation_ref: block.confirmation_ref,
    confidence: block.confidence,
    timezone: block.timezone,
    end_date: block.end_date,
    end_time: block.end_time,
    end_timezone: block.end_timezone,
    reel_submission_id: block.reel_submission_id,
    google_place_id: block.google_place_id,
    opening_hours: block.opening_hours,
    address: block.address,
    latitude: block.latitude,
    longitude: block.longitude,
  }
}

export async function commitItineraryEdit(
  supabase: SupabaseClient,
  input: CommitInput,
): Promise<{ editId: string; version: number }> {
  const { data, error } = await supabase.rpc('apply_itinerary_edit', {
    p_trip_id: input.tripId,
    p_expected_version: input.expectedVersion,
    p_client_request_id: input.clientRequestId,
    p_summary: input.summary,
    p_patches: input.patches,
    p_inverse_patches: input.inversePatches,
    p_removed_ids: input.removedIds,
    p_blocks: input.blocks.map(databaseBlock),
    p_warning_overrides: input.warningOverrides,
    p_source_message_id: input.sourceMessageId ?? null,
    p_undoes_edit_id: input.undoesEditId ?? null,
  })

  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.edit_id || !Number.isInteger(row.trip_version)) {
    throw new Error('The itinerary edit did not return a valid result.')
  }
  return { editId: row.edit_id as string, version: row.trip_version as number }
}
