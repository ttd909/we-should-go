'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ItineraryBlock, ItineraryEditSet, ReelSubmission, Trip, TripChatMessage, TravelPreferences } from '@/lib/types'
import type { ChatActionResult, ItineraryActionResult } from '@/lib/itinerary/action-types'
import { commitItineraryEdit } from '@/lib/itinerary/commit'
import {
  itineraryBlockSchema,
  itineraryPatchListSchema,
  newBlockInputSchema,
} from '@/lib/itinerary/schemas'
import {
  affectedDays,
  applyPatches,
  invertPatches,
  removedBlockIds,
  type ItineraryPatch,
  type TrustedBlockFields,
} from '@/lib/itinerary/patch'
import { validateItinerary, validateLockedChanges } from '@/lib/itinerary/validate'
import { buildItineraryContext } from '@/lib/itinerary/context'
import { proposeItineraryEdit, proposeItineraryPhoto } from '@/lib/itinerary/model'
import { resolvePlace } from '@/lib/itinerary/resolve-place'
import { estimateItineraryCost } from '@/lib/itinerary/cost'

const baseRequestSchema = z.object({
  tripId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  clientRequestId: z.string().uuid(),
  allowWarnings: z.boolean().default(false),
  allowLocked: z.boolean().default(false),
}).strict()

const saveBlockRequestSchema = baseRequestSchema.extend({
  blockId: z.string().uuid().nullable(),
  block: newBlockInputSchema,
}).strict()

const deleteBlockRequestSchema = baseRequestSchema.extend({
  blockId: z.string().uuid(),
}).strict()

const undoRequestSchema = baseRequestSchema.extend({
  editId: z.string().uuid(),
}).strict()

const chatRequestSchema = z.object({
  tripId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  clientRequestId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
}).strict()

const resolveRequestSchema = z.object({
  tripId: z.string().uuid(),
  editId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  clientRequestId: z.string().uuid(),
  resolution: z.enum(['apply_reviewed', 'allow_warnings', 'allow_overlap', 'allow_locked', 'allow_all_reviewed', 'discard']),
  selectedBlockIds: z.array(z.string().uuid()).max(100).optional(),
}).strict()

const photoRequestSchema = z.object({
  tripId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  clientRequestId: z.string().uuid(),
  imagePath: z.string().min(1).max(500),
  instruction: z.string().trim().max(2000).default('Extract the travel or booking details and propose itinerary items.'),
}).strict()

const reorderRequestSchema = baseRequestSchema.extend({
  dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blockIds: z.array(z.string().uuid()).min(1).max(200),
}).strict()

interface ItineraryState {
  trip: Trip
  blocks: ItineraryBlock[]
}

async function loadItineraryState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
): Promise<ItineraryState> {
  const [{ data: tripData, error: tripError }, { data: blockData, error: blockError }] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).single(),
    supabase.from('itinerary_blocks').select('*').eq('trip_id', tripId)
      .order('day_date').order('start_time').order('sort_order'),
  ])

  if (tripError || !tripData) throw new Error('Trip not found')
  if (blockError) throw new Error(blockError.message)

  const parsed = z.array(itineraryBlockSchema).safeParse(blockData ?? [])
  if (!parsed.success) throw new Error('Stored itinerary data is invalid')
  return { trip: tripData as Trip, blocks: parsed.data as ItineraryBlock[] }
}

function failure(error: unknown): ItineraryActionResult {
  const message = error instanceof Error ? error.message : 'Unable to update the itinerary.'
  if (message.includes('stale_trip_version')) {
    return { ok: false, code: 'stale', message: 'This trip changed elsewhere. Refresh and try again.' }
  }
  if (message === 'Trip not found') return { ok: false, code: 'not_found', message }
  return { ok: false, code: 'database', message: 'The itinerary could not be saved. Please try again.' }
}

async function authenticate() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}

