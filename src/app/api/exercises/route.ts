import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import {
  toApiError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/api-error"
import { exerciseListQuerySchema } from "@/features/exercises/schemas/exercise"
import { listExercises } from "@/server/services/exercise.service"

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()

    const url = new URL(request.url)
    const parsed = exerciseListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    )
    if (!parsed.success) {
      throw new ValidationError("Invalid query", parsed.error.flatten())
    }
    return ok(await listExercises(parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
