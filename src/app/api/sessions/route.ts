import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { startSessionSchema } from "@/features/workouts/schemas/session"
import { startSession } from "@/server/services/session.service"

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const parsed = startSessionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid session", parsed.error.flatten())
    return ok(await startSession(session.user.id, parsed.data.routineDayId), { status: 201 })
  } catch (error) {
    return toApiError(error)
  }
}
