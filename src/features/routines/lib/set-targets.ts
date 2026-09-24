import {
  routineSetTargetSchema,
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
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : null
  const reps =
    parsed != null && routineSetTargetSchema.safeParse({ reps: parsed }).success ? parsed : null
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

export function repsSummary(
  setTargets: RoutineSetTarget[] | null | undefined,
): string | null {
  const reps = (setTargets ?? [])
    .map((target) => target.reps)
    .filter((value): value is number => value != null)
  if (reps.length === 0) return null
  const min = Math.min(...reps)
  const max = Math.max(...reps)
  return min === max ? String(min) : `${min}-${max}`
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
