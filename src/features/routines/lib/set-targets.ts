import {
  routineSetTargetsSchema,
  type RoutineSetTarget,
} from "@/features/routines/schemas/routine"

export function parseSetTargets(value: unknown): RoutineSetTarget[] | null {
  const result = routineSetTargetsSchema.safeParse(value)
  return result.success ? result.data : null
}

export function legacyTargetsToSetTargets(
  targetSets: number,
  targetReps: string | null,
  targetWeightKg: number | null,
): RoutineSetTarget[] {
  const count = Math.min(Math.max(targetSets, 1), 20)
  const trimmed = targetReps?.trim() ?? ""
  const reps = /^\d+$/.test(trimmed) ? Number(trimmed) : null
  return Array.from({ length: count }, () => ({
    reps,
    weightKg: targetWeightKg,
    rpe: null,
  }))
}

export type SyncedSetTargets = {
  setTargets: RoutineSetTarget[]
  targetSets: number
  targetReps: string
  targetWeightKg: number | null
}

export function syncSetTargets(next: RoutineSetTarget[]): SyncedSetTargets {
  const first = next[0] ?? { reps: null, weightKg: null, rpe: null }
  return {
    setTargets: next,
    targetSets: next.length,
    targetReps: first.reps == null ? "" : String(first.reps),
    targetWeightKg: first.weightKg,
  }
}

export function normalizeRoutineSetTargets<
  T extends { days: { exercises: { setTargets: unknown }[] }[] },
>(routine: T): T {
  for (const day of routine.days) {
    for (const exercise of day.exercises) {
      ;(exercise as { setTargets: RoutineSetTarget[] | null }).setTargets =
        parseSetTargets(exercise.setTargets)
    }
  }
  return routine
}
