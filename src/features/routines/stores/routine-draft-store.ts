import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { legacyTargetsToSetTargets } from "@/features/routines/lib/set-targets"
import { moveItem } from "@/features/routines/lib/reorder"
import type {
  RoutineInput,
  RoutineSetTarget,
} from "@/features/routines/schemas/routine"

export type TimerType = "none" | "interval" | "emom" | "amrap"
export type Goal =
  | "lose_weight"
  | "build_muscle"
  | "get_stronger"
  | "endurance"
  | "general_fitness"

export type DraftExercise = {
  id: string
  exerciseId: string
  name: string
  targetSets: number
  targetReps: string
  restSeconds: number
  targetWeightKg: number | null
  setTargets: RoutineSetTarget[]
  timerType: TimerType
  workSeconds: number | null
  rounds: number | null
  notes: string | null
}

export type DraftDay = {
  id: string
  weekday: number
  label: string | null
  exercises: DraftExercise[]
}

export type RoutineDraftSource = {
  id: string
  name: string
  description?: string | null
  goal?: Goal | null
  days: {
    id: string
    weekday: number
    label: string | null
    exercises: {
      id: string
      exerciseId: string | null
      customName?: string | null
      targetSets: number
      targetReps: string
      restSeconds: number
      targetWeightKg: number | null
      setTargets?: RoutineSetTarget[] | null
      timerType: TimerType
      workSeconds: number | null
      rounds: number | null
      notes: string | null
      exercise?: { name: string; nameEs?: string | null } | null
    }[]
  }[]
}

export type NewExerciseRef = { exerciseId: string; name: string }

export type HeaderPatch = {
  name?: string
  description?: string | null
  goal?: Goal | null
}

export type DayPatch = {
  weekday?: number
  label?: string | null
}

export type ExercisePatch = Partial<Omit<DraftExercise, "id" | "exerciseId" | "name">>

/**
 * Raised when the draft contains an exercise row without a catalog reference
 * (e.g. a legacy custom exercise whose `exerciseId` is null). 2A only supports
 * catalog exercises, so this must fail loudly rather than emit an empty
 * `exerciseId` that the input schema rejects with a generic message.
 */
export class OrphanedExerciseError extends Error {
  constructor() {
    super("Draft contains an exercise without a catalog reference")
    this.name = "OrphanedExerciseError"
  }
}

type DraftState = {
  routineId: string | null
  name: string
  description: string | null
  goal: Goal | null
  days: DraftDay[]
  isDirty: boolean
  hydrate: (routine: RoutineDraftSource) => void
  setHeader: (patch: HeaderPatch) => void
  addDay: (weekday: number) => void
  removeDay: (dayId: string) => void
  updateDay: (dayId: string, patch: DayPatch) => void
  addExercises: (dayId: string, items: NewExerciseRef[]) => boolean
  updateExercise: (
    dayId: string,
    exerciseId: string,
    patch: ExercisePatch,
  ) => void
  removeExercise: (dayId: string, exerciseId: string) => void
  moveDay: (from: number, to: number) => void
  moveExercise: (dayId: string, from: number, to: number) => void
  toRoutineInput: () => RoutineInput
  clearDraft: () => void
}

const emptyDraft = {
  routineId: null,
  name: "",
  description: null,
  goal: null,
  days: [] as DraftDay[],
  isDirty: false,
}

export type PersistedDraft = Pick<
  DraftState,
  "routineId" | "name" | "description" | "goal" | "days" | "isDirty"
>

export function migrateDraftState(
  persisted: unknown,
  version: number,
): PersistedDraft {
  const state = (persisted ?? {}) as Partial<PersistedDraft>
  if (version >= 1) return state as PersistedDraft
  const days = (state.days ?? []).map((day) => ({
    ...day,
    exercises: (day.exercises ?? []).map((exercise) => ({
      ...exercise,
      setTargets:
        exercise.setTargets ??
        legacyTargetsToSetTargets(
          exercise.targetSets,
          exercise.targetReps,
          exercise.targetWeightKg,
        ),
    })),
  }))
  return { ...state, days } as PersistedDraft
}

function createId(): string {
  return crypto.randomUUID()
}

function toDraftDay(day: RoutineDraftSource["days"][number]): DraftDay {
  return {
    id: createId(),
    weekday: day.weekday,
    label: day.label,
    exercises: day.exercises.map((exercise) => ({
      id: createId(),
      exerciseId: exercise.exerciseId ?? "",
      name: exercise.exercise?.name ?? exercise.customName ?? "",
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      restSeconds: exercise.restSeconds,
      targetWeightKg: exercise.targetWeightKg,
      setTargets:
        exercise.setTargets ??
        legacyTargetsToSetTargets(
          exercise.targetSets,
          exercise.targetReps,
          exercise.targetWeightKg,
        ),
      timerType: exercise.timerType,
      workSeconds: exercise.workSeconds,
      rounds: exercise.rounds,
      notes: exercise.notes,
    })),
  }
}

