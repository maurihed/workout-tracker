import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { cancelJob } from "@/server/services/ai.service"
import { toAiJobDTO } from "@/features/ai/schemas/job"

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/ai/routines/[id]/cancel">,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { id } = await ctx.params
    return ok(toAiJobDTO(await cancelJob(session.user.id, id)))
  } catch (error) {
    return toApiError(error)
  }
}
