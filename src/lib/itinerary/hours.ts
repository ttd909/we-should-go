import type { OpeningHours } from '@/lib/types'
import { toMinutes } from './time'

const MINUTES_PER_WEEK = 7 * 24 * 60

export function weekdayOf(dayDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayDate)
  if (!match) throw new Error(`Invalid date: ${dayDate}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function isOpenAt(
  hours: OpeningHours | null,
  dayDate: string,
  time: string,
): boolean | null {
  if (!hours) return null
  if (hours.always_open) return true
  if (hours.periods.length === 0) return null

  const at = weekdayOf(dayDate) * 1440 + toMinutes(time)

  return hours.periods.some((period) => {
    const start = period.open_day * 1440 + toMinutes(period.open)
    let end = period.close_day * 1440 + toMinutes(period.close)
    if (end <= start) end += MINUTES_PER_WEEK
    return (at >= start && at < end) || (at + MINUTES_PER_WEEK >= start && at + MINUTES_PER_WEEK < end)
  })
}
