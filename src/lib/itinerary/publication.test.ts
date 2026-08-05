import { describe, expect, it } from 'vitest'
import { publicItinerarySnapshotSchema } from './publication'

const snapshot = {
  schema_version: 1,
  trip: {
    name: 'China 2026',
    destination_city: null,
    destination_country: 'China',
    destination_region: null,
    start_date: '2026-08-29',
    end_date: '2026-09-14',
  },
  blocks: [{
    day_date: '2026-09-03',
    start_time: '12:13',
    duration_min: 75,
    sort_order: 0,
    time_source: 'pinned',
    title: 'Chongqing West to Chengdu East',
    type: 'transit',
    notes: 'Train G3582, 1st Class.',
    is_locked: true,
    timezone: null,
    end_date: '2026-09-03',
    end_time: '13:28',
    end_timezone: null,
    address: null,
    latitude: null,
    longitude: null,
  }],
}

describe('public itinerary snapshots', () => {
  it('accepts the deliberately limited public shape', () => {
    expect(publicItinerarySnapshotSchema.safeParse(snapshot).success).toBe(true)
  })

  it('rejects private booking and ownership fields', () => {
    const unsafe = structuredClone(snapshot) as typeof snapshot & { created_by_user_id: string }
    unsafe.created_by_user_id = '446cd55a-2a45-4fff-bceb-a6597602f4d3'
    Object.assign(unsafe.blocks[0], { confirmation_ref: 'private-booking-reference' })
    expect(publicItinerarySnapshotSchema.safeParse(unsafe).success).toBe(false)
  })
})
