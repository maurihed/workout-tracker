import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { completeSessionSchema } from "@/features/workouts/schemas/session"
import { completeSession } from "@/server/services/session.service"

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sessions/[sessionId]/complete">,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { sessionId } = await ctx.params
    const parsed = completeSessionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid completion", parsed.error.flatten())
    return ok(await completeSession(session.user.id, sessionId, parsed.data.activeSeconds))
  } catch (error) {
    return toApiError(error)
  }
}
