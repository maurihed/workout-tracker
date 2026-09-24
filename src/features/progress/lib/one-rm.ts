import { epley1rm } from "@/features/gamification/lib/pr"

export type SeriesSet = { reps: number | null; weightKg: number | null; type: string }

export type SeriesExercise = { exerciseId: string | null; sets: SeriesSet[] }

export type SeriesSession = { id: string; date: string; exercises: SeriesExercise[] }

export type SeriesPoint = { date: string; e1rm: number; topWeightKg: number; reps: number }

export function bestE1rm(sets: SeriesSet[]): number | null {
  let best: number | null = null
  for (const set of sets) {
    if (set.type === "warmup") continue
    const value = epley1rm(set.weightKg, set.reps)
    if (value == null) continue
    if (best == null || value > best) best = value
  }
  return best
}

export function seriesForExercise(sessions: SeriesSession[], exerciseId: string): SeriesPoint[] {
  const points: SeriesPoint[] = []
  for (const session of sessions) {
    let top: SeriesPoint | null = null
    for (const exercise of session.exercises) {
      if (exercise.exerciseId !== exerciseId) continue
      for (const set of exercise.sets) {
        if (set.type === "warmup") continue
        const e1rm = epley1rm(set.weightKg, set.reps)
        if (e1rm == null || set.weightKg == null || set.reps == null) continue
        if (top == null || e1rm > top.e1rm) {
          top = { date: session.date, e1rm, topWeightKg: set.weightKg, reps: set.reps }
        }
      }
    }
    if (top) points.push(top)
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}
