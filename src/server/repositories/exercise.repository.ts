import "server-only"
import { prisma } from "@/lib/prisma"
import type { ExerciseListInput } from "@/features/exercises/schemas/exercise"

export async function list(input: ExerciseListInput) {
  const { q, muscle, equipment, limit, cursor } = input
  return prisma.exercise.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      ...(muscle ? { primaryMuscles: { has: muscle } } : {}),
      ...(equipment ? { equipment } : {}),
      isCustom: false,
    },
    orderBy: { name: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      sourceId: true,
      name: true,
      nameEs: true,
      equipment: true,
      level: true,
      category: true,
      primaryMuscles: true,
      images: true,
    },
  })
}
