import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { acceptJob } from "@/server/services/ai.service"

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/ai/routines/[id]/accept">,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { id } = await ctx.params
    const result = await acceptJob(session.user.id, id)
    return ok(result, { status: 201 })
  } catch (error) {
    return toApiError(error)
  }
}
