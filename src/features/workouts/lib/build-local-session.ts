import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import type { SessionStateInput } from "@/features/workouts/schemas/session"
import type { SessionStoreSource } from "@/features/workouts/stores/session-store"
import {
  buildSessionSnapshot,
  seedSets,
  type RoutineDay,
  type SessionSnapshot,
} from "./session-snapshot"

export type LocalSession = {
  source: SessionStoreSource
  snapshot: SessionSnapshot
  routineDayId: string
  startedAt: string
  name: string
}

export type SessionUpsertPayload = {
  id: string
  routineDayId: string
  name: string
  startedAt: string
  activeSeconds: number
  snapshot: SessionSnapshot
  exercises: SessionStateInput["exercises"]
}

type Deps = { newId?: () => string; now?: () => Date }

export function buildLocalSession(
  routine: RoutineDTO,
  day: RoutineDay,
  deps: Deps = {},
): LocalSession {
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const now = deps.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const name = day.label ?? routine.name
  const snapshot = buildSessionSnapshot(routine, day)
  const id = newId()

  const exercises: SessionStoreSource["exercises"] = day.exercises.map((exercise) => ({
    id: newId(),
    exerciseId: exercise.exerciseId,
    nameSnapshot: exercise.customName ?? exercise.exercise?.name ?? "Unknown exercise",
    targetSets: exercise.targetSets,
    targetReps: exercise.targetReps,
    restSeconds: exercise.restSeconds,
    timerType: exercise.timerType,
    workSeconds: exercise.workSeconds,
    rounds: exercise.rounds,
    completed: false,
    skipped: false,
    swappedFromId: null,
    notes: null,
    sets: seedSets(exercise).map((set) => ({
      ...set,
      id: newId(),
      durationSeconds: null,
      restSecondsLogged: null,
      completedAt: null,
    })),
  }))

  return {
    source: {
      id,
      name,
      status: "in_progress",
      startedAt,
      activeSeconds: 0,
      exercises,
    },
    snapshot,
    routineDayId: day.id,
    startedAt,
    name,
  }
}

export function toUpsertPayload(
  local: LocalSession,
  activeSeconds: number,
): SessionUpsertPayload {
  return {
    id: local.source.id,
    routineDayId: local.routineDayId,
    name: local.name,
    startedAt: local.startedAt,
    activeSeconds,
    snapshot: local.snapshot,
    exercises: local.source.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      nameSnapshot: exercise.nameSnapshot,
      swappedFromId: exercise.swappedFromId ?? null,
      completed: exercise.completed,
      skipped: exercise.skipped,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        ...(set.id ? { id: set.id } : {}),
        setNumber: set.setNumber,
        type: set.type,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSeconds: set.durationSeconds,
        rpe: set.rpe,
        restSecondsLogged: set.restSecondsLogged,
        completedAt: set.completedAt,
      })),
    })),
  }
}
