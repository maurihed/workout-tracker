export const FREEZE_WINDOW_DAYS = 2

export type StreakInput = {
  hitDates: string[]
  scheduledWeekdays: Set<number>
  today: string
  freezesAvailable: number
}

export type StreakResult = {
  current: number
  longest: number
  lastHitDate: string | null
  freezesUsed: number
  freezesRemaining: number
}

const DAY_MS = 86_400_000

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

function isoFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay()
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

export function computeStreak(input: StreakInput): StreakResult {
  const hits = new Set(input.hitDates)
  if (hits.size === 0) {
    return { current: 0, longest: 0, lastHitDate: null, freezesUsed: 0, freezesRemaining: Math.max(0, input.freezesAvailable) }
  }

  const sorted = [...hits].sort()
  const start = sorted[0]!
  let current = 0
  let longest = 0
  let lastHitDate: string | null = null
  let freezesRemaining = Math.max(0, input.freezesAvailable)
  let freezesUsed = 0

  for (let day = start; toUtc(day) <= toUtc(input.today); day = isoFromUtc(toUtc(day) + DAY_MS)) {
    if (hits.has(day)) {
      current += 1
      lastHitDate = day
    } else if (input.scheduledWeekdays.has(weekdayOf(day)) && toUtc(day) < toUtc(input.today)) {
      const recent = daysBetween(day, input.today) <= FREEZE_WINDOW_DAYS
      if (recent && freezesRemaining > 0 && current > 0) {
        freezesRemaining -= 1
        freezesUsed += 1
      } else {
        current = 0
      }
    }
    if (current > longest) longest = current
  }

  return { current, longest, lastHitDate, freezesUsed, freezesRemaining }
}
