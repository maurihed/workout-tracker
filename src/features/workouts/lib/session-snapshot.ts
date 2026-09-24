import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"

export type RoutineDay = RoutineDTO["days"][number]
export type RoutineExerciseDTO = RoutineDay["exercises"][number]

export type SnapshotTimerType = RoutineExerciseDTO["timerType"]

export type SnapshotExercise = {
  order: number
  name: string
  nameEs: string | null
  targetSets: number | null
  targetReps: string | null
  restSeconds: number | null
  targetWeightKg: number | null
  setTargets: RoutineSetTarget[] | null
  timerType: SnapshotTimerType | null
  workSeconds: number | null
  rounds: number | null
}

export type SessionSnapshot = {
  routineId: string | null
  routineDayId: string
  name: string
  nameEs: string | null
  weekday: number
  label: string | null
  exercises: SnapshotExercise[]
}

export const MAX_SEEDED_SETS = 50

export function parseTargetReps(targetReps: string | null): number | null {
  if (!targetReps) return null
  const trimmed = targetReps.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

function exerciseName(exercise: RoutineExerciseDTO): string {
  return exercise.customName ?? exercise.exercise?.name ?? "Unknown exercise"
}

function exerciseNameEs(exercise: RoutineExerciseDTO): string | null {
  return exercise.exercise?.nameEs ?? null
}

export function buildSessionSnapshot(routine: RoutineDTO, day: RoutineDay): SessionSnapshot {
  return {
    routineId: routine.id,
    routineDayId: day.id,
    name: routine.name,
    nameEs: routine.nameEs,
    weekday: day.weekday,
    label: day.label,
    exercises: day.exercises.map((exercise) => ({
      order: exercise.order,
      name: exerciseName(exercise),
      nameEs: exerciseNameEs(exercise),
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      restSeconds: exercise.restSeconds,
      targetWeightKg: exercise.targetWeightKg,
      setTargets: exercise.setTargets ?? null,
      timerType: exercise.timerType,
      workSeconds: exercise.workSeconds,
      rounds: exercise.rounds,
    })),
  }
}

export function seedSets(exercise: RoutineExerciseDTO): {
  setNumber: number
  type: "working"
  reps: number | null
  weightKg: number | null
  rpe: number | null
}[] {
  if (exercise.setTargets?.length) {
    return exercise.setTargets.map((target, index) => ({
      setNumber: index + 1,
      type: "working" as const,
      reps: target.reps,
      weightKg: target.weightKg,
      rpe: target.rpe,
    }))
  }
  const count = Math.min(Math.max(exercise.targetSets ?? 0, 0), MAX_SEEDED_SETS)
  const reps = parseTargetReps(exercise.targetReps)
  return Array.from({ length: count }, (_, index) => ({
    setNumber: index + 1,
    type: "working" as const,
    reps,
    weightKg: exercise.targetWeightKg,
    rpe: null,
  }))
}
