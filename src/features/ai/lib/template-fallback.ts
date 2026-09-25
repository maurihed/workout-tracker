import type { AiJobInput, GeneratedRoutine } from "@/features/ai/lib/contract"
import { normalizeCatalogKey, type CatalogIndex } from "@/features/ai/lib/resolve-exercises"
import { recommendTemplates } from "@/features/onboarding/lib/recommend-templates"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"

type GeneratedDay = GeneratedRoutine["days"][number]
type GeneratedExercise = GeneratedDay["exercises"][number]

type Prescription = {
  sets: number
  reps: string
  restSeconds: number
}

const DEFAULT_EXERCISES_PER_DAY = 4
const DEFAULT_PRESCRIPTION: Prescription = { sets: 3, reps: "10-12", restSeconds: 60 }

function humanizeSourceId(sourceId: string): string {
  const words = sourceId
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  if (words.length === 0) return "Exercise"
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function catalogItemAt(
  catalog: CatalogIndex,
  index: number,
): { sourceId: string; name: string } | null {
  if (catalog.all.length === 0) return null
  return catalog.all[index % catalog.all.length] ?? null
}

function buildMatchedExercise(
  entry: { sourceId: string; name: string },
  prescription: Prescription,
): GeneratedExercise {
  return {
    sourceId: entry.sourceId,
    name: entry.name,
    sets: prescription.sets,
    reps: prescription.reps,
    restSeconds: prescription.restSeconds,
    targetWeightKg: null,
    timerType: "none",
    workSeconds: null,
    rounds: null,
  }
}

function buildCustomExercise(sourceId: string, prescription: Prescription): GeneratedExercise {
  return {
    sourceId: null,
    name: humanizeSourceId(sourceId),
    sets: prescription.sets,
    reps: prescription.reps,
    restSeconds: prescription.restSeconds,
    targetWeightKg: null,
    timerType: "none",
    workSeconds: null,
    rounds: null,
  }
}

function spreadWeekday(index: number, total: number): number {
  if (total <= 1) return 0
  return Math.min(6, Math.floor((index * 7) / total))
}

function buildCatalogFill(catalog: CatalogIndex, count: number): GeneratedExercise[] {
  if (catalog.all.length === 0) {
    return Array.from({ length: count }, (_, index) =>
      buildCustomExercise(`Exercise ${index + 1}`, DEFAULT_PRESCRIPTION),
    )
  }

  const exercises: GeneratedExercise[] = []
  for (let index = 0; index < count; index += 1) {
    const item = catalogItemAt(catalog, index)
    if (!item) continue
    exercises.push(buildMatchedExercise(item, DEFAULT_PRESCRIPTION))
  }
  return exercises
}

export function buildFallbackRoutine(input: AiJobInput, catalog: CatalogIndex): GeneratedRoutine {
  const scored = recommendTemplates(
    {
      goal: input.goal,
      experience: input.experience,
      location: null,
      daysPerWeek: input.daysPerWeek,
      equipment: input.equipment,
    },
    ROUTINE_TEMPLATES,
  )
  const template = scored[0]?.template ?? null

  const days: GeneratedDay[] = []
  let substitutionCursor = 0

  for (let index = 0; index < input.daysPerWeek; index += 1) {
    const templateDay =
      template && template.days.length > 0
        ? (template.days[index % template.days.length] ?? null)
        : null

    const exercises: GeneratedExercise[] = []

    if (templateDay) {
      for (const templateExercise of templateDay.exercises) {
        const entry = catalog.bySourceId.get(normalizeCatalogKey(templateExercise.sourceId))
        if (entry) {
          exercises.push(buildMatchedExercise(entry, templateExercise))
          continue
        }

        const substitute = catalogItemAt(catalog, substitutionCursor)
        if (substitute) {
          substitutionCursor += 1
          exercises.push(buildMatchedExercise(substitute, templateExercise))
          continue
        }

        exercises.push(buildCustomExercise(templateExercise.sourceId, templateExercise))
      }
    }

    if (exercises.length === 0) {
      exercises.push(...buildCatalogFill(catalog, DEFAULT_EXERCISES_PER_DAY))
    }

    days.push({
      weekday: spreadWeekday(index, input.daysPerWeek),
      label: templateDay?.label ?? null,
      exercises,
    })
  }

  return {
    name: template?.name ?? "Custom Routine",
    goal: input.goal,
    days,
  }
}
