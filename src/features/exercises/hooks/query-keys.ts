import type { ExerciseListInput } from "@/features/exercises/schemas/exercise"

export const exerciseKeys = {
  all: ["exercises"] as const,
  list: (params: Partial<ExerciseListInput>) =>
    [...exerciseKeys.all, "list", params] as const,
}
