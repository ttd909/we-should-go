import { describe, expect, it } from 'vitest'
import type { ItineraryBlock } from '@/lib/types'
import { validateItinerary, validateLockedChanges } from './validate'

function block(id: string, start: string, overrides: Partial<ItineraryBlock> = {}): ItineraryBlock {
  return {
    id, trip_id: 'trip', day_date: '2026-08-07', start_time: start,
    duration_min: 60, sort_order: 0, time_source: 'estimated', title: id,
    type: 'note', notes: null, is_locked: false, confirmation_ref: null,
    confidence: null, timezone: null, end_date: null, end_time: null,
    end_timezone: null, reel_submission_id: null, google_place_id: null,
    opening_hours: null, address: null, latitude: null, longitude: null,
    created_by_user_id: null, created_at: '', updated_at: '', ...overrides,
  }
}

describe('itinerary validation', () => {
  it('treats an overlap as a hard conflict', () => {
    const result = validateItinerary(
      [block('one', '10:00'), block('two', '10:30')],
      { start_date: '2026-08-07', end_date: '2026-08-10' },
    )
    expect(result.conflicts.map((issue) => issue.type)).toContain('overlap')
  })

  it('requires explicit permission before changing a locked block', () => {
    const before = [block('locked', '10:00', { is_locked: true })]
    const patches = [{ op: 'move_block' as const, id: 'locked', start_time: '11:00' }]
    expect(validateLockedChanges(before, patches)).toHaveLength(1)
    expect(validateLockedChanges(before, patches, new Set(['locked']))).toHaveLength(0)
  })

  it('warns about downstream travel time without blocking the edit', () => {
    const first = block('one', '10:00', { latitude: -33.8688, longitude: 151.2093 })
    const second = block('two', '11:05', { latitude: -33.8568, longitude: 151.2153 })
    const result = validateItinerary([first, second], { start_date: null, end_date: null })
    expect(result.conflicts).toEqual([])
    expect(result.warnings.map((issue) => issue.type)).toContain('travel_time')
  })

  it('warns when an ordinary block crosses midnight', () => {
    const result = validateItinerary(
      [block('late', '23:30', { type: 'meal', duration_min: 90, google_place_id: 'place' })],
      { start_date: null, end_date: null },
    )
    expect(result.warnings.map((issue) => issue.type)).toContain('crosses_midnight')
  })

  it('allows a cross-date flight without a false midnight warning', () => {
    const result = validateItinerary([
      block('flight', '23:30', {
        type: 'flight', duration_min: 600, timezone: 'Australia/Sydney',
        end_date: '2026-08-08', end_time: '07:30', end_timezone: 'Asia/Tokyo',
      }),
    ], { start_date: '2026-08-07', end_date: '2026-08-10' })
    expect(result.warnings.map((issue) => issue.type)).not.toContain('crosses_midnight')
  })
})
