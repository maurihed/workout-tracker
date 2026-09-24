import "server-only"
import type { HistoryQuery } from "@/features/history/schemas/history"
import * as profileRepo from "@/server/repositories/profile.repository"
import * as repos from "@/server/repositories/history.repository"

export type HistoryItemDTO = {
  id: string; name: string; startedAt: string; completedAt: string; activeSeconds: number
  totalVolumeKg: number; setCount: number; prCount: number
  routineId: string | null; routineDayId: string | null
}

function toItem(row: repos.HistoryRecord): HistoryItemDTO {
  let totalVolumeKg = 0, setCount = 0, prCount = 0
  for (const exercise of row.exercises) {
    for (const set of exercise.sets) {
      if (set.isPr) prCount += 1
      if (set.completedAt) {
        setCount += 1
        if (set.type !== "warmup" && set.reps != null && set.weightKg != null) {
          totalVolumeKg += set.reps * set.weightKg
        }
      }
    }
  }
  return {
    id: row.id, name: row.name, startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt!.toISOString(), activeSeconds: row.activeSeconds,
    totalVolumeKg, setCount, prCount, routineId: row.routineId, routineDayId: row.routineDayId,
  }
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return undefined
  const separator = cursor.indexOf("|")
  if (separator <= 0) return undefined
  const iso = cursor.slice(0, separator)
  const id = cursor.slice(separator + 1)
  if (!id || Number.isNaN(Date.parse(iso))) return undefined
  return { completedAt: new Date(iso), id }
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - date.getTime()
}

function localDayBounds(date: string, timeZone: string, endOfDay: boolean): Date {
  const offsetMs = tzOffsetMs(new Date(`${date}T12:00:00Z`), timeZone)
  const base = endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`
  return new Date(Date.parse(base) - offsetMs)
}

export async function listHistory(userId: string, query: HistoryQuery) {
  const profile = await profileRepo.findByUserId(userId)
  const timeZone = profile?.timezone ?? "UTC"
  const cursor = decodeCursor(query.cursor)
  const rows = await repos.listCompletedSessionsPage(userId, {
    limit: query.limit,
    ...(cursor ? { cursor } : {}),
    ...(query.from ? { from: localDayBounds(query.from, timeZone, false) } : {}),
    ...(query.to ? { to: localDayBounds(query.to, timeZone, true) } : {}),
    ...(query.routineId ? { routineId: query.routineId } : {}),
  })
  const hasMore = rows.length > query.limit
  const items = rows.slice(0, query.limit).map(toItem)
  const last = items[items.length - 1]
  const nextCursor = hasMore && last ? `${last.completedAt}|${last.id}` : null
  return { items, nextCursor }
}
