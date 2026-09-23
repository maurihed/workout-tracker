import "server-only"
import { NotFoundError, ValidationError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import {
  getTemplateBySlug,
  type TemplateExercise,
} from "@/features/onboarding/templates/routine-templates"
import type {
  CreateRoutineInput,
  RoutineInput,
} from "@/features/routines/schemas/routine"
import { copyRoutineName } from "@/features/routines/lib/copy-name"
import {
  createBlank,
  createWithDays,
  deactivateActive,
  deleteByIdForUser,
  duplicateSource,
  findActiveByUser,
  findByIdForUser,
  findExercisesBySourceIds,
  listByUser,
  replaceDays,
  setActive,
  setOnboardedAtIfNull,
  withTransaction,
} from "@/server/repositories/routine.repository"

export type ResolvedExercise = {
  exerciseId: string
  sets: number
  reps: string
  restSeconds: number
}

/**
 * Pure, fail-closed mapping from a template's source ids to catalog exercise
 * ids. Throws `ValidationError` listing every unknown sourceId rather than
 * silently dropping exercises, so a partially-resolved routine can never be
 * written.
 */
export function resolveTemplateExercises(
  exercises: TemplateExercise[],
  bySourceId: Map<string, string>,
): ResolvedExercise[] {
  const missing = exercises.filter((e) => !bySourceId.has(e.sourceId)).map((e) => e.sourceId)
  if (missing.length > 0) {
    throw new ValidationError(`Template references unknown exercises: ${missing.join(", ")}`)
  }
  return exercises.map((e) => ({
    exerciseId: bySourceId.get(e.sourceId)!,
    sets: e.sets,
    reps: e.reps,
    restSeconds: e.restSeconds,
  }))
}

export async function getActiveRoutine(userId: string) {
  return findActiveByUser(userId)
}

export type RoutineDTO = NonNullable<Awaited<ReturnType<typeof getActiveRoutine>>>

export async function createRoutineFromTemplate(
  userId: string,
  slug: string,
): Promise<RoutineDTO> {
  const template = getTemplateBySlug(slug)
  if (!template) throw new NotFoundError("Template not found")

  const sourceIds = [
    ...new Set(template.days.flatMap((d) => d.exercises.map((e) => e.sourceId))),
  ]

  const { routine, onboarded } = await withTransaction(async (tx) => {
    // Fail closed before any write: resolve (and validate) every sourceId first.
    const catalog = await findExercisesBySourceIds(tx, sourceIds)
    const bySourceId = new Map(catalog.map((e) => [e.sourceId, e.id]))

    const days = template.days.map((day, dayIndex) => ({
      weekday: day.weekday,
      label: day.label,
      order: dayIndex,
      exercises: {
        create: resolveTemplateExercises(day.exercises, bySourceId).map((exercise, index) => ({
          exerciseId: exercise.exerciseId,
          order: index,
          targetSets: exercise.sets,
          targetReps: exercise.reps,
          restSeconds: exercise.restSeconds,
        })),
      },
    }))

    await deactivateActive(tx, userId)

    const created = await createWithDays(tx, {
      userId,
      name: template.name,
      nameEs: template.nameEs,
      description: template.description,
      descriptionEs: template.descriptionEs,
      goal: template.goal,
      source: "template",
      isActive: true,
      days: { create: days },
    })

    const { count } = await setOnboardedAtIfNull(tx, userId)

    return { routine: created, onboarded: count > 0 }
  })

  // Analytics events are emitted only after the transaction has committed.
  logger.info({ event: "routine.selected_from_template", userId, slug }, "routine selected")
  if (onboarded) {
    logger.info({ event: "onboarding.completed", userId }, "onboarding completed")
  }

  return routine
}

export async function createBlankRoutine(userId: string, input: CreateRoutineInput) {
  const routine = await createBlank(userId, input)
  logger.info({ event: "routine.created", userId, routineId: routine.id }, "routine created")
  return routine
}

export function listRoutines(userId: string) {
  return listByUser(userId)
}

export async function getRoutine(userId: string, id: string) {
  const routine = await findByIdForUser(userId, id)
  if (!routine) throw new NotFoundError("Routine not found")
  return routine
}

export async function replaceRoutine(userId: string, id: string, input: RoutineInput) {
  // Ownership is verified up front so an unstaked routine can never be written.
  const owned = await findByIdForUser(userId, id)
  if (!owned) throw new NotFoundError("Routine not found")

  const days = input.days.map((d, di) => ({
    weekday: d.weekday,
    label: d.label,
    order: di,
    exercises: d.exercises.map((e, ei) => ({ ...e, order: ei })),
  }))

  const routine = await withTransaction((tx) =>
    replaceDays(tx, id, days, {
      name: input.name,
      description: input.description,
      goal: input.goal,
    }),
  )
  logger.info({ event: "routine.updated", userId, routineId: id }, "routine updated")
  return routine
}

export async function activateRoutine(userId: string, id: string) {
  const owned = await findByIdForUser(userId, id)
  if (!owned) throw new NotFoundError("Routine not found")

  const routine = await withTransaction((tx) => setActive(tx, userId, id))
  logger.info({ event: "routine.activated", userId, routineId: id }, "routine activated")
  return routine
}

export async function duplicateRoutine(userId: string, id: string, locale: string) {
  const source = await duplicateSource(userId, id)
  if (!source) throw new NotFoundError("Routine not found")

  const name = copyRoutineName(source.name, locale)
  const routine = await withTransaction(async (tx) => {
    const created = await tx.routine.create({
      data: {
        userId,
        name,
        description: source.description,
        goal: source.goal,
        source: "manual",
        isActive: false,
      },
      select: { id: true },
    })
    return replaceDays(tx, created.id, source.days, {
      name,
      description: source.description,
      goal: source.goal,
    })
  })
  logger.info({ event: "routine.duplicated", userId, routineId: id }, "routine duplicated")
  return routine
}

export async function deleteRoutine(userId: string, id: string) {
  const count = await deleteByIdForUser(userId, id)
  if (count === 0) throw new NotFoundError("Routine not found")
  logger.info({ event: "routine.deleted", userId, routineId: id }, "routine deleted")
}
