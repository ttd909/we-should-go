import { describe, expect, it } from 'vitest'
import { addDays, blockEndMinutes, datesBetween, toMinutes, toTimeString } from './time'

describe('local itinerary time', () => {
  it('does calendar arithmetic without using the browser timezone', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(datesBetween('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28', '2028-02-29', '2028-03-01',
    ])
  })

  it('keeps cross-midnight end minutes explicit', () => {
    expect(toMinutes('23:30')).toBe(1410)
    expect(blockEndMinutes({ start_time: '23:30', duration_min: 120 })).toBe(1530)
    expect(toTimeString(1530)).toBe('25:30')
  })

  it('preserves an unscheduled null time', () => {
    expect(blockEndMinutes({ start_time: null, duration_min: 60 })).toBeNull()
  })
})
