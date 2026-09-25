import type { AiRoutine, AiRoutineExercise } from "@/features/ai/lib/contract"
import type { HistoryAnchor, HistoryIndex } from "@/features/ai/lib/history"
import { parseRepRange } from "@/features/ai/lib/reps"
import { normalizeCatalogKey } from "@/features/ai/lib/resolve-exercises"

export const PERSONALIZATION_VERSION = "1"
const LOAD_INCREASE = 1.05
const LOAD_DELOAD = 0.95
const LOAD_MIN_RATIO = 0.9
const LOAD_MAX_RATIO = 1.1
const LOAD_INCREMENT_KG = 2.5

export function roundToIncrement(kg: number, increment = LOAD_INCREMENT_KG): number {
  return Math.round(kg / increment) * increment
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function anchorFor(exercise: AiRoutineExercise, index: HistoryIndex): HistoryAnchor | null {
  if (exercise.exerciseId) {
    const byId = index.byExerciseId.get(exercise.exerciseId)
    if (byId) return byId
  }
  const name = exercise.customName ?? exercise.name
  if (name) {
    const byName = index.byName.get(normalizeCatalogKey(name))
    if (byName) return byName
  }
  return null
}

function nextLoad(anchor: HistoryAnchor, reps: { min: number; max: number }): number | null {
  if (anchor.weightKg <= 0) return null

  const base = roundToIncrement(anchor.weightKg)
  const min = roundToIncrement(anchor.weightKg * LOAD_MIN_RATIO)
  const max = roundToIncrement(anchor.weightKg * LOAD_MAX_RATIO)

  let direction: -1 | 0 | 1 = 0
  let factor = 1
  if (anchor.reps >= reps.max) {
    factor = LOAD_INCREASE
    direction = 1
  } else if (anchor.reps < reps.min) {
    factor = LOAD_DELOAD
    direction = -1
  }

  let next = roundToIncrement(clamp(anchor.weightKg * factor, anchor.weightKg * LOAD_MIN_RATIO, anchor.weightKg * LOAD_MAX_RATIO))
  if (direction !== 0 && next === base) {
    next = roundToIncrement(
      clamp(anchor.weightKg + direction * LOAD_INCREMENT_KG, anchor.weightKg * LOAD_MIN_RATIO, anchor.weightKg * LOAD_MAX_RATIO),
    )
  }
  next = clamp(next, min, max)
  return next > 0 ? next : null
}

export function personalizeRoutine(
  routine: AiRoutine,
  index: HistoryIndex,
): { routine: AiRoutine; applied: number } {
  let applied = 0
  const days = routine.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      const anchor = anchorFor(exercise, index)
      if (!anchor) return exercise
      const reps = parseRepRange(exercise.reps)
      if (!reps) return exercise
      const next = nextLoad(anchor, reps)
      if (next == null) return exercise
      applied += 1
      return { ...exercise, targetWeightKg: next }
    }),
  }))
  return { routine: { ...routine, days }, applied }
}
