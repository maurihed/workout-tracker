import { normalizeCatalogKey } from "@/features/ai/lib/resolve-exercises"

export const HISTORY_WINDOW_DAYS = 84
export const HISTORY_SESSIONS_PER_EXERCISE = 3
export const HISTORY_MAX_SESSIONS = 60
export const HISTORY_SUMMARY_MAX_EXERCISES = 25

export type HistorySet = { weightKg: number; reps: number }
export type HistorySessionExercise = {
  exerciseId: string | null
  nameSnapshot: string
  sets: HistorySet[]
}
export type HistorySession = { completedAt: string; exercises: HistorySessionExercise[] }
export type HistoryAnchor = {
  identity: string
  name: string
  weightKg: number
  reps: number
  lastDate: string
  sessions: number
}
export type HistoryIndex = {
  byExerciseId: Map<string, HistoryAnchor>
  byName: Map<string, HistoryAnchor>
  hasData: boolean
}

function betterSet(candidate: HistorySet, current: HistorySet): boolean {
  if (candidate.weightKg !== current.weightKg) return candidate.weightKg > current.weightKg
  return candidate.reps > current.reps
}

function bestSet(sets: HistorySet[]): HistorySet | null {
  let best: HistorySet | null = null
  for (const set of sets) {
    if (set.weightKg <= 0 || set.reps <= 0) continue
    if (best === null || betterSet(set, best)) best = set
  }
  return best
}

type Group = {
  identity: string
  kind: "id" | "name"
  name: string
  sessions: { date: string; best: HistorySet }[]
}

export function buildHistoryIndex(sessions: HistorySession[]): HistoryIndex {
  const byExerciseId = new Map<string, HistoryAnchor>()
  const byName = new Map<string, HistoryAnchor>()
  const groups = new Map<string, Group>()
  const ordered = [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))

  for (const session of ordered) {
    const seen = new Set<string>()
    for (const exercise of session.exercises) {
      const best = bestSet(exercise.sets)
      if (!best) continue
      const identity = exercise.exerciseId
        ? `id:${exercise.exerciseId}`
        : `name:${normalizeCatalogKey(exercise.nameSnapshot)}`
      if (!identity || seen.has(identity)) continue
      seen.add(identity)
      const group = groups.get(identity) ?? {
        identity,
        kind: exercise.exerciseId ? "id" : "name",
        name: exercise.nameSnapshot.trim(),
        sessions: [],
      }
      group.sessions.push({ date: session.completedAt, best })
      groups.set(identity, group)
    }
  }

  for (const group of groups.values()) {
    const recent = group.sessions.slice(0, HISTORY_SESSIONS_PER_EXERCISE)
    const first = recent[0]
    if (!first) continue
    const anchorSet = recent.reduce<HistorySet>(
      (acc, entry) => (betterSet(entry.best, acc) ? entry.best : acc),
      first.best,
    )
    const anchor: HistoryAnchor = {
      identity: group.identity,
      name: group.name,
      weightKg: anchorSet.weightKg,
      reps: anchorSet.reps,
      lastDate: first.date,
      sessions: recent.length,
    }
    byName.set(normalizeCatalogKey(group.name), anchor)
    if (group.kind === "id") byExerciseId.set(group.identity.slice(3), anchor)
  }

  return { byExerciseId, byName, hasData: groups.size > 0 }
}

export function buildHistorySummary(
  index: HistoryIndex,
  options: { maxExercises?: number } = {},
): string {
  const max = options.maxExercises ?? HISTORY_SUMMARY_MAX_EXERCISES
  const unique = new Map<string, HistoryAnchor>()
  for (const anchor of index.byExerciseId.values()) unique.set(anchor.identity, anchor)
  for (const anchor of index.byName.values()) unique.set(anchor.identity, anchor)
  const lines = [...unique.values()]
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
    .slice(0, max)
    .map(
      (anchor) =>
        `- ${anchor.name}: ${anchor.weightKg} kg × ${anchor.reps} (${anchor.lastDate.slice(0, 10)})`,
    )
  return lines.join("\n")
}
