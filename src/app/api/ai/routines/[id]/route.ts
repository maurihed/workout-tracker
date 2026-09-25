import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getJob } from "@/server/services/ai.service"
import { toAiJobDTO } from "@/features/ai/schemas/job"

export async function GET(_request: Request, ctx: RouteContext<"/api/ai/routines/[id]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { id } = await ctx.params
    return ok(toAiJobDTO(await getJob(session.user.id, id)))
  } catch (error) {
    return toApiError(error)
  }
}
