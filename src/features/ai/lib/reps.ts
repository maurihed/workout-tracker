export function parseRepRange(value: string): { min: number; max: number } | null {
  const numbers = value.match(/\d+/g)
  if (!numbers || numbers.length === 0) return null
  const first = Number(numbers[0])
  if (numbers.length === 1) return { min: first, max: first }
  const second = Number(numbers[1])
  return { min: Math.min(first, second), max: Math.max(first, second) }
}