async function validateAndCommit(
  state: ItineraryState,
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: z.infer<typeof baseRequestSchema>,
  patches: ItineraryPatch[],
  summary: string,
  undoesEditId?: string,
  allowedConflictTypes: Set<'overlap' | 'locked_conflict'> = new Set(),
): Promise<ItineraryActionResult> {
  let after: ItineraryBlock[]
  try {
    after = applyPatches(state.blocks, patches)
  } catch {
    return { ok: false, code: 'validation', message: 'This edit refers to an item that no longer exists.' }
  }

  const allowedLockedIds = request.allowLocked
    ? new Set(patches.flatMap((patch) => 'id' in patch ? [patch.id] : []))
    : new Set<string>()
  const lockConflicts = validateLockedChanges(state.blocks, patches, allowedLockedIds)
  const validation = validateItinerary(after, state.trip, affectedDays(state.blocks, patches))
  const conflicts = [...lockConflicts, ...validation.conflicts]
    .filter((issue) => !allowedConflictTypes.has(issue.type as 'overlap' | 'locked_conflict'))

  if (conflicts.length > 0) {
    return {
      ok: false,
      code: 'confirmation_required',
      message: 'Resolve the highlighted conflict before saving.',
      conflicts,
      warnings: validation.warnings,
    }
  }
  if (validation.warnings.length > 0 && !request.allowWarnings) {
    return {
      ok: false,
      code: 'confirmation_required',
      message: 'Please review these travel warnings.',
      warnings: validation.warnings,
    }
  }

  const inversePatches = invertPatches(state.blocks, patches)
  try {
    const committed = await commitItineraryEdit(supabase, {
      tripId: request.tripId,
      expectedVersion: request.expectedVersion,
      clientRequestId: request.clientRequestId,
      summary,
      patches,
      inversePatches,
      removedIds: removedBlockIds(state.blocks, after),
      blocks: after,
      warningOverrides: request.allowWarnings ? validation.warnings : [],
      undoesEditId,
    })
    revalidatePath(`/trips/${request.tripId}`)
    revalidatePath('/trips')
    return { ok: true, editId: committed.editId, version: committed.version }
  } catch (error) {
    return failure(error)
  }
}

export async function saveItineraryBlock(input: unknown): Promise<ItineraryActionResult> {
  const parsed = saveBlockRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: 'validation', message: 'Check the title, date, time and duration.' }
  }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, code: 'unauthorized', message: 'Please sign in again.' }

  try {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    let patches: ItineraryPatch[]
    let summary: string
    if (!parsed.data.blockId) {
      patches = [{ op: 'add_block', id: randomUUID(), block: parsed.data.block }]
      summary = `Added ${parsed.data.block.title}`
    } else {
      const existing = state.blocks.find((block) => block.id === parsed.data.blockId)
      if (!existing) return { ok: false, code: 'not_found', message: 'That itinerary item no longer exists.' }
      const { day_date, start_time } = parsed.data.block
      const changes = {
        title: parsed.data.block.title,
        type: parsed.data.block.type,
        duration_min: parsed.data.block.duration_min,
        time_source: parsed.data.block.time_source,
        notes: parsed.data.block.notes,
        is_locked: parsed.data.block.is_locked,
        confirmation_ref: parsed.data.block.confirmation_ref,
        confidence: parsed.data.block.confidence,
        timezone: parsed.data.block.timezone,
        end_date: parsed.data.block.end_date,
        end_time: parsed.data.block.end_time,
        end_timezone: parsed.data.block.end_timezone,
        reel_submission_id: parsed.data.block.reel_submission_id,
      }
      patches = [
        { op: 'move_block', id: existing.id, day_date, start_time },
        { op: 'update_block', id: existing.id, changes },
      ]
      summary = `Updated ${parsed.data.block.title}`
    }
    return validateAndCommit(state, supabase, parsed.data, patches, summary)
  } catch (error) {
    return failure(error)
  }
}

export async function deleteItineraryBlock(input: unknown): Promise<ItineraryActionResult> {
  const parsed = deleteBlockRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'validation', message: 'Invalid delete request.' }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, code: 'unauthorized', message: 'Please sign in again.' }

  try {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    const block = state.blocks.find((candidate) => candidate.id === parsed.data.blockId)
    if (!block) return { ok: false, code: 'not_found', message: 'That itinerary item no longer exists.' }
    return validateAndCommit(
      state, supabase, parsed.data,
      [{ op: 'remove_block', id: block.id }],
      `Removed ${block.title}`,
    )
  } catch (error) {
    return failure(error)
  }
}

