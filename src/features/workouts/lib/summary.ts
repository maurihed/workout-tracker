export type Summary = {
  durationSeconds: number
  completedSets: number
  totalVolumeKg: number
}

type SummarySet = {
  reps: number | null
  weightKg: number | null
  completedAt: string | null
  type?: string
}

type SummaryExercise = {
  sets: SummarySet[]
}

export type SummaryInput = {
  activeSeconds: number
  exercises: SummaryExercise[]
}

export function computeSummary(session: SummaryInput): Summary {
  let completedSets = 0
  let totalVolumeKg = 0

  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (set.completedAt == null || set.reps == null || set.weightKg == null) {
        continue
      }
      completedSets += 1
      if (set.type === "warmup") continue
      totalVolumeKg += set.reps * set.weightKg
    }
  }

  return {
    durationSeconds: session.activeSeconds,
    completedSets,
    totalVolumeKg,
  }
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remainder = safe % 60
  const mm = String(minutes).padStart(2, "0")
  const ss = String(remainder).padStart(2, "0")
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
