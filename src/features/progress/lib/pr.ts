export type PrSet = { isPr: boolean; weightKg: number | null; reps: number | null }

export type PrExercise = { exerciseId: string; nameSnapshot: string; sets: PrSet[] }

export type PrSession = { id: string; date: string; exercises: PrExercise[] }

export type PrItem = {
  sessionId: string
  date: string
  exerciseId: string
  name: string
  weightKg: number
  reps: number
}

export function recentPrs(sessions: PrSession[], limit: number): PrItem[] {
  const items: PrItem[] = []
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!set.isPr || set.weightKg == null || set.reps == null) continue
        items.push({
          sessionId: session.id,
          date: session.date,
          exerciseId: exercise.exerciseId,
          name: exercise.nameSnapshot,
          weightKg: set.weightKg,
          reps: set.reps,
        })
      }
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}
