import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { abandonSession } from "@/server/services/session.service"

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[sessionId]/abandon">,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { sessionId } = await ctx.params
    await abandonSession(session.user.id, sessionId)
    return ok({ abandoned: true })
  } catch (error) {
    return toApiError(error)
  }
}
