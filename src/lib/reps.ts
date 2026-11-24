export type RepRange = { min: number; max: number }

export function parseRepRange(value: string): RepRange | null {
  const numbers = value.match(/\d+/g)
  if (!numbers || numbers.length === 0) return null
  const first = Number(numbers[0])
  if (numbers.length === 1) return { min: first, max: first }
  const second = Number(numbers[1])
  return { min: Math.min(first, second), max: Math.max(first, second) }
}

const TIMED_REPS_PATTERN = /\d\s*(?:s|secs?|seconds?|mins?|minutes?)\b/i

export function parsePrescribedReps(value: string | null | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (!/\breps?\b/i.test(trimmed) && TIMED_REPS_PATTERN.test(trimmed)) return null
  return parseRepRange(trimmed)?.min ?? null
}
