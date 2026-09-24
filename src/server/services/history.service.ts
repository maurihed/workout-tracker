import "server-only"
import type { HistoryQuery } from "@/features/history/schemas/history"
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
  const [iso, id] = cursor.split("|")
  if (!iso || !id) return undefined
  return { completedAt: new Date(iso), id }
}

export async function listHistory(userId: string, query: HistoryQuery) {
  const rows = await repos.listCompletedSessionsPage(userId, {
    limit: query.limit,
    ...(decodeCursor(query.cursor) ? { cursor: decodeCursor(query.cursor)! } : {}),
    ...(query.from ? { from: new Date(`${query.from}T00:00:00.000Z`) } : {}),
    ...(query.to ? { to: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    ...(query.routineId ? { routineId: query.routineId } : {}),
  })
  const hasMore = rows.length > query.limit
  const items = rows.slice(0, query.limit).map(toItem)
  const last = items[items.length - 1]
  const nextCursor = hasMore && last ? `${last.completedAt}|${last.id}` : null
  return { items, nextCursor }
}
