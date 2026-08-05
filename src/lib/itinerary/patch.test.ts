import { describe, expect, it } from 'vitest'
import type { ItineraryBlock } from '@/lib/types'
import { affectedDays, applyPatches, invertPatches, type ItineraryPatch } from './patch'

function block(overrides: Partial<ItineraryBlock> = {}): ItineraryBlock {
  return {
    id: '11111111-1111-4111-8111-111111111111', trip_id: 'trip', day_date: '2026-08-07',
    start_time: null, duration_min: 60, sort_order: 0, time_source: 'estimated',
    title: 'Cafe', type: 'meal', notes: null, is_locked: false, confirmation_ref: null,
    confidence: 0.9, timezone: 'Australia/Sydney', end_date: null, end_time: null,
    end_timezone: null, reel_submission_id: null, google_place_id: 'google-1',
    opening_hours: { periods: [{ open_day: 5, open: '08:00', close_day: 5, close: '17:00' }] },
    address: '1 Test St', latitude: -33.86, longitude: 151.2,
    created_by_user_id: null, created_at: '', updated_at: '', ...overrides,
  }
}

describe('itinerary patches', () => {
  it('round trips an edit and restores a null start time', () => {
    const before = [block()]
    const patches: ItineraryPatch[] = [
      { op: 'move_block', id: before[0].id, day_date: '2026-08-08', start_time: '10:00' },
    ]
    const after = applyPatches(before, patches)
    const restored = applyPatches(after, invertPatches(before, patches))
    expect(restored).toEqual(before)
    expect(affectedDays(before, patches)).toEqual(['2026-08-07', '2026-08-08'])
  })

  it('restores trusted place data when undoing a deletion', () => {
    const before = [block()]
    const patches: ItineraryPatch[] = [{ op: 'remove_block', id: before[0].id }]
    const restored = applyPatches([], invertPatches(before, patches))
    expect(restored[0]).toMatchObject({
      google_place_id: 'google-1', address: '1 Test St', latitude: -33.86,
      opening_hours: before[0].opening_hours,
    })
  })

  it('rejects a reorder that omits a block', () => {
    const before = [block(), block({ id: '22222222-2222-4222-8222-222222222222', sort_order: 1 })]
    expect(() => applyPatches(before, [
      { op: 'reorder_day', day_date: before[0].day_date, block_ids: [before[0].id] },
    ])).toThrow(/does not match/)
  })
})
