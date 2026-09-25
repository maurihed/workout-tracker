import { weekStart } from "@/features/gamification/lib/week"

export type BucketInput = { completedDate: string; volumeKg: number }

export type WeekBucket = { weekStart: string; volumeKg: number; sessions: number }

export function windowStart(today: string, weeks: number, weekStartsOn: number): string {
  const start = new Date(`${weekStart(today, weekStartsOn)}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - (weeks - 1) * 7)
  return start.toISOString().slice(0, 10)
}

export function bucketByWeek(items: BucketInput[], weekStartsOn: number): WeekBucket[] {
  const buckets = new Map<string, WeekBucket>()
  for (const item of items) {
    const key = weekStart(item.completedDate, weekStartsOn)
    const bucket = buckets.get(key) ?? { weekStart: key, volumeKg: 0, sessions: 0 }
    bucket.volumeKg += item.volumeKg
    bucket.sessions += 1
    buckets.set(key, bucket)
  }
  return [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

export function fillWeekGaps(
  buckets: WeekBucket[],
  from: string,
  to: string,
  weekStartsOn: number,
): WeekBucket[] {
  const byStart = new Map(buckets.map((bucket) => [bucket.weekStart, bucket]))
  const last = weekStart(to, weekStartsOn)
  const filled: WeekBucket[] = []
  for (
    let cursor = weekStart(from, weekStartsOn);
    cursor <= last;
    cursor = addDays(cursor, 7)
  ) {
    filled.push(byStart.get(cursor) ?? { weekStart: cursor, volumeKg: 0, sessions: 0 })
  }
  return filled
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}
