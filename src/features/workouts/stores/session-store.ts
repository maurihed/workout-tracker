import { create } from "zustand"

import type { SessionStateInput } from "@/features/workouts/schemas/session"
import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"
import type { SessionUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type {
  SessionDTO,
  SessionExerciseDTO,
  SessionSetDTO,
  SessionSetType,
  SessionStatus,
  SessionTimerType,
} from "@/features/workouts/hooks/use-active-session"

export type SessionSetState = {
  id: string | null
  setNumber: number
  type: SessionSetType
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  rpe: number | null
  restSecondsLogged: number | null
  completedAt: string | null
}

export type SessionExerciseState = {
  id: string
  exerciseId: string | null
  nameSnapshot: string
  targetSets: number | null
  targetReps: string | null
  restSeconds: number | null
  timerType: SessionTimerType | null
  workSeconds: number | null
  rounds: number | null
  completed: boolean
  skipped: boolean
  swappedFromId: string | null
  notes: string | null
  sets: SessionSetState[]
}

export type SessionSetPatch = Partial<Omit<SessionSetState, "setNumber">>

export type SwapTarget = { exerciseId: string; nameSnapshot: string }

/**
 * The subset of a `SessionDTO` the store needs to hydrate. `SessionDTO` is
 * structurally assignable to it, so callers can pass the query result directly.
 * Only the fields the runner can edit (or display) are retained; server-derived
 * hints such as `lastPerformance` are intentionally dropped.
 */
type HydratableSet = Pick<
  SessionSetDTO,
  | "setNumber"
  | "type"
  | "reps"
  | "weightKg"
  | "durationSeconds"
  | "rpe"
  | "restSecondsLogged"
  | "completedAt"
> & { id?: string }

type HydratableExercise = Pick<
  SessionExerciseDTO,
  | "id"
  | "exerciseId"
  | "nameSnapshot"
  | "targetSets"
  | "targetReps"
  | "restSeconds"
  | "timerType"
  | "workSeconds"
  | "rounds"
  | "completed"
  | "skipped"
  | "notes"
> & { swappedFromId?: string | null; sets: HydratableSet[] }

export type SessionStoreSource = Pick<
  SessionDTO,
  "id" | "name" | "status" | "startedAt" | "activeSeconds"
> & { exercises: HydratableExercise[] }

type SessionState = {
  sessionId: string | null
  name: string
  status: SessionStatus | null
  startedAt: string | null
  activeSeconds: number
  exercises: SessionExerciseState[]
  currentIndex: number
  isDirty: boolean
  snapshot: SessionSnapshot | null
  routineDayId: string | null
  hydrate: (
    session: SessionStoreSource,
    meta?: { snapshot?: SessionSnapshot | null; routineDayId?: string | null },
  ) => void
  reset: () => void
  toggleSet: (
    exerciseId: string,
    setNumber: number,
    patch: SessionSetPatch,
  ) => void
  addSet: (exerciseId: string) => void
  skipExercise: (exerciseId: string, skipped: boolean) => void
  swapExercise: (exerciseId: string, target: SwapTarget) => void
  setNotes: (exerciseId: string, notes: string | null) => void
  setActiveSeconds: (seconds: number) => void
  goTo: (index: number) => void
  next: () => void
  prev: () => void
  toStateInput: () => SessionStateInput
  toUpsertPayload: (activeSeconds: number) => SessionUpsertPayload | null
}

const emptyState = {
  sessionId: null,
  name: "",
  status: null,
  startedAt: null,
  activeSeconds: 0,
  exercises: [] as SessionExerciseState[],
  currentIndex: 0,
  isDirty: false,
  snapshot: null as SessionSnapshot | null,
  routineDayId: null as string | null,
}

function toSetState(set: HydratableSet): SessionSetState {
  return {
    id: set.id ?? null,
    setNumber: set.setNumber,
    type: set.type,
    reps: set.reps,
    weightKg: set.weightKg,
    durationSeconds: set.durationSeconds,
    rpe: set.rpe,
    restSecondsLogged: set.restSecondsLogged,
    completedAt: set.completedAt,
  }
}

function toExerciseState(
  exercise: HydratableExercise,
): SessionExerciseState {
  return {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    nameSnapshot: exercise.nameSnapshot,
    targetSets: exercise.targetSets,
    targetReps: exercise.targetReps,
    restSeconds: exercise.restSeconds,
    timerType: exercise.timerType,
    workSeconds: exercise.workSeconds,
    rounds: exercise.rounds,
    completed: exercise.completed,
    skipped: exercise.skipped,
    swappedFromId: exercise.swappedFromId ?? null,
    notes: exercise.notes,
    sets: exercise.sets.map(toSetState),
  }
}

function createSet(setNumber: number): SessionSetState {
  return {
    id: null,
    setNumber,
    type: "working",
    reps: null,
    weightKg: null,
    durationSeconds: null,
    rpe: null,
    restSecondsLogged: null,
    completedAt: null,
  }
}

function replaceExercise(
  exercises: SessionExerciseState[],
  exerciseId: string,
  update: (exercise: SessionExerciseState) => SessionExerciseState,
): SessionExerciseState[] {
  return exercises.map((exercise) =>
    exercise.id === exerciseId ? update(exercise) : exercise,
  )
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

/**
 * Exercise-level completion is derived from its sets: an exercise counts as
 * completed once it has at least one set and every set is checked off. This
 * keeps the overview honest (adding an unfinished set re-opens the exercise).
 */
function isExerciseComplete(exercise: SessionExerciseState): boolean {
  return (
    exercise.sets.length > 0 &&
    exercise.sets.every((set) => set.completedAt !== null)
  )
}

function withDerivedCompletion(
  exercises: SessionExerciseState[],
): SessionExerciseState[] {
  return exercises.map((exercise) => {
    const completed = isExerciseComplete(exercise)
    return exercise.completed === completed ? exercise : { ...exercise, completed }
  })
}

/**
 * Authoritative client-side workout state. Not persisted: the server owns the
 * session and `GET /api/sessions/active` restores it on mount (Task 9 wires the
 * debounced `PUT` from `isDirty`).
 */
export const useSessionStore = create<SessionState>()((set, get) => ({
  ...emptyState,

  hydrate: (session, meta) => {
    const current = get()
    if (session.id === current.sessionId && current.isDirty) {
      set({
        ...(meta?.snapshot !== undefined ? { snapshot: meta.snapshot } : {}),
        ...(meta?.routineDayId !== undefined ? { routineDayId: meta.routineDayId } : {}),
      })
      return
    }
    set({
      sessionId: session.id,
      name: session.name,
      status: session.status,
      startedAt: session.startedAt,
      activeSeconds: session.activeSeconds,
      exercises: withDerivedCompletion(session.exercises.map(toExerciseState)),
      currentIndex: 0,
      isDirty: false,
      snapshot: meta?.snapshot ?? null,
      routineDayId: meta?.routineDayId ?? null,
    })
  },

  reset: () => set({ ...emptyState, exercises: [] }),

  toggleSet: (exerciseId, setNumber, patch) => {
    const exercise = get().exercises.find((item) => item.id === exerciseId)
    if (!exercise) return
    const exists = exercise.sets.some((item) => item.setNumber === setNumber)
    set((state) => ({
      exercises: withDerivedCompletion(
        replaceExercise(state.exercises, exerciseId, (current) => {
          const sets = exists
            ? current.sets.map((item) =>
                item.setNumber === setNumber ? { ...item, ...patch } : item,
              )
            : [...current.sets, { ...createSet(setNumber), ...patch }]
          return { ...current, sets }
        }),
      ),
      isDirty: true,
    }))
  },

  addSet: (exerciseId) => {
    const exercise = get().exercises.find((item) => item.id === exerciseId)
    if (!exercise) return
    const lastSetNumber = exercise.sets.reduce(
      (max, item) => Math.max(max, item.setNumber),
      0,
    )
    set((state) => ({
      exercises: withDerivedCompletion(
        replaceExercise(state.exercises, exerciseId, (current) => ({
          ...current,
          sets: [...current.sets, createSet(lastSetNumber + 1)],
        })),
      ),
      isDirty: true,
    }))
  },

  skipExercise: (exerciseId, skipped) => {
    const exercise = get().exercises.find((item) => item.id === exerciseId)
    if (!exercise || exercise.skipped === skipped) return
    set((state) => ({
      exercises: replaceExercise(state.exercises, exerciseId, (current) => ({
        ...current,
        skipped,
      })),
      isDirty: true,
    }))
  },

  swapExercise: (exerciseId, target) => {
    const exercise = get().exercises.find((item) => item.id === exerciseId)
    if (!exercise) return
    set((state) => ({
      exercises: replaceExercise(state.exercises, exerciseId, (current) => ({
        ...current,
        exerciseId: target.exerciseId,
        nameSnapshot: target.nameSnapshot,
        swappedFromId: current.swappedFromId ?? current.exerciseId,
      })),
      isDirty: true,
    }))
  },

  setNotes: (exerciseId, notes) => {
    const exercise = get().exercises.find((item) => item.id === exerciseId)
    if (!exercise || exercise.notes === notes) return
    set((state) => ({
      exercises: replaceExercise(state.exercises, exerciseId, (current) => ({
        ...current,
        notes,
      })),
      isDirty: true,
    }))
  },

  setActiveSeconds: (seconds) => {
    const next = Math.max(0, Math.floor(seconds))
    if (next === get().activeSeconds) return
    set({ activeSeconds: next })
  },

  goTo: (index) =>
    set((state) => ({
      currentIndex: clampIndex(index, state.exercises.length),
    })),

  next: () =>
    set((state) => ({
      currentIndex: clampIndex(state.currentIndex + 1, state.exercises.length),
    })),

  prev: () =>
    set((state) => ({
      currentIndex: clampIndex(state.currentIndex - 1, state.exercises.length),
    })),

  toStateInput: () => {
    const { activeSeconds, exercises } = get()
    return {
      activeSeconds,
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        nameSnapshot: exercise.nameSnapshot,
        swappedFromId: exercise.swappedFromId,
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
  },

  toUpsertPayload: (activeSeconds) => {
    const { sessionId, name, startedAt, snapshot, routineDayId, exercises } = get()
    if (!sessionId || !startedAt || !snapshot || !routineDayId) return null
    return {
      id: sessionId,
      routineDayId,
      name,
      startedAt,
      activeSeconds,
      snapshot,
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        nameSnapshot: exercise.nameSnapshot,
        swappedFromId: exercise.swappedFromId,
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
  },
}))