export async function undoItineraryEdit(input: unknown): Promise<ItineraryActionResult> {
  const parsed = undoRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'validation', message: 'Invalid undo request.' }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, code: 'unauthorized', message: 'Please sign in again.' }

  try {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    const { data, error } = await supabase.from('itinerary_edit_sets').select('*')
      .eq('id', parsed.data.editId).eq('trip_id', parsed.data.tripId).eq('status', 'applied').single()
    if (error || !data) return { ok: false, code: 'not_found', message: 'That change can no longer be undone.' }
    const edit = data as ItineraryEditSet
    if (edit.expected_version + 1 !== state.trip.version) {
      return { ok: false, code: 'stale', message: 'Only the most recent change can be undone.' }
    }
    const inverse = itineraryPatchListSchema.safeParse(edit.inverse_patches)
    if (!inverse.success) return { ok: false, code: 'database', message: 'The saved undo data is invalid.' }
    return validateAndCommit(
      state, supabase, parsed.data, inverse.data as ItineraryPatch[],
      `Undid: ${edit.summary ?? 'previous change'}`, edit.id,
    )
  } catch (error) {
    return failure(error)
  }
}

export async function reorderItineraryDay(input: unknown): Promise<ItineraryActionResult> {
  const parsed = reorderRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'validation', message: 'Invalid reorder request.' }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, code: 'unauthorized', message: 'Please sign in again.' }
  try {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    return validateAndCommit(
      state, supabase, parsed.data,
      [{ op: 'reorder_day', day_date: parsed.data.dayDate, block_ids: parsed.data.blockIds }],
      `Reordered ${parsed.data.dayDate}`,
    )
  } catch (error) {
    return failure(error)
  }
}

function chatFailure(error: unknown): ChatActionResult {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('stale_trip_version')) {
    return { ok: false, code: 'stale', message: 'This trip changed elsewhere. Refresh and send again.' }
  }
  return { ok: false, code: 'provider', message: 'The itinerary assistant could not complete that request. Your message was saved; please retry.' }
}

async function saveUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  values: {
    userId: string
    tripId: string
    requestId: string
    model: string
    inputTokens: number
    outputTokens: number
    latencyMs: number
    outcome: 'applied' | 'pending' | 'rejected' | 'error'
  },
) {
  await supabase.from('itinerary_ai_usage').upsert({
    user_id: values.userId,
    trip_id: values.tripId,
    request_id: values.requestId,
    model: values.model,
    input_tokens: values.inputTokens,
    output_tokens: values.outputTokens,
    estimated_cost_usd: estimateItineraryCost(values.inputTokens, values.outputTokens),
    latency_ms: values.latencyMs,
    outcome: values.outcome,
  }, { onConflict: 'trip_id,request_id' })
}

function ideaType(idea: ReelSubmission): ItineraryBlock['type'] {
  return idea.place_type === 'cafe' || idea.place_type === 'restaurant' ? 'meal' : 'place'
}

async function trustedPatches(
  proposal: Awaited<ReturnType<typeof proposeItineraryEdit>>['proposal'],
  state: ItineraryState,
  ideas: ReelSubmission[],
): Promise<ItineraryPatch[]> {
  const blockIds = new Set(state.blocks.map((block) => block.id))
  const ideaMap = new Map(ideas.map((idea) => [idea.id, idea]))
  const refs = new Set<string>()
  const result: ItineraryPatch[] = []
  const destination = [state.trip.destination_city, state.trip.destination_country].filter(Boolean).join(', ')

  for (const patch of proposal.patches) {
    if ('id' in patch && !blockIds.has(patch.id)) throw new Error('Unknown itinerary Block reference')
    if (patch.op === 'add_block') {
      if (refs.has(patch.client_ref)) throw new Error('Duplicate new Block reference')
      refs.add(patch.client_ref)
      const idea = patch.block.idea_id ? ideaMap.get(patch.block.idea_id) : undefined
      if (patch.block.idea_id && !idea) throw new Error('Unknown Idea reference')
      let trusted: TrustedBlockFields | undefined = idea ? {
        google_place_id: idea.google_place_id,
        opening_hours: null,
        address: idea.address,
        latitude: idea.latitude,
        longitude: idea.longitude,
      } : undefined
      if (!idea && (patch.block.type === 'place' || patch.block.type === 'meal')) {
        try { trusted = await resolvePlace(patch.block.title, destination) ?? undefined } catch { trusted = undefined }
      }
      result.push({
        op: 'add_block',
        id: randomUUID(),
        block: {
          title: idea?.place_name ?? patch.block.title,
          type: idea ? ideaType(idea) : patch.block.type,
          day_date: patch.block.day_date,
          start_time: patch.block.start_time,
          duration_min: patch.block.duration_min,
          sort_order: 0,
          time_source: patch.block.time_source,
          notes: patch.block.notes,
          is_locked: patch.block.is_locked,
          confirmation_ref: patch.block.confirmation_ref,
          confidence: patch.block.confidence,
          timezone: null,
          end_date: null,
          end_time: null,
          end_timezone: null,
          reel_submission_id: idea?.id ?? null,
        },
        trusted,
      })
      continue
    }
    if (patch.op === 'update_block') {
      const changes = Object.fromEntries(
        Object.entries(patch.changes)
          .filter(([key, value]) => key !== 'idea_id' && value !== null),
      )
      if (Object.keys(changes).length === 0) continue
      result.push({ op: 'update_block', id: patch.id, changes })
      continue
    }
    if (patch.op === 'move_block') {
      result.push({
        op: 'move_block', id: patch.id,
        ...(patch.day_date ? { day_date: patch.day_date } : {}),
        start_time: patch.start_time,
      })
      continue
    }
    result.push(patch)
  }
  if (!result.length) throw new Error('The proposal did not contain a usable change')
  return result
}

