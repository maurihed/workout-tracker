import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { activateRoutine } from "@/server/services/routine.service"

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/routines/[routineId]/activate">,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { routineId } = await ctx.params
    return ok(await activateRoutine(session.user.id, routineId))
  } catch (error) {
    return toApiError(error)
  }
}
