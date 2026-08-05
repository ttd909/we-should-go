import type { ItineraryBlock, Trip } from '@/lib/types'
import type { ItineraryPatch } from './patch'
import { isOpenAt } from './hours'
import { blockEndMinutes, MINUTES_PER_DAY, toMinutes } from './time'
import { estimateTravelMinutes } from './travel'

export type ItineraryIssueType =
  | 'overlap'
  | 'locked_conflict'
  | 'outside_trip_dates'
  | 'travel_time'
  | 'closed'
  | 'unresolved_place'
  | 'low_confidence'
  | 'crosses_midnight'

export interface ItineraryIssue {
  type: ItineraryIssueType
  severity: 'conflict' | 'warning'
  day: string
  block_ids: string[]
  message: string
}

export interface ValidationResult {
  conflicts: ItineraryIssue[]
  warnings: ItineraryIssue[]
}

export function validateLockedChanges(
  before: ItineraryBlock[],
  patches: ItineraryPatch[],
  allowedLockedIds: Set<string> = new Set(),
): ItineraryIssue[] {
  const conflicts: ItineraryIssue[] = []
  const reported = new Set<string>()
  for (const patch of patches) {
    if (patch.op === 'add_block' || patch.op === 'reorder_day') continue
    const block = before.find((candidate) => candidate.id === patch.id)
    if (!block?.is_locked || allowedLockedIds.has(block.id) || reported.has(block.id)) continue
    reported.add(block.id)
    conflicts.push({
      type: 'locked_conflict',
      severity: 'conflict',
      day: block.day_date,
      block_ids: [block.id],
      message: `${block.title} is a confirmed booking. Confirm before changing it.`,
    })
  }
  return conflicts
}

export function validateItinerary(
  blocks: ItineraryBlock[],
  trip: Pick<Trip, 'start_date' | 'end_date'>,
  days?: string[],
): ValidationResult {
  const conflicts: ItineraryIssue[] = []
  const warnings: ItineraryIssue[] = []
  const daySet = days ? new Set(days) : null
  const relevant = daySet ? blocks.filter((block) => daySet.has(block.day_date)) : blocks

  for (const block of relevant) {
    if (
      (trip.start_date && block.day_date < trip.start_date) ||
      (trip.end_date && block.day_date > trip.end_date)
    ) {
      conflicts.push({
        type: 'outside_trip_dates', severity: 'conflict', day: block.day_date,
        block_ids: [block.id], message: `${block.title} falls outside the Trip dates.`,
      })
    }

    if (block.start_time) {
      const end = blockEndMinutes(block)!
      if (end > MINUTES_PER_DAY && !['flight', 'transit', 'hotel'].includes(block.type)) {
        warnings.push({
          type: 'crosses_midnight', severity: 'warning', day: block.day_date,
          block_ids: [block.id], message: `${block.title} runs past midnight.`,
        })
      }
      const open = isOpenAt(block.opening_hours, block.day_date, block.start_time)
      if (open === false) {
        warnings.push({
          type: 'closed', severity: 'warning', day: block.day_date,
          block_ids: [block.id], message: `${block.title} appears closed at ${block.start_time.slice(0, 5)}.`,
        })
      }
    }

    if (['place', 'meal'].includes(block.type) && !block.google_place_id && block.latitude === null) {
      warnings.push({
        type: 'unresolved_place', severity: 'warning', day: block.day_date,
        block_ids: [block.id], message: `${block.title} could not be matched to a place.`,
      })
    }

    if (block.confidence !== null && block.confidence < 0.6) {
      warnings.push({
        type: 'low_confidence', severity: 'warning', day: block.day_date,
        block_ids: [block.id], message: `Check the details for ${block.title}.`,
      })
    }
  }

  const grouped = new Map<string, ItineraryBlock[]>()
  for (const block of relevant) {
    if (!block.start_time) continue
    const group = grouped.get(block.day_date) ?? []
    group.push(block)
    grouped.set(block.day_date, group)
  }

  for (const [day, dayBlocks] of grouped) {
    const scheduled = dayBlocks.sort((a, b) => toMinutes(a.start_time!) - toMinutes(b.start_time!))
    for (let index = 0; index < scheduled.length - 1; index += 1) {
      const earlier = scheduled[index]
      const later = scheduled[index + 1]
      const earlierEnd = blockEndMinutes(earlier)!
      const laterStart = toMinutes(later.start_time!)
      if (laterStart < earlierEnd) {
        const locked = earlier.is_locked || later.is_locked
        conflicts.push({
          type: locked ? 'locked_conflict' : 'overlap', severity: 'conflict', day,
          block_ids: [earlier.id, later.id],
          message: `${earlier.title} and ${later.title} overlap${locked ? ', and one is confirmed' : ''}.`,
        })
        continue
      }
      const travelMinutes = estimateTravelMinutes(earlier, later)
      const available = laterStart - earlierEnd
      if (travelMinutes !== null && available < travelMinutes) {
        warnings.push({
          type: 'travel_time', severity: 'warning', day,
          block_ids: [earlier.id, later.id],
          message: `Allow about ${travelMinutes} minutes from ${earlier.title} to ${later.title}; only ${available} are free.`,
        })
      }
    }
  }

  return { conflicts, warnings }
}
