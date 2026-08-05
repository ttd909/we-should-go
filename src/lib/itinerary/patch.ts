import type { ItineraryBlock } from '@/lib/types'
import type { MutableBlockFields, NewBlockInput } from './schemas'

export type ItineraryPatch =
  | { op: 'add_block'; id: string; block: NewBlockInput; trusted?: TrustedBlockFields }
  | { op: 'update_block'; id: string; changes: MutableBlockFields }
  | { op: 'move_block'; id: string; day_date?: string; start_time?: string | null }
  | { op: 'remove_block'; id: string }
  | { op: 'reorder_day'; day_date: string; block_ids: string[] }

export type TrustedBlockFields = Pick<
  ItineraryBlock,
  'google_place_id' | 'opening_hours' | 'address' | 'latitude' | 'longitude'
>

function cloneBlock(block: ItineraryBlock): ItineraryBlock {
  return {
    ...block,
    opening_hours: block.opening_hours
      ? { ...block.opening_hours, periods: block.opening_hours.periods.map((period) => ({ ...period })) }
      : null,
  }
}

function findBlock(blocks: ItineraryBlock[], id: string): ItineraryBlock {
  const block = blocks.find((candidate) => candidate.id === id)
  if (!block) throw new Error(`Unknown itinerary Block: ${id}`)
  return block
}

function materialise(
  id: string,
  input: NewBlockInput,
  trusted?: TrustedBlockFields,
): ItineraryBlock {
  return {
    id,
    trip_id: '',
    day_date: input.day_date,
    start_time: input.start_time,
    duration_min: input.duration_min,
    sort_order: input.sort_order,
    time_source: input.time_source,
    title: input.title,
    type: input.type,
    notes: input.notes,
    is_locked: input.is_locked,
    confirmation_ref: input.confirmation_ref,
    confidence: input.confidence,
    timezone: input.timezone,
    end_date: input.end_date,
    end_time: input.end_time,
    end_timezone: input.end_timezone,
    reel_submission_id: input.reel_submission_id,
    google_place_id: trusted?.google_place_id ?? null,
    opening_hours: trusted?.opening_hours ?? null,
    address: trusted?.address ?? null,
    latitude: trusted?.latitude ?? null,
    longitude: trusted?.longitude ?? null,
    created_by_user_id: null,
    created_at: '',
    updated_at: '',
  }
}

export function applyPatches(
  blocks: ItineraryBlock[],
  patches: ItineraryPatch[],
): ItineraryBlock[] {
  let next = blocks.map(cloneBlock)

  for (const patch of patches) {
    switch (patch.op) {
      case 'add_block':
        if (next.some((block) => block.id === patch.id)) {
          throw new Error(`Duplicate itinerary Block: ${patch.id}`)
        }
        next.push(materialise(patch.id, patch.block, patch.trusted))
        break
      case 'update_block':
        Object.assign(findBlock(next, patch.id), patch.changes)
        break
      case 'move_block': {
        const block = findBlock(next, patch.id)
        if (patch.day_date !== undefined) block.day_date = patch.day_date
        if (patch.start_time !== undefined) block.start_time = patch.start_time
        break
      }
      case 'remove_block':
        findBlock(next, patch.id)
        next = next.filter((block) => block.id !== patch.id)
        break
      case 'reorder_day': {
        const dayIds = next.filter((block) => block.day_date === patch.day_date).map((block) => block.id)
        if (
          patch.block_ids.length !== dayIds.length ||
          new Set(patch.block_ids).size !== patch.block_ids.length ||
          patch.block_ids.some((id) => !dayIds.includes(id))
        ) {
          throw new Error(`Reorder list does not match Blocks on ${patch.day_date}`)
        }
        patch.block_ids.forEach((id, index) => {
          findBlock(next, id).sort_order = index
        })
        break
      }
    }
  }

  return next
}

export function invertPatches(
  before: ItineraryBlock[],
  patches: ItineraryPatch[],
): ItineraryPatch[] {
  const inverse: ItineraryPatch[] = []
  let state = before.map(cloneBlock)

  for (const patch of patches) {
    switch (patch.op) {
      case 'add_block':
        inverse.push({ op: 'remove_block', id: patch.id })
        break
      case 'update_block': {
        const target = findBlock(state, patch.id)
        const changes: Record<string, unknown> = {}
        for (const key of Object.keys(patch.changes) as Array<keyof MutableBlockFields>) {
          changes[key] = target[key as keyof ItineraryBlock]
        }
        inverse.push({ op: 'update_block', id: patch.id, changes: changes as MutableBlockFields })
        break
      }
      case 'move_block': {
        const target = findBlock(state, patch.id)
        inverse.push({
          op: 'move_block',
          id: patch.id,
          ...(patch.day_date !== undefined ? { day_date: target.day_date } : {}),
          ...(patch.start_time !== undefined ? { start_time: target.start_time } : {}),
        })
        break
      }
      case 'remove_block': {
        const target = findBlock(state, patch.id)
        inverse.push({
          op: 'add_block',
          id: target.id,
          block: {
            title: target.title,
            type: target.type,
            day_date: target.day_date,
            start_time: target.start_time,
            duration_min: target.duration_min,
            sort_order: target.sort_order,
            time_source: target.time_source,
            notes: target.notes,
            is_locked: target.is_locked,
            confirmation_ref: target.confirmation_ref,
            confidence: target.confidence,
            timezone: target.timezone,
            end_date: target.end_date,
            end_time: target.end_time,
            end_timezone: target.end_timezone,
            reel_submission_id: target.reel_submission_id,
          },
          trusted: {
            google_place_id: target.google_place_id,
            opening_hours: target.opening_hours,
            address: target.address,
            latitude: target.latitude,
            longitude: target.longitude,
          },
        })
        break
      }
      case 'reorder_day': {
        const priorOrder = state
          .filter((block) => block.day_date === patch.day_date)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((block) => block.id)
        inverse.push({ op: 'reorder_day', day_date: patch.day_date, block_ids: priorOrder })
        break
      }
    }
    state = applyPatches(state, [patch])
  }

  return inverse.reverse()
}

export function affectedDays(before: ItineraryBlock[], patches: ItineraryPatch[]): string[] {
  const days = new Set<string>()
  for (const patch of patches) {
    if (patch.op === 'add_block' || patch.op === 'reorder_day') {
      days.add(patch.op === 'add_block' ? patch.block.day_date : patch.day_date)
      continue
    }
    const existing = before.find((block) => block.id === patch.id)
    if (existing) days.add(existing.day_date)
    if (patch.op === 'move_block' && patch.day_date) days.add(patch.day_date)
  }
  return [...days]
}

export function removedBlockIds(before: ItineraryBlock[], after: ItineraryBlock[]): string[] {
  const afterIds = new Set(after.map((block) => block.id))
  return before.filter((block) => !afterIds.has(block.id)).map((block) => block.id)
}