export async function sendItineraryMessage(input: unknown): Promise<ChatActionResult> {
  const parsed = chatRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'validation', message: 'Enter a short itinerary request.' }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, code: 'unauthorized', message: 'Please sign in again.' }
  if (process.env.ITINERARY_AI_ENABLED === 'false') {
    return { ok: false, code: 'provider', message: 'AI planning is temporarily paused. Manual itinerary editing is still available.' }
  }

  const { data: duplicate } = await supabase.from('trip_chat_messages').select('id')
    .eq('trip_id', parsed.data.tripId).eq('client_request_id', parsed.data.clientRequestId).maybeSingle()
  if (duplicate) {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    return { ok: true, status: 'duplicate', version: state.trip.version }
  }

  const { data: rateData, error: rateError } = await supabase.rpc('consume_itinerary_rate_limit', {
    p_trip_id: parsed.data.tripId, p_minute_limit: 6, p_day_limit: 60,
  })
  const rate = Array.isArray(rateData) ? rateData[0] : rateData
  if (rateError) return { ok: false, code: 'database', message: 'Could not check the assistant limit.' }
  if (!rate?.allowed) return { ok: false, code: 'rate_limited', message: `Please wait about ${rate?.retry_after_seconds ?? 60} seconds before trying again.` }

  const { data: userMessage, error: messageError } = await supabase.from('trip_chat_messages').insert({
    trip_id: parsed.data.tripId,
    role: 'user',
    content: parsed.data.message,
    client_request_id: parsed.data.clientRequestId,
    created_by_user_id: user.id,
  }).select('*').single()
  if (messageError || !userMessage) return { ok: false, code: 'database', message: 'Could not save your message.' }

  const started = Date.now()
  let modelName = process.env.ITINERARY_MODEL ?? 'claude-sonnet-4-6'
  try {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    if (state.trip.version !== parsed.data.expectedVersion) {
      return { ok: false, code: 'stale', message: 'The trip changed before this request started. Refresh and send again.' }
    }
    const [{ data: dreamlist }, { data: ideasData }, { data: messagesData }] = await Promise.all([
      supabase.from('dreamlists').select('travel_preferences').eq('id', state.trip.dreamlist_id).single(),
      supabase.from('reel_submissions').select('*').eq('dreamlist_id', state.trip.dreamlist_id).order('created_at', { ascending: false }).limit(100),
      supabase.from('trip_chat_messages').select('*').eq('trip_id', parsed.data.tripId).order('created_at', { ascending: true }).limit(20),
    ])
    const ideas = (ideasData ?? []) as ReelSubmission[]
    const context = buildItineraryContext({
      trip: state.trip,
      dreamlistPreferences: (dreamlist?.travel_preferences ?? {}) as TravelPreferences,
      blocks: state.blocks,
      ideas,
      messages: (messagesData ?? []) as TripChatMessage[],
      instruction: parsed.data.message,
    })
    const model = await proposeItineraryEdit(context)
    modelName = model.model
    const patches = await trustedPatches(model.proposal, state, ideas)
    const after = applyPatches(state.blocks, patches)
    const inverse = invertPatches(state.blocks, patches)
    const validation = validateItinerary(after, state.trip, affectedDays(state.blocks, patches))
    const lockConflicts = validateLockedChanges(state.blocks, patches)
    const conflicts = [...lockConflicts, ...validation.conflicts]

    const isDraftRequest = /\b(build|create|make|plan|draft)\b.*\b(day|days|trip|itinerary|ideas?)\b/i.test(parsed.data.message)
    if (conflicts.length || validation.warnings.length || (isDraftRequest && patches.length > 1)) {
      const { data: pending, error: pendingError } = await supabase.from('itinerary_edit_sets').insert({
        trip_id: state.trip.id,
        source_message_id: userMessage.id,
        client_request_id: parsed.data.clientRequestId,
        expected_version: state.trip.version,
        status: 'pending',
        summary: model.proposal.summary,
        patches,
        inverse_patches: inverse,
        hard_conflicts: conflicts,
        warnings: validation.warnings,
        created_by_user_id: user.id,
      }).select('id').single()
      if (pendingError || !pending) throw new Error('Could not save pending proposal')
      await supabase.from('trip_chat_messages').insert({
        trip_id: state.trip.id, role: 'assistant', content: model.proposal.summary,
        reply_to_message_id: userMessage.id, created_by_user_id: user.id,
      })
      await saveUsage(supabase, {
        userId: user.id, tripId: state.trip.id, requestId: parsed.data.clientRequestId,
        model: model.model, inputTokens: model.inputTokens, outputTokens: model.outputTokens,
        latencyMs: Date.now() - started, outcome: 'pending',
      })
      revalidatePath(`/trips/${state.trip.id}`)
      return { ok: true, status: 'pending', version: state.trip.version, editId: pending.id }
    }

    const committed = await commitItineraryEdit(supabase, {
      tripId: state.trip.id,
      expectedVersion: state.trip.version,
      clientRequestId: parsed.data.clientRequestId,
      summary: model.proposal.summary,
      patches,
      inversePatches: inverse,
      removedIds: removedBlockIds(state.blocks, after),
      blocks: after,
      warningOverrides: [],
      sourceMessageId: userMessage.id,
    })
    await saveUsage(supabase, {
      userId: user.id, tripId: state.trip.id, requestId: parsed.data.clientRequestId,
      model: model.model, inputTokens: model.inputTokens, outputTokens: model.outputTokens,
      latencyMs: Date.now() - started, outcome: 'applied',
    })
    revalidatePath(`/trips/${state.trip.id}`)
    return { ok: true, status: 'applied', version: committed.version, editId: committed.editId }
  } catch (error) {
    await supabase.from('trip_chat_messages').insert({
      trip_id: parsed.data.tripId, role: 'assistant', error_message: 'I could not complete that change. Please try again.',
      reply_to_message_id: userMessage.id, created_by_user_id: user.id,
    })
    await saveUsage(supabase, {
      userId: user.id, tripId: parsed.data.tripId, requestId: parsed.data.clientRequestId,
      model: modelName, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, outcome: 'error',
    })
    revalidatePath(`/trips/${parsed.data.tripId}`)
    return chatFailure(error)
  }
}