export const useRoutineDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      ...emptyDraft,

      hydrate: (routine) => {
        if (routine.id === get().routineId) return
        set({
          routineId: routine.id,
          name: routine.name,
          description: routine.description ?? null,
          goal: routine.goal ?? null,
          days: routine.days.map(toDraftDay),
          isDirty: false,
        })
      },

      setHeader: (patch) => set({ ...patch, isDirty: true }),

      addDay: (weekday) =>
        set((state) => ({
          days: [
            ...state.days,
            { id: createId(), weekday, label: null, exercises: [] },
          ],
          isDirty: true,
        })),

      removeDay: (dayId) =>
        set((state) => ({
          days: state.days.filter((day) => day.id !== dayId),
          isDirty: true,
        })),

      updateDay: (dayId, patch) =>
        set((state) => ({
          days: state.days.map((day) =>
            day.id === dayId ? { ...day, ...patch } : day,
          ),
          isDirty: true,
        })),

      addExercises: (dayId, items) => {
        // Never clobber the draft or flip `isDirty` for an unknown day: the
        // picker can be opened directly and must not silently discard the
        // selection (or the user's unsaved edits) when the draft is missing.
        if (!get().days.some((day) => day.id === dayId)) return false
        set((state) => ({
          days: state.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  exercises: [
                    ...day.exercises,
                    ...items.map((item) => ({
                      id: createId(),
                      exerciseId: item.exerciseId,
                      name: item.name,
                      targetSets: 3,
                      targetReps: "10",
                      restSeconds: 60,
                      targetWeightKg: null,
                      setTargets: legacyTargetsToSetTargets(3, "10", null),
                      timerType: "none" as const,
                      workSeconds: null,
                      rounds: null,
                      notes: null,
                    })),
                  ],
                }
              : day,
          ),
          isDirty: true,
        }))
        return true
      },

      updateExercise: (dayId, exerciseId, patch) =>
        set((state) => ({
          days: state.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  exercises: day.exercises.map((exercise) =>
                    exercise.id === exerciseId
                      ? { ...exercise, ...patch }
                      : exercise,
                  ),
                }
              : day,
          ),
          isDirty: true,
        })),

      removeExercise: (dayId, exerciseId) =>
        set((state) => ({
          days: state.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  exercises: day.exercises.filter(
                    (exercise) => exercise.id !== exerciseId,
                  ),
                }
              : day,
          ),
          isDirty: true,
        })),

      moveDay: (from, to) =>
        set((state) => {
          const days = moveItem(state.days, from, to)
          if (days.every((day, index) => day === state.days[index])) {
            return state
          }
          return { days, isDirty: true }
        }),

      moveExercise: (dayId, from, to) =>
        set((state) => {
          const day = state.days.find((item) => item.id === dayId)
          if (!day) return state
          const exercises = moveItem(day.exercises, from, to)
          if (
            exercises.every(
              (exercise, index) => exercise === day.exercises[index],
            )
          ) {
            return state
          }
          return {
            days: state.days.map((item) =>
              item.id === dayId ? { ...item, exercises } : item,
            ),
            isDirty: true,
          }
        }),

      toRoutineInput: () => {
        const { name, description, goal, days } = get()
        const orphaned = days.some((day) =>
          day.exercises.some((exercise) => exercise.exerciseId.trim() === ""),
        )
        if (orphaned) throw new OrphanedExerciseError()
        return {
          name,
          description,
          goal,
          days: days.map((day) => ({
            weekday: day.weekday,
            label: day.label,
            exercises: day.exercises.map((exercise) => ({
              exerciseId: exercise.exerciseId,
              targetSets: exercise.targetSets,
              targetReps: exercise.targetReps,
              restSeconds: exercise.restSeconds,
              targetWeightKg: exercise.targetWeightKg,
              setTargets: exercise.setTargets,
              timerType: exercise.timerType,
              workSeconds: exercise.workSeconds,
              rounds: exercise.rounds,
              notes: exercise.notes,
            })),
          })),
        }
      },

      clearDraft: () => set({ ...emptyDraft, days: [] }),
    }),
    {
      name: "gym-routine-draft",
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
      version: 1,
      migrate: migrateDraftState,
      partialize: (state) => ({
        routineId: state.routineId,
        name: state.name,
        description: state.description,
        goal: state.goal,
        days: state.days,
        isDirty: state.isDirty,
      }),
    },
  ),
)
