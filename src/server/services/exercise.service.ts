import "server-only"
import type { ExerciseListInput } from "@/features/exercises/schemas/exercise"
import * as exerciseRepository from "@/server/repositories/exercise.repository"

export async function listExercises(input: ExerciseListInput) {
  const rows = await exerciseRepository.list(input)
  const hasMore = rows.length > input.limit
  const items = hasMore ? rows.slice(0, input.limit) : rows
  const last = items.at(-1)
  return { items, nextCursor: hasMore && last ? last.id : null }
}