export async function resolvePendingItineraryEdit(input: unknown): Promise<ChatActionResult> {
  const parsed = resolveRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'validation', message: 'Invalid resolution request.' }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, code: 'unauthorized', message: 'Please sign in again.' }
  const { data, error } = await supabase.from('itinerary_edit_sets').select('*')
    .eq('id', parsed.data.editId).eq('trip_id', parsed.data.tripId).eq('status', 'pending').single()
  if (error || !data) return { ok: false, code: 'not_found', message: 'That proposal is no longer pending.' }
  const edit = data as ItineraryEditSet
  if (parsed.data.resolution === 'discard') {
    const { error: updateError } = await supabase.from('itinerary_edit_sets').update({ status: 'rejected' }).eq('id', edit.id).eq('status', 'pending')
    if (updateError) return { ok: false, code: 'database', message: 'Could not discard the proposal.' }
    revalidatePath(`/trips/${parsed.data.tripId}`)
    return { ok: true, status: 'discarded', version: parsed.data.expectedVersion }
  }

  try {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    if (state.trip.version !== edit.expected_version || state.trip.version !== parsed.data.expectedVersion) {
      return { ok: false, code: 'stale', message: 'The trip changed. Discard this proposal and ask again.' }
    }
    const patchResult = itineraryPatchListSchema.safeParse(edit.patches)
    if (!patchResult.success) return { ok: false, code: 'database', message: 'The saved proposal is invalid.' }
    const selectedIds = parsed.data.selectedBlockIds ? new Set(parsed.data.selectedBlockIds) : null
    const selectedPatches = selectedIds
      ? patchResult.data.filter((patch) => patch.op !== 'reorder_day' && 'id' in patch && selectedIds.has(patch.id))
      : patchResult.data
    if (!selectedPatches.length) return { ok: false, code: 'validation', message: 'Select at least one proposed item.' }
    const allowed = new Set<'overlap' | 'locked_conflict'>()
    if (parsed.data.resolution === 'allow_overlap') allowed.add('overlap')
    if (parsed.data.resolution === 'allow_locked') allowed.add('locked_conflict')
    if (parsed.data.resolution === 'allow_all_reviewed') {
      allowed.add('overlap')
      allowed.add('locked_conflict')
    }
    const request = {
      tripId: parsed.data.tripId,
      expectedVersion: state.trip.version,
      clientRequestId: edit.client_request_id,
      allowWarnings: ['allow_warnings', 'allow_overlap', 'allow_locked', 'allow_all_reviewed'].includes(parsed.data.resolution),
      allowLocked: parsed.data.resolution === 'allow_locked' || parsed.data.resolution === 'allow_all_reviewed',
    }
    const result = await validateAndCommit(
      state, supabase, request, selectedPatches as ItineraryPatch[],
      edit.summary ?? 'Applied itinerary proposal', undefined, allowed,
    )
    if (!result.ok) return { ok: false, code: result.code === 'stale' ? 'stale' : 'validation', message: result.message }
    return { ok: true, status: 'applied', version: result.version, editId: result.editId }
  } catch (resolutionError) {
    return chatFailure(resolutionError)
  }
}

function detectImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

export async function sendItineraryPhoto(input: unknown): Promise<ChatActionResult> {
  const parsed = photoRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'validation', message: 'Invalid photo request.' }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, code: 'unauthorized', message: 'Please sign in again.' }
  if (process.env.ITINERARY_AI_ENABLED === 'false' || process.env.ITINERARY_PHOTO_ENABLED === 'false') {
    return { ok: false, code: 'provider', message: 'Photo planning is temporarily paused. You can still add the booking manually.' }
  }
  const expectedPrefix = `${parsed.data.tripId}/${user.id}/`
  if (!parsed.data.imagePath.startsWith(expectedPrefix) || parsed.data.imagePath.includes('..')) {
    return { ok: false, code: 'validation', message: 'That image path is not valid for this trip.' }
  }

  const { data: duplicate } = await supabase.from('trip_chat_messages').select('id')
    .eq('trip_id', parsed.data.tripId).eq('client_request_id', parsed.data.clientRequestId).maybeSingle()
  if (duplicate) {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    return { ok: true, status: 'duplicate', version: state.trip.version }
  }
  const { data: rateData, error: rateError } = await supabase.rpc('consume_itinerary_rate_limit', {
    p_trip_id: parsed.data.tripId, p_minute_limit: 6, p_day_limit: 60,
  })
  const rate = Array.isArray(rateData) ? rateData[0] : rateData
  if (rateError || !rate?.allowed) {
    return { ok: false, code: rateError ? 'database' : 'rate_limited', message: rateError ? 'Could not check the assistant limit.' : `Please wait about ${rate?.retry_after_seconds ?? 60} seconds.` }
  }

  const { data: image, error: downloadError } = await supabase.storage.from('trip-chat-images').download(parsed.data.imagePath)
  if (downloadError || !image || image.size > 8 * 1024 * 1024) {
    return { ok: false, code: 'validation', message: 'The photo could not be read or is too large.' }
  }
  const bytes = new Uint8Array(await image.arrayBuffer())
  const mediaType = detectImageType(bytes)
  if (!mediaType) return { ok: false, code: 'validation', message: 'Use a JPEG, PNG or WebP image.' }

  const { data: userMessage, error: messageError } = await supabase.from('trip_chat_messages').insert({
    trip_id: parsed.data.tripId, role: 'user', content: parsed.data.instruction,
    image_path: parsed.data.imagePath, client_request_id: parsed.data.clientRequestId,
    created_by_user_id: user.id,
  }).select('*').single()
  if (messageError || !userMessage) return { ok: false, code: 'database', message: 'Could not save the photo request.' }

  const started = Date.now()
  const modelName = process.env.ITINERARY_MODEL ?? 'claude-sonnet-4-6'
  try {
    const state = await loadItineraryState(supabase, parsed.data.tripId)
    if (state.trip.version !== parsed.data.expectedVersion) {
      return { ok: false, code: 'stale', message: 'The trip changed. Refresh and submit the image again.' }
    }
    const [{ data: dreamlist }, { data: ideasData }, { data: messagesData }] = await Promise.all([
      supabase.from('dreamlists').select('travel_preferences').eq('id', state.trip.dreamlist_id).single(),
      supabase.from('reel_submissions').select('*').eq('dreamlist_id', state.trip.dreamlist_id).order('created_at', { ascending: false }).limit(100),
      supabase.from('trip_chat_messages').select('*').eq('trip_id', state.trip.id).order('created_at', { ascending: true }).limit(20),
    ])
    const ideas = (ideasData ?? []) as ReelSubmission[]
    const context = buildItineraryContext({
      trip: state.trip,
      dreamlistPreferences: (dreamlist?.travel_preferences ?? {}) as TravelPreferences,
      blocks: state.blocks,
      ideas,
      messages: (messagesData ?? []) as TripChatMessage[],
      instruction: parsed.data.instruction,
    })
    const model = await proposeItineraryPhoto(context, bytes, mediaType)
    const patches = await trustedPatches(model.proposal, state, ideas)
    const after = applyPatches(state.blocks, patches)
    const validation = validateItinerary(after, state.trip, affectedDays(state.blocks, patches))
    const conflicts = [...validateLockedChanges(state.blocks, patches), ...validation.conflicts]
    const inverse = invertPatches(state.blocks, patches)
    const { data: pending, error: pendingError } = await supabase.from('itinerary_edit_sets').insert({
      trip_id: state.trip.id,
      source_message_id: userMessage.id,
      client_request_id: parsed.data.clientRequestId,
      expected_version: state.trip.version,
      status: 'pending',
      summary: model.proposal.summary,
      patches,
      inverse_patches: inverse,
      hard_conflicts: conflicts,
      warnings: validation.warnings,
      created_by_user_id: user.id,
    }).select('id').single()
    if (pendingError || !pending) throw new Error('Could not save photo proposal')
    await supabase.from('trip_chat_messages').insert({
      trip_id: state.trip.id, role: 'assistant', content: `${model.proposal.summary} Review the extracted details before adding them.`,
      reply_to_message_id: userMessage.id, created_by_user_id: user.id,
    })
    await saveUsage(supabase, {
      userId: user.id, tripId: state.trip.id, requestId: parsed.data.clientRequestId,
      model: model.model, inputTokens: model.inputTokens, outputTokens: model.outputTokens,
      latencyMs: Date.now() - started, outcome: 'pending',
    })
    revalidatePath(`/trips/${state.trip.id}`)
    return { ok: true, status: 'pending', version: state.trip.version, editId: pending.id }
  } catch (error) {
    await supabase.from('trip_chat_messages').insert({
      trip_id: parsed.data.tripId, role: 'assistant', error_message: 'I could not read that image. You can retry or remove it.',
      reply_to_message_id: userMessage.id, created_by_user_id: user.id,
    })
    await saveUsage(supabase, {
      userId: user.id, tripId: parsed.data.tripId, requestId: parsed.data.clientRequestId,
      model: modelName, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, outcome: 'error',
    })
    return chatFailure(error)
  }
}

export async function deleteItineraryImage(input: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = z.object({
    tripId: z.string().uuid(),
    imagePath: z.string().min(1).max(500),
  }).strict().safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Invalid image request.' }
  const { supabase, user } = await authenticate()
  if (!user) return { ok: false, message: 'Please sign in again.' }
  if (!parsed.data.imagePath.startsWith(`${parsed.data.tripId}/${user.id}/`) || parsed.data.imagePath.includes('..')) {
    return { ok: false, message: 'Only the uploader can delete this image.' }
  }
  const { error } = await supabase.storage.from('trip-chat-images').remove([parsed.data.imagePath])
  if (error) return { ok: false, message: 'Could not delete the image.' }
  revalidatePath(`/trips/${parsed.data.tripId}`)
  return { ok: true }
}
