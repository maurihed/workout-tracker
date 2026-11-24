import { legacyTargetsToSetTargets } from "@/features/routines/lib/set-targets"
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"

export const DEFAULT_ROUTINE_SETS = 3
export const DEFAULT_ROUTINE_REPS = "10"
export const DEFAULT_ROUTINE_REST_SECONDS = 60

export type PrescriptionFields = {
  targetSets: number
  targetReps: string
  targetWeightKg: number | null
  setTargets?: RoutineSetTarget[] | null
}

export function hasPrescription(exercise: PrescriptionFields): boolean {
  if (exercise.targetSets <= 0) return false
  if (exercise.targetReps.trim().length > 0) return true
  return (exercise.setTargets ?? []).some((target) => target.reps != null)
}

export function withDefaultPrescription<T extends PrescriptionFields>(exercise: T): T {
  if (hasPrescription(exercise)) return exercise
  return {
    ...exercise,
    targetSets: DEFAULT_ROUTINE_SETS,
    targetReps: DEFAULT_ROUTINE_REPS,
    setTargets: legacyTargetsToSetTargets(
      DEFAULT_ROUTINE_SETS,
      DEFAULT_ROUTINE_REPS,
      exercise.targetWeightKg,
    ),
  } as T
}
