import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { sessionUpsertSchema } from "@/features/workouts/schemas/session"
import { getSession, upsertSession } from "@/server/services/session.service"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    if (!UUID.test(sessionId)) throw new ValidationError("Invalid session id")
    const parsed = sessionUpsertSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid session state", parsed.error.flatten())
    if (parsed.data.id !== sessionId) throw new ValidationError("Session id mismatch")
    return ok(await upsertSession(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
