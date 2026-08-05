const TIME_PATTERN = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/

export const DEFAULT_DURATION_MIN = 60
export const MINUTES_PER_DAY = 24 * 60

export function toMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time)
  if (!match) throw new Error(`Invalid time: ${time}`)
  const hours = Number(match[1])
  if (hours < 0 || hours > 47) throw new Error(`Invalid time: ${time}`)
  return hours * 60 + Number(match[2])
}

export function toTimeString(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error(`Invalid minutes: ${minutes}`)
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function addMinutes(time: string, delta: number): string {
  return toTimeString(toMinutes(time) + delta)
}

export function blockEndMinutes(block: {
  start_time: string | null
  duration_min: number | null
}): number | null {
  if (block.start_time === null) return null
  return toMinutes(block.start_time) + (block.duration_min ?? DEFAULT_DURATION_MIN)
}

export function compareDateStrings(a: string, b: string): number {
  return a.localeCompare(b)
}

export function addDays(dayDate: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayDate)
  if (!match || !Number.isInteger(delta)) throw new Error(`Invalid date: ${dayDate}`)
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta))
  return date.toISOString().slice(0, 10)
}

export function datesBetween(startDate: string, endDate: string): string[] {
  if (compareDateStrings(startDate, endDate) > 0) return []
  const days: string[] = []
  let day = startDate
  while (compareDateStrings(day, endDate) <= 0 && days.length < 370) {
    days.push(day)
    day = addDays(day, 1)
  }
  return days
}
