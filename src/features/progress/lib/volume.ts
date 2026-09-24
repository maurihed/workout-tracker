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
