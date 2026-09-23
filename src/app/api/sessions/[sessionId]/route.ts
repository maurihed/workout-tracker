import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { sessionStateSchema } from "@/features/workouts/schemas/session"
import { getSession, replaceSessionState } from "@/server/services/session.service"

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[sessionId]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { sessionId } = await ctx.params
    return ok(await getSession(session.user.id, sessionId))
  } catch (error) {
    return toApiError(error)
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/sessions/[sessionId]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { sessionId } = await ctx.params
    const parsed = sessionStateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid session state", parsed.error.flatten())
    return ok(await replaceSessionState(session.user.id, sessionId, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
