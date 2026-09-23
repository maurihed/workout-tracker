import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { moveItem } from "@/features/routines/lib/reorder"
import type { RoutineInput } from "@/features/routines/schemas/routine"

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
  addExercises: (dayId: string, items: NewExerciseRef[]) => void
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

      addExercises: (dayId, items) =>
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
        })),

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
        set((state) => ({ days: moveItem(state.days, from, to), isDirty: true })),

      moveExercise: (dayId, from, to) =>
        set((state) => ({
          days: state.days.map((day) =>
            day.id === dayId
              ? { ...day, exercises: moveItem(day.exercises, from, to) }
              : day,
          ),
          isDirty: true,
        })),

      toRoutineInput: () => {
        const { name, description, goal, days } = get()
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
