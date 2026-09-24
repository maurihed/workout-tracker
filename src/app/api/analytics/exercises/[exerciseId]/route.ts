import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getExerciseProgress } from "@/server/services/progress.service"

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/analytics/exercises/[exerciseId]">,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { exerciseId } = await ctx.params
    return ok(await getExerciseProgress(session.user.id, exerciseId))
  } catch (error) {
    return toApiError(error)
  }
}
