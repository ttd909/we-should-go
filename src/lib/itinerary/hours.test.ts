import { describe, expect, it } from 'vitest'
import { isOpenAt } from './hours'

describe('opening hours', () => {
  it('handles an overnight period', () => {
    const hours = { periods: [{ open_day: 5, open: '18:00', close_day: 6, close: '02:00' }] }
    expect(isOpenAt(hours, '2026-08-07', '23:30')).toBe(true)
    expect(isOpenAt(hours, '2026-08-08', '01:30')).toBe(true)
    expect(isOpenAt(hours, '2026-08-08', '03:00')).toBe(false)
  })

  it('handles a 24-hour venue and unknown hours', () => {
    expect(isOpenAt({ always_open: true, periods: [] }, '2026-08-08', '04:00')).toBe(true)
    expect(isOpenAt(null, '2026-08-08', '04:00')).toBeNull()
  })
})
