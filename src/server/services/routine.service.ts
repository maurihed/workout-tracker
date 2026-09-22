import "server-only"
import { NotFoundError, ValidationError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import {
  getTemplateBySlug,
  type TemplateExercise,
} from "@/features/onboarding/templates/routine-templates"
import { findActiveByUser, routineSelect } from "@/server/repositories/routine.repository"

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

  return prisma.$transaction(async (tx) => {
    const catalog = await tx.exercise.findMany({
      where: { sourceId: { in: sourceIds } },
      select: { id: true, sourceId: true },
    })
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

    await tx.routine.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    })

    const routine = await tx.routine.create({
      data: {
        userId,
        name: template.name,
        description: template.description,
        goal: template.goal,
        source: "template",
        isActive: true,
        days: { create: days },
      },
      select: routineSelect,
    })

    await tx.profile.updateMany({
      where: { userId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    })

    logger.info({ event: "routine.selected_from_template", userId, slug }, "routine selected")
    logger.info({ event: "onboarding.completed", userId }, "onboarding completed")

    return routine
  })
}
